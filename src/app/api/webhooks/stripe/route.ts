import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/server/db";
import { orders, users, listings, listingPromotions, disputes, notifications } from "@/server/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { env } from "@/env";
import { inngest } from "@/lib/inngest/client";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-01-28.clover" as const,
});

const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

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
          // Order payment succeeded
          const orderId = paymentIntent.metadata.orderId;
          if (orderId) {
            await db
              .update(orders)
              .set({
                paymentStatus: "succeeded",
                status: "confirmed",
                confirmedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(orders.id, orderId));

            // Fire order/paid event for shipment auto-dispatch
            inngest.send({
              name: "order/paid",
              data: { orderId },
            }).catch((err) => {
              console.error("Failed to send order/paid event:", err);
            });
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
          // Order payment failed
          const orderId = paymentIntent.metadata.orderId;
          if (orderId) {
            await db
              .update(orders)
              .set({
                paymentStatus: "failed",
                updatedAt: new Date(),
              })
              .where(eq(orders.id, orderId));
          }
        }
        break;
      }

      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const isComplete =
          account.charges_enabled && account.payouts_enabled;

        if (account.metadata?.userId) {
          await db
            .update(users)
            .set({
              stripeOnboardingComplete: isComplete,
              updatedAt: new Date(),
            })
            .where(eq(users.id, account.metadata.userId));

          // Notify seller if account has past_due requirements and charges are disabled
          const hasPastDue =
            account.requirements?.past_due &&
            account.requirements.past_due.length > 0;
          if (hasPastDue && !account.charges_enabled) {
            await db.insert(notifications).values({
              userId: account.metadata.userId,
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

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = charge.payment_intent as string | null;

        if (paymentIntentId) {
          const order = await db.query.orders.findFirst({
            where: eq(orders.stripePaymentIntentId, paymentIntentId),
          });

          if (order) {
            const isFullRefund = charge.amount_refunded >= charge.amount;
            await db
              .update(orders)
              .set({
                paymentStatus: isFullRefund ? "refunded" : "partially_refunded",
                updatedAt: new Date(),
              })
              .where(eq(orders.id, order.id));

            // Notify buyer
            await db.insert(notifications).values({
              userId: order.buyerId,
              type: "system" as const,
              title: "Refund Received",
              message: `A ${isFullRefund ? "full" : "partial"} refund of $${(charge.amount_refunded / 100).toFixed(2)} has been processed for order ${order.orderNumber}.`,
              data: { orderId: order.id },
              read: false,
            });
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
            // Auto-create dispute record if none exists
            const existingDispute = await db.query.disputes.findFirst({
              where: eq(disputes.orderId, order.id),
            });

            if (!existingDispute) {
              await db.insert(disputes).values({
                orderId: order.id,
                initiatorId: order.buyerId,
                reason: `Stripe chargeback: ${dispute.reason}`,
                description: `Automatic dispute created from Stripe chargeback. Dispute ID: ${dispute.id}. Reason: ${dispute.reason}.`,
                status: "under_review",
              });
            }

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
          const order = await db.query.orders.findFirst({
            where: eq(orders.stripePaymentIntentId, paymentIntentId),
          });

          if (order) {
            const existingDispute = await db.query.disputes.findFirst({
              where: eq(disputes.orderId, order.id),
            });

            if (existingDispute) {
              // Map Stripe dispute status to our status
              const outcomeStatus =
                dispute.status === "won"
                  ? "resolved_seller"
                  : dispute.status === "lost"
                    ? "resolved_buyer"
                    : "closed";

              await db
                .update(disputes)
                .set({
                  status: outcomeStatus as "resolved_buyer" | "resolved_seller" | "closed",
                  resolution: `Stripe chargeback ${dispute.status}: ${dispute.reason}`,
                  resolvedAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(disputes.id, existingDispute.id));
            }
          }
        }
        break;
      }

      case "transfer.created": {
        const transfer = event.data.object as Stripe.Transfer;
        const orderId = transfer.metadata?.orderId;

        if (orderId) {
          // Belt-and-suspenders: persist stripeTransferId on the order
          await db
            .update(orders)
            .set({
              stripeTransferId: transfer.id,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(orders.id, orderId),
                sql`${orders.stripeTransferId} IS NULL`
              )
            );
        }
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
        const account = event.data.object as Stripe.Application;
        const connectedAccountId = event.account;

        if (connectedAccountId) {
          const seller = await db.query.users.findFirst({
            where: eq(users.stripeAccountId, connectedAccountId),
            columns: { id: true },
          });

          if (seller) {
            await db
              .update(users)
              .set({
                stripeOnboardingComplete: false,
                updatedAt: new Date(),
              })
              .where(eq(users.id, seller.id));

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
            await db
              .update(orders)
              .set({
                paymentStatus: "failed",
                status: "cancelled",
                updatedAt: new Date(),
              })
              .where(eq(orders.id, orderId));
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
            await db
              .update(orders)
              .set({
                escrowStatus: "disputed",
                updatedAt: new Date(),
              })
              .where(eq(orders.id, order.id));
          }
        }
        break;
      }

      case "charge.dispute.funds_reinstated": {
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntentId = dispute.payment_intent as string | null;

        if (paymentIntentId) {
          const order = await db.query.orders.findFirst({
            where: eq(orders.stripePaymentIntentId, paymentIntentId),
          });

          if (order) {
            await db
              .update(orders)
              .set({
                escrowStatus: "held",
                updatedAt: new Date(),
              })
              .where(eq(orders.id, order.id));
          }
        }
        break;
      }

      default:
        // Unhandled event type
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
