import {
  createTRPCRouter,
  publicReadProcedure,
  protectedProcedure,
  sellerProcedure,
  strictSellerProcedure,
  strictVerifiedBuyerProcedure,
} from "../trpc";
import {
  conversations,
  listings,
  notifications,
  offers,
  orders,
  users,
  watchlist,
} from "../db/schema";
import { eq, and, gt, desc, isNull, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { stripe } from "@/lib/stripe";
import {
  ShippingBookingReviewError,
  SHIPPING_PAYMENT_BOOKABILITY_BUFFER_MS,
  requireShippingBookingSnapshotForOrder,
} from "@/server/services/shipping-workflow";
import { cancelUncapturedOrderPayment } from "@/server/services/payment-intent-cancellation";
import { releaseReservedInventory } from "@/server/services/inventory-reservation";
import { inngest } from "@/lib/inngest/client";
import { buildCheckoutStartedEvent } from "@/lib/inngest/events";
import { appendAuditEvent } from "@/server/services/audit-ledger";
import {
  getConnectAccountIdempotencyKey,
  isStripeConnectAccountReady,
} from "@/server/services/stripe-connect-policy";
import {
  requirePaymentIntentTaxCalculation,
  TaxReadinessError,
} from "@/server/services/stripe-tax";
import {
  classifyPaymentIntentFinalizationLoss,
  hasActivePaymentIntentPreparation,
} from "@/server/services/payment-intent-preparation";
import { openReconciliationCase } from "@/server/services/reconciliation-cases";
import { assertListingVisibleToViewer } from "@/server/security/listing-visibility";

export const paymentRouter = createTRPCRouter({
  // Check if seller has completed payment setup
  checkSellerPaymentReady: publicReadProcedure
    .input(z.object({ sellerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const seller = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.sellerId),
        columns: { id: true, stripeOnboardingComplete: true },
      });

      if (!seller) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Seller not found" });
      }

      return { ready: seller.stripeOnboardingComplete };
    }),

  // Create (or reuse) a payment intent for an order
  createPaymentIntent: strictVerifiedBuyerProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const claimToken = randomUUID();
      const preparation = await ctx.db.transaction(async (tx) => {
        const orderRows = await tx
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            buyerId: orders.buyerId,
            sellerId: orders.sellerId,
            totalPrice: orders.totalPrice,
            listingId: orders.listingId,
            quantitySqFt: orders.quantitySqFt,
            status: orders.status,
            paymentStatus: orders.paymentStatus,
            escrowStatus: orders.escrowStatus,
            inventoryReleasedAt: orders.inventoryReleasedAt,
            stripePaymentIntentId: orders.stripePaymentIntentId,
            paymentIntentClaimToken: orders.paymentIntentClaimToken,
            paymentIntentClaimedAt: orders.paymentIntentClaimedAt,
            selectedQuoteId: orders.selectedQuoteId,
            selectedCarrier: orders.selectedCarrier,
            carrierRate: orders.carrierRate,
            shippingPrice: orders.shippingPrice,
            shippingZip: orders.shippingZip,
            quoteExpiresAt: orders.quoteExpiresAt,
            shippingBookingSnapshot: orders.shippingBookingSnapshot,
            taxStatus: orders.taxStatus,
            taxLiability: orders.taxLiability,
            taxAmount: orders.taxAmount,
            stripeTaxCalculationId: orders.stripeTaxCalculationId,
            taxCalculationEvidence: orders.taxCalculationEvidence,
            sellerStripeAccountId: users.stripeAccountId,
            sellerStripeOnboardingComplete: users.stripeOnboardingComplete,
          })
          .from(orders)
          .innerJoin(users, eq(users.id, orders.sellerId))
          .where(eq(orders.id, input.orderId))
          .for("update");

        const order = orderRows[0];
        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          });
        }

        if (order.buyerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only pay for your own orders",
          });
        }

        if (order.status !== "pending") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Order cannot be paid in "${order.status}" status`,
          });
        }

        if (order.inventoryReleasedAt || order.escrowStatus !== "held") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This order no longer has reserved inventory and cannot be paid.",
          });
        }

        if (
          order.paymentStatus === "succeeded" ||
          order.paymentStatus === "refunded" ||
          order.paymentStatus === "partially_refunded"
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This order has already been paid",
          });
        }

        if (
          !order.sellerStripeAccountId ||
          !order.sellerStripeOnboardingComplete
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Seller has not completed payment setup",
          });
        }

        try {
          requireShippingBookingSnapshotForOrder({
            snapshot: order.shippingBookingSnapshot,
            order: {
              selectedQuoteId: order.selectedQuoteId,
              listingId: order.listingId,
              buyerId: order.buyerId,
              quantitySqFt: order.quantitySqFt,
              shippingZip: order.shippingZip,
              carrierRate: order.carrierRate,
              shippingPrice: order.shippingPrice,
              selectedCarrier: order.selectedCarrier,
              quoteExpiresAt: order.quoteExpiresAt,
            },
            // Quote must remain usable long enough for card entry + confirmation.
            now: new Date(Date.now() + SHIPPING_PAYMENT_BOOKABILITY_BUFFER_MS),
          });
        } catch (error) {
          if (!(error instanceof ShippingBookingReviewError)) throw error;
          return {
            kind: "requote" as const,
            orderId: order.id,
            paymentIntentId: order.stripePaymentIntentId,
            expectedAmountCents: Math.round(Number(order.totalPrice) * 100),
          };
        }

        let taxCalculationId: string | null;
        try {
          taxCalculationId = requirePaymentIntentTaxCalculation(order);
        } catch (error) {
          if (!(error instanceof TaxReadinessError)) throw error;
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
            cause: error,
          });
        }

        if (
          hasActivePaymentIntentPreparation({
            claimToken: order.paymentIntentClaimToken,
            claimedAt: order.paymentIntentClaimedAt,
          })
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Payment preparation is already in progress. Please wait a moment and try again.",
          });
        }

        const claimedAt = new Date();
        const [claimed] = await tx
          .update(orders)
          .set({
            paymentIntentClaimToken: claimToken,
            paymentIntentClaimedAt: claimedAt,
            updatedAt: claimedAt,
          })
          .where(eq(orders.id, order.id))
          .returning({ id: orders.id });
        if (!claimed) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Unable to claim payment preparation for this order",
          });
        }

        return {
          kind: "prepare" as const,
          order,
          taxCalculationId,
          checkoutEvent: {
            checkoutId: order.id,
            buyerId: order.buyerId,
            listingId: order.listingId,
            quantitySqFt: Number(order.quantitySqFt),
            totalPrice: Number(order.totalPrice),
          },
        };
      });

      if (preparation.kind === "requote") {
        await cancelUncapturedOrderPayment({
          orderId: preparation.orderId,
          paymentIntentId: preparation.paymentIntentId,
          expectedAmountCents: preparation.expectedAmountCents,
        });

        await ctx.db.transaction(async (tx) => {
          const [current] = await tx
            .select({
              id: orders.id,
              status: orders.status,
              paymentStatus: orders.paymentStatus,
              inventoryReleasedAt: orders.inventoryReleasedAt,
            })
            .from(orders)
            .where(eq(orders.id, preparation.orderId))
            .for("update");
          if (!current) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Order not found",
            });
          }
          if (current.status === "cancelled" && current.inventoryReleasedAt) {
            return;
          }

          const [cancelled] = await tx
            .update(orders)
            .set({
              status: "cancelled",
              paymentStatus: "failed",
              escrowStatus: "refunded",
              paymentIntentClaimToken: null,
              paymentIntentClaimedAt: null,
              cancelledAt: new Date(),
              updatedAt: new Date(),
              notes:
                "Cancelled automatically: shipping quote requires a fresh checkout",
            })
            .where(
              and(
                eq(orders.id, preparation.orderId),
                eq(orders.status, "pending"),
                isNull(orders.inventoryReleasedAt),
                sql`${orders.paymentStatus} NOT IN ('succeeded', 'refunded', 'partially_refunded')`,
              ),
            )
            .returning({ id: orders.id });
          if (!cancelled) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "The order changed while its expired shipping quote was being cancelled. Refresh the order before continuing.",
            });
          }
          await releaseReservedInventory({
            db: tx,
            orderId: preparation.orderId,
            reason: "shipping_quote_requires_fresh_checkout",
          });
        });

        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This shipping quote can no longer be safely booked. The old order was cancelled and its inventory was released; please start checkout again with a fresh shipping option.",
        });
      }

      const { order, taxCalculationId } = preparation;
      const reusableStatuses = new Set([
        "requires_payment_method",
        "requires_confirmation",
        "requires_action",
        "processing",
      ]);

      let result: {
        clientSecret: string;
        paymentIntentId: string;
        checkoutEvent: typeof preparation.checkoutEvent;
      };
      try {
        const sellerAccount = await stripe.accounts.retrieve(
          order.sellerStripeAccountId!,
        );
        if (
          !sellerAccount.payouts_enabled ||
          sellerAccount.capabilities?.transfers !== "active"
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Seller payout account is not ready to receive funds",
          });
        }

        const paymentIntent = order.stripePaymentIntentId
          ? await stripe.paymentIntents.retrieve(order.stripePaymentIntentId)
          : await stripe.paymentIntents.create(
              {
                amount: Math.round(Number(order.totalPrice) * 100),
                currency: "usd",
                metadata: {
                  orderId: order.id,
                  orderNumber: order.orderNumber,
                  buyerId: order.buyerId,
                  sellerId: order.sellerId,
                  taxLiability: order.taxLiability,
                  taxAmountCents: String(
                    Math.round(Number(order.taxAmount) * 100),
                  ),
                },
                ...(taxCalculationId
                  ? {
                      hooks: {
                        inputs: {
                          tax: { calculation: taxCalculationId },
                        },
                      },
                    }
                  : {}),
                transfer_group: `order_${order.id}`,
              },
              {
                idempotencyKey: `order-payment-intent:${order.id}`,
              },
            );

        const expectedAmount = Math.round(Number(order.totalPrice) * 100);
        if (
          paymentIntent.metadata.orderId !== order.id ||
          paymentIntent.amount !== expectedAmount ||
          paymentIntent.currency !== "usd" ||
          (taxCalculationId
            ? paymentIntent.hooks?.inputs?.tax?.calculation !== taxCalculationId
            : Boolean(paymentIntent.hooks?.inputs?.tax?.calculation))
        ) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Stored payment intent does not match this order",
          });
        }
        if (paymentIntent.status === "succeeded") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Payment has already been completed for this order",
          });
        }
        if (!reusableStatuses.has(paymentIntent.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Payment intent cannot be reused in "${paymentIntent.status}" status`,
          });
        }
        if (!paymentIntent.client_secret) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Payment intent has no client secret",
          });
        }

        const [finalized] = await ctx.db
          .update(orders)
          .set({
            stripePaymentIntentId: paymentIntent.id,
            paymentStatus: "pending",
            paymentIntentClaimToken: null,
            paymentIntentClaimedAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(orders.id, order.id),
              eq(orders.paymentIntentClaimToken, claimToken),
              eq(orders.status, "pending"),
              eq(orders.escrowStatus, "held"),
              isNull(orders.inventoryReleasedAt),
              sql`${orders.paymentStatus} NOT IN ('succeeded', 'refunded', 'partially_refunded')`,
              order.stripePaymentIntentId
                ? eq(
                    orders.stripePaymentIntentId,
                    order.stripePaymentIntentId,
                  )
                : isNull(orders.stripePaymentIntentId),
            ),
          )
          .returning({ id: orders.id });

        if (!finalized) {
          const current = await ctx.db.query.orders.findFirst({
            where: eq(orders.id, order.id),
            columns: {
              status: true,
              paymentStatus: true,
              escrowStatus: true,
              inventoryReleasedAt: true,
              stripePaymentIntentId: true,
              paymentIntentClaimToken: true,
              totalPrice: true,
              selectedQuoteId: true,
              listingId: true,
              buyerId: true,
              quantitySqFt: true,
              shippingZip: true,
              carrierRate: true,
              shippingPrice: true,
              selectedCarrier: true,
              quoteExpiresAt: true,
              shippingBookingSnapshot: true,
              taxStatus: true,
              taxLiability: true,
              taxAmount: true,
              stripeTaxCalculationId: true,
              taxCalculationEvidence: true,
            },
          });
          let currentEconomicsMatch = false;
          if (current) {
            try {
              requireShippingBookingSnapshotForOrder({
                snapshot: current.shippingBookingSnapshot,
                order: current,
                now: new Date(
                  Date.now() + SHIPPING_PAYMENT_BOOKABILITY_BUFFER_MS,
                ),
              });
              const currentTaxCalculationId =
                requirePaymentIntentTaxCalculation(current);
              currentEconomicsMatch =
                paymentIntent.amount ===
                  Math.round(Number(current.totalPrice) * 100) &&
                (currentTaxCalculationId
                  ? paymentIntent.hooks?.inputs?.tax?.calculation ===
                    currentTaxCalculationId
                  : !paymentIntent.hooks?.inputs?.tax?.calculation);
            } catch {
              currentEconomicsMatch = false;
            }
          }
          const finalizationLoss = classifyPaymentIntentFinalizationLoss({
            expectedClaimToken: claimToken,
            preparedPaymentIntentId: paymentIntent.id,
            current: current
              ? {
                  paymentIntentClaimToken:
                    current.paymentIntentClaimToken,
                  stripePaymentIntentId: current.stripePaymentIntentId,
                  status: current.status,
                  paymentStatus: current.paymentStatus,
                  escrowStatus: current.escrowStatus,
                  inventoryReleasedAt: current.inventoryReleasedAt,
                }
              : null,
            economicsMatch: currentEconomicsMatch,
          });
          if (finalizationLoss === "already_finalized") {
            result = {
              clientSecret: paymentIntent.client_secret,
              paymentIntentId: paymentIntent.id,
              checkoutEvent: preparation.checkoutEvent,
            };
          } else if (finalizationLoss === "newer_claim") {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "A newer payment preparation attempt owns this order. Please wait and retry.",
            });
          } else {
            try {
              await cancelUncapturedOrderPayment({
                orderId: order.id,
                paymentIntentId: paymentIntent.id,
                expectedAmountCents: expectedAmount,
              });
            } catch (cancelError) {
              await openReconciliationCase(ctx.db, {
                caseKey: `payment-intent-finalization:${order.id}`,
                type: "payment_mismatch",
                source: "stripe",
                severity: "critical",
                title: "Payment intent requires reconciliation",
                summary:
                  cancelError instanceof Error
                    ? cancelError.message
                    : "Prepared PaymentIntent could not be cancelled after local order state changed",
                orderId: order.id,
                externalReference: paymentIntent.id,
                amountCents: expectedAmount,
                details: {
                  claimToken,
                  currentStatus: current?.status ?? null,
                  currentPaymentStatus: current?.paymentStatus ?? null,
                },
              });
            }
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "The order changed while payment was being prepared. Refresh the order before trying again.",
            });
          }
        } else {
          result = {
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            checkoutEvent: preparation.checkoutEvent,
          };
        }
      } catch (error) {
        await ctx.db
          .update(orders)
          .set({
            paymentIntentClaimToken: null,
            paymentIntentClaimedAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(orders.id, order.id),
              eq(orders.paymentIntentClaimToken, claimToken),
            ),
          )
          .catch((claimError) => {
            console.error("Failed to release payment preparation claim", {
              orderId: order.id,
              claimError,
            });
          });
        throw error;
      }

      try {
        await inngest.send(
          buildCheckoutStartedEvent({
            ...result.checkoutEvent,
            paymentIntentId: result.paymentIntentId,
          }),
        );
      } catch {
        // Reminder analytics must never turn a successfully prepared Stripe
        // checkout into a buyer-visible payment failure.
        console.error("Failed to enqueue checkout/started event", {
          checkoutId: result.checkoutEvent.checkoutId,
        });
      }
      return {
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
      };
    }),

  // Get payment status for an order
  getPaymentStatus: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
        columns: {
          id: true,
          buyerId: true,
          sellerId: true,
          paymentStatus: true,
          stripePaymentIntentId: true,
        },
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      if (
        order.buyerId !== ctx.user.id &&
        order.sellerId !== ctx.user.id &&
        ctx.user.role !== "admin"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      return {
        orderId: order.id,
        paymentStatus: order.paymentStatus,
        stripePaymentIntentId: order.stripePaymentIntentId,
      };
    }),

  // Create Stripe Connect account for seller (embedded onboarding — no redirect)
  createConnectAccount: strictSellerProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.stripeAccountId) {
      return { alreadyExists: true, accountId: ctx.user.stripeAccountId };
    }

    // Create new connected account
    const account = await stripe.accounts.create(
      {
        type: "express",
        email: ctx.user.email,
        metadata: {
          userId: ctx.user.id,
          businessName: ctx.user.businessName || "",
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      },
      {
        idempotencyKey: getConnectAccountIdempotencyKey(ctx.user.id),
      },
    );

    // A conditional claim plus Stripe idempotency prevents concurrent
    // onboarding requests from creating or attaching different accounts.
    const claimed = await ctx.db.transaction(async (tx) => {
      const [claimedAccount] = await tx
        .update(users)
        .set({
          stripeAccountId: account.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(users.id, ctx.user.id),
            isNull(users.stripeAccountId),
          ),
        )
        .returning({ stripeAccountId: users.stripeAccountId });

      if (claimedAccount) {
        await appendAuditEvent(tx, {
          actorType: "user",
          actorId: ctx.user.id,
          action: "stripe_connect_account.attached",
          entityType: "user",
          entityId: ctx.user.id,
          summary: "Attached a Stripe Connect account to the seller.",
          metadata: {
            stripeAccountId: account.id,
          },
        });
      }

      return claimedAccount;
    });

    if (!claimed) {
      const current = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.user.id),
        columns: { stripeAccountId: true },
      });
      if (!current?.stripeAccountId) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Payment onboarding changed concurrently. Please refresh and try again.",
        });
      }
      return {
        alreadyExists: true,
        accountId: current.stripeAccountId,
      };
    }

    return { alreadyExists: false, accountId: account.id };
  }),

  // Create Stripe Account Session for embedded components
  createAccountSession: strictSellerProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user.stripeAccountId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Stripe account not connected",
      });
    }

    const accountSession = await stripe.accountSessions.create({
      account: ctx.user.stripeAccountId,
      components: {
        account_onboarding: { enabled: true },
        payouts: {
          enabled: true,
          features: {
            instant_payouts: true,
            standard_payouts: true,
            edit_payout_schedule: true,
            external_account_collection: true,
          },
        },
        payments: {
          enabled: true,
          features: {
            refund_management: true,
            dispute_management: true,
            capture_payments: true,
          },
        },
        account_management: {
          enabled: true,
          features: { external_account_collection: true },
        },
        notification_banner: { enabled: true },
      },
    });

    return { clientSecret: accountSession.client_secret };
  }),

  // Check Stripe Connect account status
  getConnectStatus: strictSellerProcedure.query(async ({ ctx }) => {
    if (!ctx.user.stripeAccountId) {
      return { connected: false, onboardingComplete: false };
    }

    try {
      const account = await stripe.accounts.retrieve(
        ctx.user.stripeAccountId
      );

      const onboardingComplete = isStripeConnectAccountReady(account);

      // Update DB if status changed
      if (onboardingComplete !== ctx.user.stripeOnboardingComplete) {
        await ctx.db
          .update(users)
          .set({
            stripeOnboardingComplete: onboardingComplete,
            updatedAt: new Date(),
          })
          .where(eq(users.id, ctx.user.id));
      }

      const requirements = account.requirements;
      const pastDue = requirements?.past_due ?? [];
      const currentlyDue = requirements?.currently_due ?? [];
      const requiresAction = pastDue.length > 0 || currentlyDue.length > 0;
      const disabledReason = requirements?.disabled_reason ?? null;

      return {
        connected: true,
        onboardingComplete,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        transfersEnabled: account.capabilities?.transfers === "active",
        requiresAction,
        pastDue: pastDue.length > 0,
        disabledReason,
      };
    } catch {
      return { connected: false, onboardingComplete: false };
    }
  }),

  // Create Stripe Express Dashboard login link for seller
  createLoginLink: strictSellerProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user.stripeAccountId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No Stripe account connected. Please complete onboarding first.",
      });
    }

    if (!ctx.user.stripeOnboardingComplete) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Please complete Stripe onboarding before accessing the dashboard.",
      });
    }

    const loginLink = await stripe.accounts.createLoginLink(
      ctx.user.stripeAccountId
    );

    return { url: loginLink.url };
  }),

  // Get seller payout history (orders where escrow was released)
  getPayoutHistory: sellerProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const where = and(
        eq(orders.sellerId, ctx.user.id),
        eq(orders.escrowStatus, "released")
      );

      const [items, countResult, summaryResult] = await Promise.all([
        ctx.db.query.orders.findMany({
          where,
          orderBy: [desc(orders.updatedAt)],
          limit: input.limit,
          offset,
          columns: {
            id: true,
            orderNumber: true,
            subtotal: true,
            sellerFee: true,
            sellerStripeFee: true,
            sellerFreightContribution: true,
            sellerPayout: true,
            stripeTransferId: true,
            escrowStatus: true,
            updatedAt: true,
          },
          with: {
            listing: {
              columns: { id: true, title: true },
            },
          },
        }),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(orders)
          .where(where),
        ctx.db
          .select({
            totalEarned: sql<number>`coalesce(sum(${orders.sellerPayout}), 0)::float`,
            totalSellerFreightContributions:
              sql<number>`coalesce(sum(${orders.sellerFreightContribution}), 0)::float`,
            totalOrders: sql<number>`count(*)::int`,
          })
          .from(orders)
          .where(where),
      ]);

      // Also get pending escrow amount
      const [pendingResult] = await ctx.db
        .select({
          pendingAmount: sql<number>`coalesce(sum(${orders.sellerPayout}), 0)::float`,
          pendingSellerFreightContributions:
            sql<number>`coalesce(sum(${orders.sellerFreightContribution}), 0)::float`,
          pendingCount: sql<number>`count(*)::int`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.sellerId, ctx.user.id),
            eq(orders.escrowStatus, "held")
          )
        );

      const total = countResult[0]?.count ?? 0;
      const summary = summaryResult[0] ?? {
        totalEarned: 0,
        totalSellerFreightContributions: 0,
        totalOrders: 0,
      };
      const pending = pendingResult ?? {
        pendingAmount: 0,
        pendingSellerFreightContributions: 0,
        pendingCount: 0,
      };

      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
        summary: {
          totalEarned: summary.totalEarned,
          totalSellerFreightContributions:
            summary.totalSellerFreightContributions,
          completedPayouts: summary.totalOrders,
          pendingEscrow: pending.pendingAmount,
          pendingSellerFreightContributions:
            pending.pendingSellerFreightContributions,
          pendingCount: pending.pendingCount,
        },
      };
    }),

  // Nudge seller to complete Stripe onboarding
  nudgeSellerToOnboard: strictVerifiedBuyerProcedure
    .input(
      z.object({
        listingId: z.string().uuid(),
        sellerId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const listing = assertListingVisibleToViewer(
        await ctx.db.query.listings.findFirst({
          where: eq(listings.id, input.listingId),
          columns: {
            id: true,
            sellerId: true,
            status: true,
            confirmationDueAt: true,
            lastConfirmedAt: true,
            territoryMode: true,
            allowedDestinationStates: true,
          },
        }),
        ctx.user,
        "Listing not found or no longer available",
      );

      if (input.sellerId && input.sellerId !== listing.sellerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Listing seller mismatch",
        });
      }

      const sellerId = listing.sellerId;
      const seller = await ctx.db.query.users.findFirst({
        where: eq(users.id, sellerId),
        columns: { id: true, stripeOnboardingComplete: true },
      });

      if (!seller) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Seller not found",
        });
      }

      if (seller.stripeOnboardingComplete) {
        return { alreadyReady: true };
      }

      const interestContext =
        ctx.user.role === "admin"
          ? true
          : Boolean(
              (await Promise.all([
                ctx.db.query.watchlist.findFirst({
                  where: and(
                    eq(watchlist.userId, ctx.user.id),
                    eq(watchlist.listingId, listing.id),
                  ),
                  columns: { id: true },
                }),
                ctx.db.query.conversations.findFirst({
                  where: and(
                    eq(conversations.buyerId, ctx.user.id),
                    eq(conversations.listingId, listing.id),
                    eq(conversations.sellerId, sellerId),
                  ),
                  columns: { id: true },
                }),
                ctx.db.query.offers.findFirst({
                  where: and(
                    eq(offers.buyerId, ctx.user.id),
                    eq(offers.listingId, listing.id),
                    eq(offers.sellerId, sellerId),
                  ),
                  columns: { id: true },
                }),
                ctx.db.query.orders.findFirst({
                  where: and(
                    eq(orders.buyerId, ctx.user.id),
                    eq(orders.listingId, listing.id),
                    eq(orders.sellerId, sellerId),
                    or(
                      eq(orders.status, "pending"),
                      eq(orders.status, "confirmed"),
                      eq(orders.status, "processing"),
                      eq(orders.status, "shipped"),
                      eq(orders.status, "delivered"),
                    ),
                  ),
                  columns: { id: true },
                }),
              ])).some(Boolean),
            );

      if (!interestContext) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A checkout, watchlist, or conversation context is required.",
        });
      }

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const idempotencyKey = `seller-onboarding-nudge:${listing.id}:${ctx.user.id}`;
      const recentNotification = await ctx.db.query.notifications.findFirst({
        where: and(
          eq(notifications.userId, sellerId),
          eq(notifications.type, "system"),
          gt(notifications.createdAt, twentyFourHoursAgo),
          sql`${notifications.data} ->> 'idempotencyKey' = ${idempotencyKey}`,
        ),
      });

      if (recentNotification) {
        return { notified: false, reason: "recently_notified" };
      }

      await ctx.db.insert(notifications).values({
        userId: sellerId,
        type: "system",
        title: "Someone wants to purchase your listing!",
        message:
          "A buyer is interested in your listing. Set up Stripe payments to start receiving orders.",
        data: {
          action: "seller_onboarding_nudge",
          buyerId: ctx.user.id,
          listingId: listing.id,
          idempotencyKey,
        },
      });

      return { notified: true };
    }),
});
