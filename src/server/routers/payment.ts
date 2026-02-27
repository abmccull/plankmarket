import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  verifiedProcedure,
  verifiedBuyerProcedure,
  sellerProcedure,
} from "../trpc";
import { orders, users, notifications } from "../db/schema";
import { eq, and, gt, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import Stripe from "stripe";
import { env } from "@/env";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-01-28.clover" as const,
});

export const paymentRouter = createTRPCRouter({
  // Check if seller has completed payment setup
  checkSellerPaymentReady: publicProcedure
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
  createPaymentIntent: verifiedBuyerProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const orderRows = await tx
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            buyerId: orders.buyerId,
            sellerId: orders.sellerId,
            totalPrice: orders.totalPrice,
            status: orders.status,
            paymentStatus: orders.paymentStatus,
            stripePaymentIntentId: orders.stripePaymentIntentId,
            sellerStripeAccountId: users.stripeAccountId,
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

        if (!order.sellerStripeAccountId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Seller has not completed payment setup",
          });
        }

        const reusableStatuses = new Set([
          "requires_payment_method",
          "requires_confirmation",
          "requires_action",
          "processing",
        ]);

        if (order.stripePaymentIntentId) {
          const existingIntent = await stripe.paymentIntents.retrieve(
            order.stripePaymentIntentId,
          );

          if (existingIntent.status === "succeeded") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Payment has already been completed for this order",
            });
          }

          if (reusableStatuses.has(existingIntent.status)) {
            if (!existingIntent.client_secret) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Existing payment intent has no client secret",
              });
            }

            return {
              clientSecret: existingIntent.client_secret,
              paymentIntentId: existingIntent.id,
            };
          }
        }

        // Create Stripe PaymentIntent — funds stay on platform for escrow.
        // Seller payout is transferred separately after shipment pickup.
        const paymentIntent = await stripe.paymentIntents.create(
          {
            amount: Math.round(Number(order.totalPrice) * 100),
            currency: "usd",
            metadata: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              buyerId: order.buyerId,
              sellerId: order.sellerId,
            },
          },
          {
            idempotencyKey: `order-payment-intent:${order.id}`,
          },
        );

        await tx
          .update(orders)
          .set({
            stripePaymentIntentId: paymentIntent.id,
            paymentStatus: "pending",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id));

        return {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        };
      });
    }),

  // Get payment status for an order
  getPaymentStatus: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
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
  createConnectAccount: sellerProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.stripeAccountId) {
      return { alreadyExists: true, accountId: ctx.user.stripeAccountId };
    }

    // Create new connected account
    const account = await stripe.accounts.create({
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
    });

    // Save account ID to user
    await ctx.db
      .update(users)
      .set({
        stripeAccountId: account.id,
        updatedAt: new Date(),
      })
      .where(eq(users.id, ctx.user.id));

    return { alreadyExists: false, accountId: account.id };
  }),

  // Create Stripe Account Session for embedded components
  createAccountSession: sellerProcedure.mutation(async ({ ctx }) => {
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
  getConnectStatus: sellerProcedure.query(async ({ ctx }) => {
    if (!ctx.user.stripeAccountId) {
      return { connected: false, onboardingComplete: false };
    }

    try {
      const account = await stripe.accounts.retrieve(
        ctx.user.stripeAccountId
      );

      const onboardingComplete =
        account.charges_enabled && account.payouts_enabled;

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
        requiresAction,
        pastDue: pastDue.length > 0,
        disabledReason,
      };
    } catch {
      return { connected: false, onboardingComplete: false };
    }
  }),

  // Create Stripe Express Dashboard login link for seller
  createLoginLink: sellerProcedure.mutation(async ({ ctx }) => {
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
            totalOrders: sql<number>`count(*)::int`,
          })
          .from(orders)
          .where(where),
      ]);

      // Also get pending escrow amount
      const [pendingResult] = await ctx.db
        .select({
          pendingAmount: sql<number>`coalesce(sum(${orders.sellerPayout}), 0)::float`,
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
      const summary = summaryResult[0] ?? { totalEarned: 0, totalOrders: 0 };
      const pending = pendingResult ?? { pendingAmount: 0, pendingCount: 0 };

      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
        summary: {
          totalEarned: summary.totalEarned,
          completedPayouts: summary.totalOrders,
          pendingEscrow: pending.pendingAmount,
          pendingCount: pending.pendingCount,
        },
      };
    }),

  // Nudge seller to complete Stripe onboarding
  nudgeSellerToOnboard: verifiedProcedure
    .input(z.object({ sellerId: z.string().uuid(), listingId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // 1. Check if seller already has stripeOnboardingComplete=true
      const seller = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.sellerId),
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

      // 2. Check if a "system" notification was already sent to this seller
      //    in the last 24 hours (spam protection)
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentNotification = await ctx.db.query.notifications.findFirst({
        where: and(
          eq(notifications.userId, input.sellerId),
          eq(notifications.type, "system"),
          gt(notifications.createdAt, twentyFourHoursAgo)
        ),
      });

      if (recentNotification) {
        return { notified: false, reason: "recently_notified" };
      }

      // 3. Insert a notification for the seller
      await ctx.db.insert(notifications).values({
        userId: input.sellerId,
        type: "system",
        title: "Someone wants to purchase your listing!",
        message:
          "A buyer is interested in your listing. Set up Stripe payments to start receiving orders.",
        data: { listingId: input.listingId },
      });

      // 4. Return success
      return { notified: true };
    }),
});
