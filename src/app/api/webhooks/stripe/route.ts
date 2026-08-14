import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/server/db";
import {
  orders,
  shipments,
  users,
  listings,
  listingPromotions,
  disputes,
  notifications,
  reconciliationCases,
  promotionCredits,
  agentConfigs,
} from "@/server/db/schema";
import { eq, and, sql, or, lte, isNull } from "drizzle-orm";
import { env } from "@/env";
import { inngest } from "@/lib/inngest/client";
import {
  buildOrderConfirmedEvent,
  buildOrderPaidEvent,
} from "@/lib/inngest/events";
import { releaseReservedInventory } from "@/server/services/inventory-reservation";
import { stripe } from "@/lib/stripe";
import { isStripeChargeRefunded } from "@/server/services/stripe-charge-state";
import { PRO_MONTHLY_CREDIT } from "@/lib/pro";
import {
  reconcileOrderRefundLifecycleFromStripe,
  reconcileOrderRefundFromStripe,
  reverseOrderTransferForDispute,
} from "@/server/services/refund";
import {
  canApplyPaymentIntentCanceled,
  canApplyPaymentIntentFailed,
  canApplyPaymentIntentProcessing,
  canApplyPaymentIntentSucceeded,
} from "@/server/services/order-transitions";
import {
  ShippingBookingReviewError,
  SHIPPING_DISPATCH_SAFETY_BUFFER_MS,
  requireShippingBookingSnapshotForOrder,
} from "@/server/services/shipping-workflow";
import { mapStripeSubscriptionStatus } from "@/server/services/stripe-webhook-policy";
import {
  openReconciliationCase,
  resolveReconciliationCaseByKey,
} from "@/server/services/reconciliation-cases";
import { isStripeConnectAccountReady } from "@/server/services/stripe-connect-policy";
import {
  findCommittedTaxTransaction,
  TaxReadinessError,
} from "@/server/services/stripe-tax";
import {
  claimStripeWebhookEvent,
  completeStripeWebhookEvent,
  failStripeWebhookEvent,
  receiveStripeWebhookEvent,
} from "@/server/services/stripe-webhook-inbox";

function getStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer,
): string {
  return typeof customer === "string" ? customer : customer.id;
}

function subscriptionEventIsCurrent(eventCreatedAt: Date) {
  return or(
    isNull(users.stripeSubscriptionEventCreatedAt),
    lte(users.stripeSubscriptionEventCreatedAt, eventCreatedAt),
  );
}

const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
export const STRIPE_WEBHOOK_MAX_BODY_BYTES = 256 * 1024;

async function readBoundedBody(
  request: NextRequest,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function notifyAdmins(params: {
  title: string;
  message: string;
  orderId: string;
}): Promise<void> {
  const adminUsers = await db.query.users.findMany({
    where: eq(users.role, "admin"),
    columns: { id: true },
  });
  if (adminUsers.length === 0) return;

  await db.insert(notifications).values(
    adminUsers.map((admin) => ({
      userId: admin.id,
      type: "system" as const,
      title: params.title,
      message: params.message,
      data: { orderId: params.orderId },
      read: false,
    })),
  );
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const declaredLength = Number(req.headers.get("content-length"));
  const contentType =
    req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ??
    null;

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > STRIPE_WEBHOOK_MAX_BODY_BYTES
  ) {
    return NextResponse.json(
      { error: "Payload too large" },
      { status: 413 },
    );
  }

  if (contentType !== "application/json") {
    return NextResponse.json(
      { error: "Expected an application/json request" },
      { status: 415 },
    );
  }

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const rawBody = await readBoundedBody(req, STRIPE_WEBHOOK_MAX_BODY_BYTES);
  if (!rawBody) {
    return NextResponse.json(
      { error: "Payload too large" },
      { status: 413 },
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      Buffer.from(rawBody),
      signature,
      webhookSecret,
    );
  } catch {
    console.error("Webhook signature verification failed");
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  try {
    const received = await receiveStripeWebhookEvent(event);
    if (received.completed) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    await inngest.send({
      id: `stripe-webhook:${event.id}`,
      name: "stripe/webhook-received",
      data: { eventId: event.id, eventType: event.type },
    });
    return NextResponse.json({ received: true, queued: true }, { status: 202 });
  } catch (error) {
    console.error("Stripe webhook inbox write failed", {
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Webhook could not be queued" },
      { status: 500 },
    );
  }
}

export async function processStripeWebhookEvent(eventId: string) {
  try {
    const claim = await claimStripeWebhookEvent(eventId);
    if (claim.state === "completed") {
      return { processed: false, duplicate: true } as const;
    }
    if (claim.state === "busy") {
      return { processed: false, busy: true } as const;
    }
    if (claim.state === "missing") {
      throw new Error(`Stripe webhook inbox event ${eventId} was not found`);
    }
    const event = claim.event;
    const claimStartedAt = claim.startedAt;

    try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;

        if (paymentIntent.metadata.type === "promotion") {
          // Promotion payment succeeded — activate the promotion
          const { listingId, tier, durationDays } = paymentIntent.metadata;
          if (listingId) {
            const now = new Date();
            const expiresAt = new Date(
              now.getTime() +
                parseInt(durationDays, 10) * 24 * 60 * 60 * 1000
            );

            await db
              .update(listingPromotions)
              .set({
                paymentStatus: "succeeded",
                isActive: true,
                startsAt: now,
                expiresAt,
              })
              .where(
                and(
                  eq(
                    listingPromotions.stripePaymentIntentId,
                    paymentIntent.id
                  )
                )
              );

            // Denormalize onto listings row
            await db
              .update(listings)
              .set({
                promotionTier: tier as "spotlight" | "featured" | "premium",
                promotionExpiresAt: expiresAt,
                updatedAt: now,
              })
              .where(eq(listings.id, listingId));
          }
        } else {
          const orderId = paymentIntent.metadata.orderId;
          if (orderId) {
            const order = await db.query.orders.findFirst({
              where: eq(orders.id, orderId),
              columns: {
                id: true,
                orderNumber: true,
                buyerId: true,
                listingId: true,
                quantitySqFt: true,
                status: true,
                paymentStatus: true,
                escrowStatus: true,
                totalPrice: true,
                stripePaymentIntentId: true,
                inventoryReleasedAt: true,
                selectedQuoteId: true,
                selectedCarrier: true,
                carrierRate: true,
                shippingPrice: true,
                shippingZip: true,
                quoteExpiresAt: true,
                shippingBookingSnapshot: true,
                taxLiability: true,
                taxStatus: true,
                taxAmount: true,
                stripeTaxCalculationId: true,
                stripeTaxTransactionId: true,
              },
            });

            if (!order || order.stripePaymentIntentId !== paymentIntent.id) {
              console.warn("Ignoring unmatched order payment success", {
                orderId,
                paymentIntentId: paymentIntent.id,
              });
              await openReconciliationCase(db, {
                caseKey: `payment-unmatched:${paymentIntent.id}`,
                type: "payment_mismatch",
                source: "stripe",
                severity: "critical",
                title: "Captured payment is not bound to its claimed order",
                summary: `Stripe reported a succeeded PaymentIntent that could not be matched to the order in its metadata.`,
                orderId: order?.id ?? null,
                externalReference: paymentIntent.id,
                amountCents: paymentIntent.amount_received,
                currency: paymentIntent.currency,
                details: {
                  metadataOrderId: orderId,
                  storedPaymentIntentId:
                    order?.stripePaymentIntentId ?? null,
                },
              });
              break;
            }

            const livePaymentIntent = await stripe.paymentIntents.retrieve(
              paymentIntent.id,
              { expand: ["latest_charge"] },
            );
            if (isStripeChargeRefunded(livePaymentIntent.latest_charge)) {
              break;
            }

            const expectedAmountCents = Math.round(
              Number(order.totalPrice) * 100,
            );
            if (
              livePaymentIntent.amount_received !== expectedAmountCents ||
              livePaymentIntent.currency.toLowerCase() !== "usd"
            ) {
              const mismatchMessage = `PaymentIntent ${paymentIntent.id} captured ${paymentIntent.amount_received} ${paymentIntent.currency}, expected ${expectedAmountCents} usd. Shipment dispatch is blocked pending reconciliation.`;
              const [markedForReconciliation] = await db
                .update(orders)
                .set({
                  paymentStatus: "reconciliation_required",
                  escrowStatus: "disputed",
                  transferFailedAt: new Date(),
                  transferError: mismatchMessage,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(orders.id, orderId),
                    eq(orders.stripePaymentIntentId, paymentIntent.id),
                    sql`${orders.paymentStatus} NOT IN ('refunded', 'partially_refunded')`,
                  ),
                )
                .returning({ id: orders.id });
              if (markedForReconciliation) {
                await openReconciliationCase(db, {
                  caseKey: `payment-mismatch:${order.id}`,
                  type: "payment_mismatch",
                  source: "stripe",
                  severity: "critical",
                  title: "Captured payment does not match order",
                  summary: mismatchMessage,
                  orderId: order.id,
                  externalReference: paymentIntent.id,
                  amountCents: paymentIntent.amount_received,
                  currency: paymentIntent.currency,
                  details: {
                    expectedAmountCents,
                    actualAmountCents: paymentIntent.amount_received,
                    expectedCurrency: "usd",
                    actualCurrency: paymentIntent.currency,
                  },
                });
                await notifyAdmins({
                  title: "Payment Reconciliation Required",
                  message: mismatchMessage,
                  orderId,
                });
              }
              break;
            }

            if (
              order.taxStatus !== "disabled" &&
              order.taxLiability !== "platform"
            ) {
              throw new TaxReadinessError(
                "TAX_ASSOCIATION_INCOMPLETE",
                `Order ${order.id} has a tax liability context that is not supported by this platform PaymentIntent.`,
              );
            }

            if (order.taxLiability === "platform") {
              const calculationId = order.stripeTaxCalculationId;
              if (
                !calculationId ||
                paymentIntent.hooks?.inputs?.tax?.calculation !== calculationId
              ) {
                throw new TaxReadinessError(
                  "TAX_ASSOCIATION_INCOMPLETE",
                  `PaymentIntent ${paymentIntent.id} is not bound to the order's authoritative tax calculation.`,
                );
              }

              if (
                order.taxStatus !== "committed" ||
                !order.stripeTaxTransactionId
              ) {
                try {
                  const committedTax = await findCommittedTaxTransaction({
                    paymentIntentId: paymentIntent.id,
                    expectedCalculationId: calculationId,
                  });
                  await db
                    .update(orders)
                    .set({
                      taxStatus: "committed",
                      stripeTaxTransactionId:
                        committedTax.transactionId,
                      taxCommittedAt: new Date(),
                      updatedAt: new Date(),
                    })
                    .where(
                      and(
                        eq(orders.id, order.id),
                        eq(
                          orders.stripeTaxCalculationId,
                          calculationId,
                        ),
                        sql`${orders.taxStatus} IN ('calculated', 'reconciliation_required')`,
                      ),
                    );
                  await resolveReconciliationCaseByKey(db, {
                    caseKey: `tax-commit:${order.id}`,
                    resolution: `Stripe Tax transaction ${committedTax.transactionId} was verified for PaymentIntent ${paymentIntent.id}.`,
                  });
                } catch (error) {
                  const message =
                    error instanceof Error
                      ? error.message
                      : "Stripe Tax transaction commitment could not be verified.";
                  await db
                    .update(orders)
                    .set({
                      taxStatus: "reconciliation_required",
                      updatedAt: new Date(),
                    })
                    .where(eq(orders.id, order.id));
                  await openReconciliationCase(db, {
                    caseKey: `tax-commit:${order.id}`,
                    type: "payment_mismatch",
                    source: "stripe",
                    severity: "critical",
                    title: `Tax transaction reconciliation: ${order.orderNumber}`,
                    summary:
                      "Payment succeeded, but the authoritative Stripe Tax transaction has not been verified. Shipment dispatch and seller transfer remain blocked until webhook retry or operator reconciliation succeeds.",
                    orderId: order.id,
                    externalReference: paymentIntent.id,
                    amountCents: Math.round(
                      Number(order.taxAmount) * 100,
                    ),
                    details: {
                      calculationId,
                      reason: message,
                    },
                  });
                  throw error;
                }
              }
            } else if (
              Number(order.taxAmount) !== 0 ||
              order.stripeTaxCalculationId
            ) {
              throw new TaxReadinessError(
                "TAX_ASSOCIATION_INCOMPLETE",
                `Disabled-tax order ${order.id} contains contradictory calculation evidence.`,
              );
            }

            const providerShipment = await db.query.shipments.findFirst({
              where: eq(shipments.orderId, orderId),
              columns: {
                priority1ShipmentId: true,
                status: true,
                isDryRun: true,
              },
            });
            const providerAlreadyBooked = Boolean(
              providerShipment?.priority1ShipmentId &&
                !providerShipment.isDryRun &&
                providerShipment.status !== "pending" &&
                providerShipment.status !== "cancelled",
            );
            let bookingFailureMessage: string | null = null;
            if (!providerAlreadyBooked) {
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
                  now: new Date(
                    Date.now() + SHIPPING_DISPATCH_SAFETY_BUFFER_MS,
                  ),
                });
              } catch (error) {
                if (!(error instanceof ShippingBookingReviewError)) throw error;
                bookingFailureMessage =
                  "The captured payment could not be dispatched because its shipping quote was expired or no longer matched the durable booking details.";
              }
            }

            const outcome = await db.transaction(async (tx) => {
              const [lockedOrder] = await tx
                .select({
                  status: orders.status,
                  paymentStatus: orders.paymentStatus,
                  escrowStatus: orders.escrowStatus,
                  stripePaymentIntentId: orders.stripePaymentIntentId,
                  inventoryReleasedAt: orders.inventoryReleasedAt,
                })
                .from(orders)
                .where(eq(orders.id, orderId))
                .for("update");

              if (
                !lockedOrder ||
                lockedOrder.stripePaymentIntentId !== paymentIntent.id
              ) {
                return "ignored" as const;
              }

              const alreadyDispatchable =
                !bookingFailureMessage &&
                lockedOrder.paymentStatus === "succeeded" &&
                lockedOrder.escrowStatus === "held" &&
                !lockedOrder.inventoryReleasedAt &&
                ["confirmed", "processing", "shipped", "delivered"].includes(
                  lockedOrder.status,
                );
              if (alreadyDispatchable) return "dispatch" as const;

              if (
                !bookingFailureMessage &&
                lockedOrder.escrowStatus === "held" &&
                canApplyPaymentIntentSucceeded({
                  orderStatus: lockedOrder.status,
                  paymentStatus: lockedOrder.paymentStatus,
                  storedPaymentIntentId: lockedOrder.stripePaymentIntentId,
                  eventPaymentIntentId: paymentIntent.id,
                  inventoryReleasedAt: lockedOrder.inventoryReleasedAt,
                })
              ) {
                await tx
                  .update(orders)
                  .set({
                    paymentStatus: "succeeded",
                    status: "confirmed",
                    confirmedAt: new Date(),
                    updatedAt: new Date(),
                  })
                  .where(eq(orders.id, orderId));
                return "dispatch" as const;
              }

              if (
                lockedOrder.paymentStatus === "refunded" ||
                lockedOrder.paymentStatus === "partially_refunded"
              ) {
                return "ignored" as const;
              }
              if (
                lockedOrder.paymentStatus === "succeeded" &&
                lockedOrder.escrowStatus === "released"
              ) {
                // A replay after seller payout is terminal success. Refunding
                // here would refund the buyer without reversing the already
                // released seller transfer.
                return "ignored" as const;
              }
              if (lockedOrder.escrowStatus === "disputed") {
                if (lockedOrder.paymentStatus !== "succeeded") {
                  await tx
                    .update(orders)
                    .set({
                      paymentStatus: "succeeded",
                      updatedAt: new Date(),
                    })
                    .where(eq(orders.id, orderId));
                }
                return "ignored" as const;
              }

              return "refund" as const;
            });

            if (outcome === "refund") {
              // A late success after local cancellation must be refunded, not
              // allowed to resurrect the order or consume released inventory.
              const refund = await stripe.refunds.create(
                {
                  payment_intent: paymentIntent.id,
                  amount: paymentIntent.amount_received || paymentIntent.amount,
                  metadata: {
                    orderId,
                    reason: bookingFailureMessage
                      ? "shipping_quote_unbookable_after_capture"
                      : "late_payment_after_order_closed",
                  },
                },
                {
                  idempotencyKey: `late-order-payment-refund:${paymentIntent.id}`,
                },
              );

              const reconciliation =
                await reconcileOrderRefundLifecycleFromStripe({
                  db,
                  refund,
                  reason: bookingFailureMessage
                    ? "The selected freight quote could no longer be safely booked; place a new order with a fresh quote."
                    : "Payment completed after the order was closed and was refunded automatically.",
                });

              if (
                reconciliation.state === "succeeded" &&
                reconciliation.updated &&
                bookingFailureMessage
              ) {
                await notifyAdmins({
                  title: "Captured Payment Auto-Refunded",
                  message: `${bookingFailureMessage} Order ${order.orderNumber}; PaymentIntent ${paymentIntent.id}.`,
                  orderId,
                });
              }
            }

            if (outcome === "dispatch") {
              // Awaiting this critical event lets Stripe retry if dispatch
              // enqueueing fails after the local payment transition commits.
              await inngest.send([
                buildOrderPaidEvent(orderId, paymentIntent.id),
                buildOrderConfirmedEvent({
                  orderId,
                  buyerId: order.buyerId,
                  paymentIntentId: paymentIntent.id,
                }),
              ]);
            }
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;

        if (paymentIntent.metadata.type === "promotion") {
          // Promotion payment failed
          await db
            .update(listingPromotions)
            .set({ paymentStatus: "failed" })
            .where(
              eq(
                listingPromotions.stripePaymentIntentId,
                paymentIntent.id
              )
            );
        } else {
          const orderId = paymentIntent.metadata.orderId;
          if (orderId) {
            const order = await db.query.orders.findFirst({
              where: eq(orders.id, orderId),
              columns: {
                status: true,
                paymentStatus: true,
                stripePaymentIntentId: true,
                inventoryReleasedAt: true,
              },
            });
            if (
              order &&
              canApplyPaymentIntentFailed({
                orderStatus: order.status,
                paymentStatus: order.paymentStatus,
                storedPaymentIntentId: order.stripePaymentIntentId,
                eventPaymentIntentId: paymentIntent.id,
                inventoryReleasedAt: order.inventoryReleasedAt,
              })
            ) {
              await db
                .update(orders)
                .set({ paymentStatus: "failed", updatedAt: new Date() })
                .where(
                  and(
                    eq(orders.id, orderId),
                    eq(orders.stripePaymentIntentId, paymentIntent.id),
                    eq(orders.status, "pending"),
                    sql`${orders.inventoryReleasedAt} IS NULL`,
                    sql`${orders.paymentStatus} IN ('pending', 'failed', 'processing')`,
                  ),
                );
            }
          }
        }
        break;
      }

      case "payment_intent.processing": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        if (paymentIntent.metadata.type !== "promotion") {
          const orderId = paymentIntent.metadata.orderId;
          if (orderId) {
            const order = await db.query.orders.findFirst({
              where: eq(orders.id, orderId),
              columns: {
                status: true,
                paymentStatus: true,
                stripePaymentIntentId: true,
                inventoryReleasedAt: true,
              },
            });
            if (
              order &&
              canApplyPaymentIntentProcessing({
                orderStatus: order.status,
                paymentStatus: order.paymentStatus,
                storedPaymentIntentId: order.stripePaymentIntentId,
                eventPaymentIntentId: paymentIntent.id,
                inventoryReleasedAt: order.inventoryReleasedAt,
              })
            ) {
              await db
                .update(orders)
                .set({ paymentStatus: "processing", updatedAt: new Date() })
                .where(
                  and(
                    eq(orders.id, orderId),
                    eq(orders.stripePaymentIntentId, paymentIntent.id),
                    eq(orders.status, "pending"),
                    sql`${orders.inventoryReleasedAt} IS NULL`,
                    sql`${orders.paymentStatus} IN ('pending', 'failed')`,
                  ),
                );
            }
          }
        }
        break;
      }

      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const isComplete = isStripeConnectAccountReady(account);

        const seller = await db.query.users.findFirst({
          where: eq(users.stripeAccountId, account.id),
          columns: { id: true },
        });

        if (seller) {
          await db
            .update(users)
            .set({
              stripeOnboardingComplete: isComplete,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(users.id, seller.id),
                eq(users.stripeAccountId, account.id),
              ),
            );

          // Notify seller if account has past_due requirements and charges are disabled
          const hasPastDue =
            account.requirements?.past_due &&
            account.requirements.past_due.length > 0;
          if (hasPastDue && !account.charges_enabled) {
            await db.insert(notifications).values({
              userId: seller.id,
              type: "system" as const,
              title: "Stripe Account Requires Action",
              message:
                "Your Stripe account has been restricted. Please update your payment information to continue receiving payouts.",
              read: false,
            });
          }
        }
        break;
      }

      case "refund.updated":
      case "refund.failed": {
        const refund = event.data.object as Stripe.Refund;
        await reconcileOrderRefundLifecycleFromStripe({
          db,
          refund,
          reason: "Stripe refund lifecycle webhook reconciliation",
        });
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = charge.payment_intent as string | null;

        if (paymentIntentId && charge.amount_refunded > 0) {
          const order = await db.query.orders.findFirst({
            where: eq(orders.stripePaymentIntentId, paymentIntentId),
            columns: {
              id: true,
              orderNumber: true,
              taxLiability: true,
              taxStatus: true,
              taxAmount: true,
              stripeTaxCalculationId: true,
              stripeTaxTransactionId: true,
            },
          });

          if (order) {
            const refundData = charge.refunds?.data ?? [];
            // Embedded Stripe lists are not a safe chronological contract for
            // financial attribution. Select the newest successful refund by
            // its provider timestamp so partial-refund tax reversals bind to
            // the payment effect that actually triggered this charge update.
            const latestRefund = refundData
              .filter((refund) => refund.status === "succeeded")
              .reduce<Stripe.Refund | undefined>(
                (latest, refund) =>
                  !latest || refund.created > latest.created
                    ? refund
                    : latest,
                undefined,
              );
            await reconcileOrderRefundFromStripe({
              db,
              orderId: order.id,
              refundedAmountCents: charge.amount_refunded,
              stripeRefundId: latestRefund?.id,
              reason: "Stripe refund webhook reconciliation",
            });

            if (order.taxLiability === "platform") {
              if (
                !order.stripeTaxCalculationId ||
                !order.stripeTaxTransactionId ||
                !latestRefund?.id
              ) {
                throw new TaxReadinessError(
                  "TAX_ASSOCIATION_INCOMPLETE",
                  `Order ${order.id} refund is missing authoritative tax transaction evidence.`,
                );
              }
              try {
                const reversal = await findCommittedTaxTransaction({
                  paymentIntentId,
                  expectedCalculationId:
                    order.stripeTaxCalculationId,
                  expectedSourceId: latestRefund.id,
                });
                const reversalStatus = charge.refunded
                  ? "reversed"
                  : "partially_reversed";
                const recordedAt = new Date().toISOString();
                await db
                  .update(orders)
                  .set({
                    taxReversalStatus: reversalStatus,
                    stripeTaxReversalTransactionIds:
                      sql`CASE
                        WHEN ${orders.stripeTaxReversalTransactionIds} @> jsonb_build_array(${reversal.transactionId}::text)
                          THEN ${orders.stripeTaxReversalTransactionIds}
                        ELSE ${orders.stripeTaxReversalTransactionIds} || jsonb_build_array(${reversal.transactionId}::text)
                      END`,
                    taxReversalEvidence:
                      sql`CASE
                        WHEN ${orders.taxReversalEvidence} @> jsonb_build_array(jsonb_build_object('refundId', ${latestRefund.id}::text))
                          THEN ${orders.taxReversalEvidence}
                        ELSE ${orders.taxReversalEvidence} || jsonb_build_array(jsonb_build_object(
                          'refundId', ${latestRefund.id}::text,
                          'transactionId', ${reversal.transactionId}::text,
                          'cumulativeRefundedAmountCents', ${charge.amount_refunded}::int,
                          'recordedAt', ${recordedAt}::text
                        ))
                      END`,
                    updatedAt: new Date(),
                  })
                  .where(eq(orders.id, order.id));
                await resolveReconciliationCaseByKey(db, {
                  caseKey: `tax-reversal:${latestRefund.id}`,
                  resolution: `Stripe Tax reversal ${reversal.transactionId} was verified for refund ${latestRefund.id}.`,
                });
              } catch (error) {
                await db
                  .update(orders)
                  .set({
                    taxReversalStatus: "reconciliation_required",
                    updatedAt: new Date(),
                  })
                  .where(eq(orders.id, order.id));
                await openReconciliationCase(db, {
                  caseKey: `tax-reversal:${latestRefund.id}`,
                  type: "payment_mismatch",
                  source: "stripe",
                  severity: "critical",
                  title: `Tax refund reconciliation: ${order.orderNumber}`,
                  summary:
                    "The buyer refund was recorded, but the Stripe Tax reversal has not been verified. This webhook remains retryable and the order requires operator review.",
                  orderId: order.id,
                  externalReference: latestRefund.id,
                  amountCents: charge.amount_refunded,
                  details: {
                    calculationId: order.stripeTaxCalculationId,
                    originalTaxTransactionId:
                      order.stripeTaxTransactionId,
                    reason:
                      error instanceof Error
                        ? error.message
                        : "Unknown Stripe Tax reversal error",
                  },
                });
                throw error;
              }
            } else if (order.taxStatus !== "disabled") {
              throw new TaxReadinessError(
                "TAX_ASSOCIATION_INCOMPLETE",
                `Refunded order ${order.id} has an unsupported tax liability state.`,
              );
            }
          }
        }
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntentId = dispute.payment_intent as string | null;

        if (paymentIntentId) {
          const order = await db.query.orders.findFirst({
            where: eq(orders.stripePaymentIntentId, paymentIntentId),
          });

          if (order) {
            // Serialize opening the dispute with the order-row lock used by
            // live freight dispatch. If dispatch already won, the reversal
            // service cancels that booking before completing this event.
            const localDispute = await db.transaction(async (tx) => {
              await tx
                .select({ id: orders.id })
                .from(orders)
                .where(eq(orders.id, order.id))
                .for("update");
              const [existingDispute] = await tx
                .select({ id: disputes.id })
                .from(disputes)
                .where(eq(disputes.orderId, order.id))
                .limit(1);

              if (!existingDispute) {
                const [created] = await tx
                  .insert(disputes)
                  .values({
                    orderId: order.id,
                    initiatorId: order.buyerId,
                    reason: `Stripe chargeback: ${dispute.reason}`,
                    reasonCode: "other",
                    source: "stripe",
                    description: `Automatic dispute created from Stripe chargeback. Dispute ID: ${dispute.id}. Reason: ${dispute.reason}.`,
                    status: "under_review",
                  })
                  .returning({ id: disputes.id });
                return created;
              } else {
                // The schema intentionally keeps one dispute record per order.
                // A later Stripe chargeback must reopen that record instead of
                // leaving a resolved dispute invisible to dispatch and payout.
                const [reopened] = await tx
                  .update(disputes)
                  .set({
                    reason: `Stripe chargeback: ${dispute.reason}`,
                    reasonCode: "other",
                    source: "stripe",
                    description: `Automatic dispute created from Stripe chargeback. Dispute ID: ${dispute.id}. Reason: ${dispute.reason}.`,
                    status: "under_review",
                    resolution: null,
                    resolvedBy: null,
                    resolvedAt: null,
                    resolvedRefundAmountCents: null,
                    payoutRequeuedAt: null,
                    updatedAt: new Date(),
                  })
                  .where(eq(disputes.id, existingDispute.id))
                  .returning({ id: disputes.id });
                return reopened ?? existingDispute;
              }
            });

            if (!localDispute) {
              throw new Error(
                `Unable to persist Stripe dispute ${dispute.id} for order ${order.id}`,
              );
            }
            await openReconciliationCase(db, {
              caseKey: `stripe-chargeback:${dispute.id}`,
              type: "dispute_resolution",
              source: "stripe",
              severity: "critical",
              title: `Stripe chargeback: ${order.orderNumber}`,
              summary:
                "Stripe opened a chargeback. Seller payout and shipment automation require operator review until Stripe closes it.",
              orderId: order.id,
              disputeId: localDispute.id,
              externalReference: dispute.id,
              amountCents: dispute.amount,
              details: {
                stripeStatus: dispute.status,
                stripeReason: dispute.reason,
                paymentIntentId,
              },
            });

            await reverseOrderTransferForDispute({
              db,
              orderId: order.id,
              stripeDisputeId: dispute.id,
              disputedAmountCents: dispute.amount,
            });

            // Notify admins by finding admin users
            const adminUsers = await db.query.users.findMany({
              where: eq(users.role, "admin"),
              columns: { id: true },
            });

            if (adminUsers.length > 0) {
              await db.insert(notifications).values(
                adminUsers.map((admin) => ({
                  userId: admin.id,
                  type: "system" as const,
                  title: "Stripe Chargeback Filed",
                  message: `A chargeback has been filed for order ${order.orderNumber}. Reason: ${dispute.reason}. Amount: $${(dispute.amount / 100).toFixed(2)}.`,
                  data: { orderId: order.id },
                  read: false,
                }))
              );
            }
          }
        }
        break;
      }

      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntentId = dispute.payment_intent as string | null;

        if (paymentIntentId) {
          const closedState = await db.transaction(async (tx) => {
            const [order] = await tx
              .select({
                id: orders.id,
                orderNumber: orders.orderNumber,
                status: orders.status,
                shippedAt: orders.shippedAt,
                totalPrice: orders.totalPrice,
                refundedAmount: orders.refundedAmount,
                paymentStatus: orders.paymentStatus,
                stripeTransferId: orders.stripeTransferId,
                transferReversedAmount: orders.transferReversedAmount,
                transferFailedAt: orders.transferFailedAt,
                transferError: orders.transferError,
                notes: orders.notes,
              })
              .from(orders)
              .where(eq(orders.stripePaymentIntentId, paymentIntentId))
              .for("update");
            if (!order) return null;

            const chargebackCaseKey = `stripe-chargeback:${dispute.id}`;
            const [mappedCase] = await tx
              .select({ disputeId: reconciliationCases.disputeId })
              .from(reconciliationCases)
              .where(eq(reconciliationCases.caseKey, chargebackCaseKey))
              .limit(1);
            if (!mappedCase?.disputeId) {
              return { kind: "unmatched" as const, order };
            }

            const [existingDispute] = await tx
              .select({ id: disputes.id })
              .from(disputes)
              .where(
                and(
                  eq(disputes.id, mappedCase.disputeId),
                  eq(disputes.orderId, order.id),
                  eq(disputes.source, "stripe"),
                ),
              )
              .for("update");
            if (!existingDispute) {
              return { kind: "unmatched" as const, order };
            }

            const outcomeStatus =
              dispute.status === "won"
                ? "resolved_seller"
                : dispute.status === "lost"
                  ? "resolved_buyer"
                  : "closed";
            const now = new Date();
            await tx
              .update(disputes)
              .set({
                status: outcomeStatus,
                resolution: `Stripe chargeback ${dispute.status}: ${dispute.reason}`,
                resolvedAt: now,
                resolvedBy: null,
                updatedAt: now,
              })
              .where(eq(disputes.id, existingDispute.id));

            const requiresTransferReconciliation =
              dispute.status === "won" &&
              (!order.stripeTransferId ||
                Number(order.transferReversedAmount) > 0);
            const reconciliationMessage = requiresTransferReconciliation
              ? `Stripe dispute ${dispute.id} was won, but the seller transfer is absent or was reversed. A make-up transfer requires manual financial reconciliation.`
              : null;
            const restoredEscrowStatus =
              dispute.status === "won"
                ? requiresTransferReconciliation
                  ? "held"
                  : "released"
                : dispute.status === "lost"
                  ? "refunded"
                  : "disputed";
            const restoredPaymentStatus =
              dispute.status === "won"
                ? (() => {
                    const totalAmountCents = Math.round(
                      Number(order.totalPrice) * 100,
                    );
                    const refundedAmountCents = Math.round(
                      Number(order.refundedAmount ?? 0) * 100,
                    );
                    if (refundedAmountCents <= 0) return "succeeded";
                    if (refundedAmountCents >= totalAmountCents) return "refunded";
                    return "partially_refunded";
                  })()
                : "reconciliation_required";
            const chargebackAuditNote = `[Stripe chargeback ${dispute.status}: ${dispute.id}; amount $${(
              dispute.amount / 100
            ).toFixed(2)}; refunds ${
              dispute.status === "won"
                ? "re-enabled per recorded refund ledger"
                : "blocked until financial reconciliation"
            }]`;
            await tx
              .update(orders)
              .set({
                paymentStatus: restoredPaymentStatus,
                escrowStatus: restoredEscrowStatus,
                transferFailedAt: requiresTransferReconciliation
                  ? now
                  : order.transferFailedAt,
                transferError:
                  reconciliationMessage ?? order.transferError,
                notes: order.notes
                  ? `${order.notes}\n${chargebackAuditNote}`
                  : chargebackAuditNote,
                updatedAt: now,
              })
              .where(eq(orders.id, order.id));

            return {
              kind: "closed" as const,
              order,
              disputeId: existingDispute.id,
              chargebackCaseKey,
              requiresTransferReconciliation,
              reconciliationMessage,
            };
          });

          if (!closedState || closedState.kind === "unmatched") {
            await openReconciliationCase(db, {
              caseKey: `stripe-chargeback-close-unmatched:${dispute.id}`,
              type: "data_integrity",
              source: "stripe",
              severity: "critical",
              title: "Unmatched Stripe chargeback closure",
              summary:
                "Stripe closed a chargeback without a verified local chargeback mapping. No local claim or money state was changed.",
              orderId: closedState?.order.id ?? null,
              externalReference: dispute.id,
              amountCents: dispute.amount,
              details: {
                paymentIntentId,
                stripeStatus: dispute.status,
                stripeReason: dispute.reason,
              },
            });
            break;
          }

          await resolveReconciliationCaseByKey(db, {
            caseKey: closedState.chargebackCaseKey,
            resolution: `Stripe closed the chargeback with status ${dispute.status}.`,
          });

          if (closedState.requiresTransferReconciliation) {
            await openReconciliationCase(db, {
              caseKey: `stripe-chargeback-transfer:${dispute.id}`,
              type: "payout_failure",
              source: "stripe",
              severity: "critical",
              title: `Make-up seller transfer required: ${closedState.order.orderNumber}`,
              summary: closedState.reconciliationMessage!,
              orderId: closedState.order.id,
              disputeId: closedState.disputeId,
              externalReference: dispute.id,
              amountCents: dispute.amount,
              details: {
                stripeStatus: dispute.status,
                transferId: closedState.order.stripeTransferId,
                transferReversedAmount: Number(
                  closedState.order.transferReversedAmount,
                ),
              },
            });
            if (
              closedState.order.shippedAt &&
              ["shipped", "delivered"].includes(closedState.order.status)
            ) {
              try {
                await inngest.send({
                  id: `chargeback-win-payout-${dispute.id}`,
                  name: "order/picked-up",
                  data: {
                    orderId: closedState.order.id,
                    pickedUpAt: closedState.order.shippedAt.toISOString(),
                    pickupConfirmed: true,
                    source: "priority1",
                  },
                });
              } catch (error) {
                console.error("Failed to requeue payout after chargeback win", {
                  orderId: closedState.order.id,
                  error,
                });
              }
            }
          }

          if (closedState.reconciliationMessage) {
            await notifyAdmins({
              title: "Seller Transfer Reconciliation Required",
              message: closedState.reconciliationMessage,
              orderId: closedState.order.id,
            });
          }
        }
        break;
      }

      case "transfer.created": {
        // Payout release validates amount, currency, destination, source
        // charge, transfer group, and metadata before persisting a transfer.
        // Trusting orderId metadata here would let an unrelated transfer poison
        // refund reconciliation. Orphan transfers are recovered safely by the
        // validated payout/refund paths using transfer_group.
        break;
      }

      case "payout.failed": {
        const payout = event.data.object as Stripe.Payout;
        const connectedAccountId = event.account;

        if (connectedAccountId) {
          const seller = await db.query.users.findFirst({
            where: eq(users.stripeAccountId, connectedAccountId),
            columns: { id: true },
          });

          if (seller) {
            await db.insert(notifications).values({
              userId: seller.id,
              type: "system" as const,
              title: "Payout Failed",
              message: `A payout of $${(payout.amount / 100).toFixed(2)} failed. Please update your banking information in your Stripe dashboard.`,
              read: false,
            });
          }
        }
        break;
      }

      case "payout.paid": {
        const payout = event.data.object as Stripe.Payout;
        const connectedAccountId = event.account;

        if (connectedAccountId) {
          const seller = await db.query.users.findFirst({
            where: eq(users.stripeAccountId, connectedAccountId),
            columns: { id: true },
          });

          if (seller) {
            await db.insert(notifications).values({
              userId: seller.id,
              type: "system" as const,
              title: "Payout Received",
              message: `Your payout of $${(payout.amount / 100).toFixed(2)} has been sent to your bank account.`,
              read: false,
            });
          }
        }
        break;
      }

      case "account.application.deauthorized": {
        const connectedAccountId = event.account;

        if (connectedAccountId) {
          const seller = await db.query.users.findFirst({
            where: eq(users.stripeAccountId, connectedAccountId),
            columns: { id: true },
          });

          if (seller) {
            await db.transaction(async (tx) => {
              await tx
                .update(users)
                .set({
                  stripeOnboardingComplete: false,
                  updatedAt: new Date(),
                })
                .where(eq(users.id, seller.id));

              const candidateOrders = await tx
                .select({
                  id: orders.id,
                  escrowStatus: orders.escrowStatus,
                })
                .from(orders)
                .where(
                  and(
                    eq(orders.sellerId, seller.id),
                    eq(orders.status, "pending"),
                    sql`${orders.inventoryReleasedAt} IS NULL`,
                    sql`coalesce(${orders.paymentStatus}, 'pending') NOT IN ('succeeded', 'processing', 'refund_pending', 'partially_refunded', 'refunded', 'paid')`,
                  ),
                )
                .for("update");

              for (const candidateOrder of candidateOrders) {
                const [cancelledOrder] = await tx
                  .update(orders)
                  .set({
                    status: "cancelled",
                    paymentStatus: "failed",
                    cancelledAt: new Date(),
                    escrowStatus:
                      candidateOrder.escrowStatus === "held"
                        ? "refunded"
                        : candidateOrder.escrowStatus,
                    notes: sql`concat_ws(E'\n', nullif(${orders.notes}, ''), ${"[Order cancelled after seller Stripe account was deauthorized]"} )`,
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(orders.id, candidateOrder.id),
                      eq(orders.status, "pending"),
                      sql`${orders.inventoryReleasedAt} IS NULL`,
                      sql`coalesce(${orders.paymentStatus}, 'pending') NOT IN ('succeeded', 'processing', 'refund_pending', 'partially_refunded', 'refunded', 'paid')`,
                    ),
                  )
                  .returning({ id: orders.id });
                if (cancelledOrder) {
                  const releaseResult = await releaseReservedInventory({
                    db: tx,
                    orderId: cancelledOrder.id,
                    reason: "account.application.deauthorized",
                  });
                  if (!releaseResult.released) {
                    throw new Error(
                      `Inventory release failed after deauthorization for order ${cancelledOrder.id}: ${releaseResult.reason}`,
                    );
                  }
                }
              }
            });

            await db.insert(notifications).values({
              userId: seller.id,
              type: "system" as const,
              title: "Stripe Account Disconnected",
              message:
                "Your Stripe account has been disconnected from Plank Market. You will not be able to receive payments until you reconnect.",
              read: false,
            });
          }
        }
        break;
      }

      case "payment_intent.canceled": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;

        if (paymentIntent.metadata.type === "promotion") {
          await db
            .update(listingPromotions)
            .set({ paymentStatus: "failed" })
            .where(
              eq(
                listingPromotions.stripePaymentIntentId,
                paymentIntent.id
              )
            );
        } else {
          const orderId = paymentIntent.metadata.orderId;
          if (orderId) {
            await db.transaction(async (tx) => {
              const [order] = await tx
                .select({
                  id: orders.id,
                  status: orders.status,
                  paymentStatus: orders.paymentStatus,
                  stripePaymentIntentId: orders.stripePaymentIntentId,
                  inventoryReleasedAt: orders.inventoryReleasedAt,
                })
                .from(orders)
                .where(eq(orders.id, orderId))
                .for("update");
              if (
                !order ||
                !canApplyPaymentIntentCanceled({
                  orderStatus: order.status,
                  paymentStatus: order.paymentStatus,
                  storedPaymentIntentId: order.stripePaymentIntentId,
                  eventPaymentIntentId: paymentIntent.id,
                  inventoryReleasedAt: order.inventoryReleasedAt,
                })
              ) {
                return;
              }

              const [cancelledOrder] = await tx
                .update(orders)
                .set({
                  paymentStatus: "failed",
                  status: "cancelled",
                  escrowStatus: "refunded",
                  cancelledAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(orders.id, orderId),
                    eq(orders.stripePaymentIntentId, paymentIntent.id),
                    eq(orders.status, "pending"),
                    sql`${orders.inventoryReleasedAt} IS NULL`,
                    sql`${orders.paymentStatus} IN ('pending', 'failed', 'processing')`,
                  ),
                )
                .returning({ id: orders.id });

              if (!cancelledOrder) return;

              const releaseResult = await releaseReservedInventory({
                db: tx,
                orderId,
                reason: "payment_intent.canceled",
              });
              if (!releaseResult.released) {
                throw new Error(
                  `Inventory release failed after payment cancellation for order ${orderId}: ${releaseResult.reason}`,
                );
              }
            });
          }
        }
        break;
      }

      case "charge.dispute.funds_withdrawn": {
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntentId = dispute.payment_intent as string | null;

        if (paymentIntentId) {
          const order = await db.query.orders.findFirst({
            where: eq(orders.stripePaymentIntentId, paymentIntentId),
          });

          if (order) {
            await reverseOrderTransferForDispute({
              db,
              orderId: order.id,
              stripeDisputeId: dispute.id,
              disputedAmountCents: dispute.amount,
            });
          }
        }
        break;
      }

      case "charge.dispute.funds_reinstated": {
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntentId = dispute.payment_intent as string | null;

        // Do not reopen payout eligibility while the local dispute remains
        // open. charge.dispute.closed resolves the dispute and restores the
        // appropriate held/released/refunded escrow state.
        void paymentIntentId;
        break;
      }

      case "customer.subscription.created": {
        const subscription = event.data
          .object as Stripe.Subscription;
        const userId = subscription.metadata.userId;

        if (userId) {
          const eventCreatedAt = new Date(event.created * 1000);
          const proStatus = mapStripeSubscriptionStatus(subscription.status);
          const [updated] = await db
            .update(users)
            .set({
              proStatus,
              stripeSubscriptionId: subscription.id,
              stripeCustomerId: getStripeCustomerId(subscription.customer),
              proStartedAt:
                proStatus === "active" || proStatus === "trialing"
                  ? new Date()
                  : null,
              stripeSubscriptionEventCreatedAt: eventCreatedAt,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(users.id, userId),
                subscriptionEventIsCurrent(eventCreatedAt),
              ),
            )
            .returning({ id: users.id });

          // Credit grant removed — invoice.payment_succeeded is the single source
          // for promotion credits (fires for both initial and renewal invoices)

          if (
            updated &&
            (proStatus === "active" || proStatus === "trialing")
          ) {
            await inngest.send({
              id: `subscription-activated:${event.id}`,
              name: "subscription/activated",
              data: { userId },
            });
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data
          .object as Stripe.Subscription;
        const userId = subscription.metadata.userId;

        if (userId) {
          const proStatus = mapStripeSubscriptionStatus(subscription.status);
          const eventCreatedAt = new Date(event.created * 1000);

          const updateFields: Record<string, unknown> = {
            proStatus,
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: getStripeCustomerId(subscription.customer),
            stripeSubscriptionEventCreatedAt: eventCreatedAt,
            proExpiresAt: null,
            updatedAt: new Date(),
          };

          // If canceled, record when the subscription will actually end
          if (subscription.status === "canceled") {
            const cancelPeriodEnd =
              subscription.items.data[0]?.current_period_end;
            if (cancelPeriodEnd) {
              const expiresDate = new Date(cancelPeriodEnd * 1000);
              // Only set grace period if expiry is in the future
              if (expiresDate > new Date()) {
                updateFields.proExpiresAt = expiresDate;
              }
              // If already past, leave proExpiresAt null (immediate termination)
            }
          }

          const [updated] = await db
            .update(users)
            .set(updateFields)
            .where(
              and(
                eq(users.id, userId),
                subscriptionEventIsCurrent(eventCreatedAt),
              ),
            )
            .returning({ id: users.id });

          // Notify on payment issues
          if (updated && subscription.status === "past_due") {
            await inngest.send({
                id: `subscription-payment-failed:${event.id}`,
                name: "subscription/payment-failed",
                data: { userId },
              });
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data
          .object as Stripe.Subscription;
        const userId = subscription.metadata.userId;

        if (userId) {
          const eventCreatedAt = new Date(event.created * 1000);
          const [updated] = await db
            .update(users)
            .set({
              proStatus: "free",
              stripeSubscriptionId: null,
              proExpiresAt: null,
              proStartedAt: null,
              stripeSubscriptionEventCreatedAt: eventCreatedAt,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(users.id, userId),
                subscriptionEventIsCurrent(eventCreatedAt),
              ),
            )
            .returning({ id: users.id });

          if (updated) {
            await inngest.send({
              id: `subscription-expired:${event.id}`,
              name: "subscription/expired",
              data: { userId },
            });
          }
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;

        // Only process subscription renewals (parent.type = subscription_details)
        const isSubscriptionInvoice =
          invoice.parent?.type === "subscription_details" &&
          invoice.parent.subscription_details?.subscription;

        if (isSubscriptionInvoice) {
          const customerId =
            typeof invoice.customer === "string"
              ? invoice.customer
              : invoice.customer?.id;

          if (customerId) {
            const user = await db.query.users.findFirst({
              where: eq(users.stripeCustomerId, customerId),
              columns: { id: true },
            });

            if (user) {
              // Grant and budget reset are one effect, keyed by the Stripe
              // invoice rather than the webhook event (Stripe can redeliver
              // equivalent invoice events with different event IDs).
              const periodEnd =
                invoice.lines?.data?.[0]?.period?.end;
              if (periodEnd) {
                await db.transaction(async (tx) => {
                  const [credit] = await tx
                    .insert(promotionCredits)
                    .values({
                      userId: user.id,
                      amount: PRO_MONTHLY_CREDIT,
                      usedAmount: 0,
                      source: "subscription",
                      stripeInvoiceId: invoice.id,
                      expiresAt: new Date(periodEnd * 1000),
                    })
                    .onConflictDoNothing({
                      target: promotionCredits.stripeInvoiceId,
                    })
                    .returning({ id: promotionCredits.id });

                  if (!credit) return;

                  await tx
                    .update(agentConfigs)
                    .set({
                      monitorBudgetUsed: 0,
                      updatedAt: new Date(),
                    })
                    .where(eq(agentConfigs.userId, user.id));
                });
              }
            }
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;

        // Only process subscription invoices (skip one-off invoices)
        const isSubscriptionInvoice =
          invoice.parent?.type === "subscription_details" &&
          invoice.parent.subscription_details?.subscription;
        if (!isSubscriptionInvoice) break;

        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;

        if (customerId) {
          const user = await db.query.users.findFirst({
            where: eq(users.stripeCustomerId, customerId),
            columns: { id: true },
          });

          if (user) {
            const eventCreatedAt = new Date(event.created * 1000);
            const [updated] = await db
              .update(users)
              .set({
                proStatus: "past_due",
                stripeSubscriptionEventCreatedAt: eventCreatedAt,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(users.id, user.id),
                  subscriptionEventIsCurrent(eventCreatedAt),
                ),
              )
              .returning({ id: users.id });

            if (updated) {
              await inngest.send({
                id: `invoice-payment-failed:${event.id}`,
                name: "subscription/payment-failed",
                data: { userId: user.id },
              });
            }
          }
        }
        break;
      }

      default:
        // Unhandled event type
        break;
    }
    } catch (processingError) {
      await failStripeWebhookEvent(event.id, claimStartedAt, processingError).catch(
        () => {},
      );
      console.error("Webhook processing error", {
        eventId: event.id,
        eventType: event.type,
        error:
          processingError instanceof Error
            ? processingError.name
            : "UnknownError",
      });
      throw processingError;
    }

    await completeStripeWebhookEvent(event.id, claimStartedAt);
    return { processed: true } as const;
  } catch (error) {
    console.error("Webhook handler error", {
      eventId,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    throw error;
  }
}
