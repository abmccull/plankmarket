import { NextRequest, NextResponse } from "next/server";
import { randomUUID, timingSafeEqual } from "crypto";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { env } from "@/env";
import { releaseReservedInventory } from "@/server/services/inventory-reservation";
import { stripe } from "@/lib/stripe";
import {
  canApplyPaymentIntentProcessing,
  isStripePaymentIntentCancelable,
} from "@/server/services/order-transitions";
import { reconcileOrderRefundLifecycleFromStripe } from "@/server/services/refund";
import { redis } from "@/lib/redis/client";

const ORDER_EXPIRY_MINUTES = 45;
const EXPIRY_BATCH_SIZE = 25;
const EXPIRY_LOCK_KEY = "cron:expire-pending-orders";

function safeCompareBearerToken(
  authHeader: string | null,
  expectedSecret: string,
): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const providedToken = authHeader.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(expectedSecret);
  const providedBuffer = Buffer.from(providedToken);

  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function GET(req: NextRequest) {
  if (!env.CRON_SECRET) {
    console.error("CRON_SECRET is missing; rejecting pending-order expiry cron");
    return NextResponse.json(
      { error: "Cron endpoint misconfigured" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!safeCompareBearerToken(authHeader, env.CRON_SECRET)) {
    console.warn("Unauthorized cron access attempt", {
      path: req.nextUrl.pathname,
      userAgent: req.headers.get("user-agent"),
      hasAuthHeader: Boolean(authHeader),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lockToken = randomUUID();
  const lockAcquired = await redis.set(EXPIRY_LOCK_KEY, lockToken, {
    nx: true,
    ex: 10 * 60,
  });
  if (!lockAcquired) {
    return NextResponse.json({ skipped: true, reason: "already_running" });
  }

  try {
    const cutoff = new Date(Date.now() - ORDER_EXPIRY_MINUTES * 60 * 1000);

    const staleOrders = await db.query.orders.findMany({
      where: and(
        eq(orders.status, "pending"),
        lt(orders.createdAt, cutoff),
        sql`coalesce(${orders.paymentStatus}, 'pending') NOT IN ('succeeded', 'processing', 'refunded', 'partially_refunded')`,
      ),
      columns: {
        id: true,
        status: true,
        paymentStatus: true,
        totalPrice: true,
        stripePaymentIntentId: true,
        inventoryReleasedAt: true,
      },
      orderBy: [asc(orders.createdAt)],
      limit: EXPIRY_BATCH_SIZE,
    });

  let expiredCount = 0;
  const failures: Array<{ orderId: string; error: string }> = [];

  for (const order of staleOrders) {
    try {
      if (order.stripePaymentIntentId) {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          order.stripePaymentIntentId,
        );
        const expectedAmountCents = Math.round(Number(order.totalPrice) * 100);
        if (
          paymentIntent.metadata.orderId !== order.id ||
          paymentIntent.amount !== expectedAmountCents ||
          paymentIntent.currency.toLowerCase() !== "usd"
        ) {
          throw new Error("Stored PaymentIntent does not match the order");
        }

        if (paymentIntent.status === "succeeded") {
          if (paymentIntent.amount_received !== expectedAmountCents) {
            throw new Error("Captured PaymentIntent amount does not match order");
          }

          const shouldRefund = await db.transaction(async (tx) => {
            const [lockedOrder] = await tx
              .select({
                status: orders.status,
                paymentStatus: orders.paymentStatus,
                stripePaymentIntentId: orders.stripePaymentIntentId,
              })
              .from(orders)
              .where(eq(orders.id, order.id))
              .for("update");
            if (
              !lockedOrder ||
              lockedOrder.stripePaymentIntentId !== paymentIntent.id ||
              lockedOrder.paymentStatus === "refunded" ||
              lockedOrder.paymentStatus === "partially_refunded"
            ) {
              return false;
            }
            if (
              lockedOrder.paymentStatus === "succeeded" &&
              ["confirmed", "processing", "shipped", "delivered"].includes(
                lockedOrder.status,
              )
            ) {
              return false;
            }

            return true;
          });
          if (shouldRefund) {
            const refund = await stripe.refunds.create(
              {
                payment_intent: paymentIntent.id,
                amount: paymentIntent.amount_received,
                metadata: {
                  orderId: order.id,
                  reason: "captured_after_payment_window_expired",
                },
              },
              {
                idempotencyKey: `late-order-payment-refund:${paymentIntent.id}`,
              },
            );
            await reconcileOrderRefundLifecycleFromStripe({
              db,
              refund,
              reason:
                "Payment was captured after the checkout and freight quote window expired",
            });
          }
          continue;
        }

        if (paymentIntent.status === "processing") {
          if (
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
                  eq(orders.id, order.id),
                  eq(orders.status, "pending"),
                  eq(orders.stripePaymentIntentId, paymentIntent.id),
                  sql`${orders.inventoryReleasedAt} IS NULL`,
                  sql`${orders.paymentStatus} IN ('pending', 'failed')`,
                ),
              );
          }
          continue;
        }

        if (isStripePaymentIntentCancelable(paymentIntent.status)) {
          const cancelledIntent = await stripe.paymentIntents.cancel(
            paymentIntent.id,
            {},
            { idempotencyKey: `expire-order-payment:${order.id}` },
          );
          if (cancelledIntent.status !== "canceled") {
            throw new Error(
              `PaymentIntent cancellation returned ${cancelledIntent.status}`,
            );
          }
        } else if (paymentIntent.status !== "canceled") {
          throw new Error(
            `PaymentIntent status ${paymentIntent.status} is not safe to expire`,
          );
        }
      }

      const expired = await db.transaction(async (tx) => {
        const [lockedOrder] = await tx
          .select({
            id: orders.id,
            status: orders.status,
            paymentStatus: orders.paymentStatus,
            stripePaymentIntentId: orders.stripePaymentIntentId,
            inventoryReleasedAt: orders.inventoryReleasedAt,
          })
          .from(orders)
          .where(eq(orders.id, order.id))
          .for("update");

        if (
          !lockedOrder ||
          lockedOrder.status !== "pending" ||
          lockedOrder.inventoryReleasedAt ||
          lockedOrder.stripePaymentIntentId !== order.stripePaymentIntentId ||
          lockedOrder.paymentStatus === "succeeded" ||
          lockedOrder.paymentStatus === "processing" ||
          lockedOrder.paymentStatus === "refunded" ||
          lockedOrder.paymentStatus === "partially_refunded"
        ) {
          return false;
        }

        await tx
          .update(orders)
          .set({
            status: "cancelled",
            paymentStatus: "failed",
            escrowStatus: "refunded",
            cancelledAt: new Date(),
            updatedAt: new Date(),
            notes: "Cancelled automatically: payment window expired",
          })
          .where(eq(orders.id, order.id));

        await releaseReservedInventory({
          db: tx,
          orderId: order.id,
          reason: "pending_order_expired",
        });

        return true;
      });
      if (expired) expiredCount += 1;
    } catch (error) {
      failures.push({
        orderId: order.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

    return NextResponse.json(
      {
        expired: expiredCount,
        scanned: staleOrders.length,
        failures,
        cutoff: cutoff.toISOString(),
      },
      { status: failures.length > 0 ? 500 : 200 },
    );
  } finally {
    await redis
      .eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        [EXPIRY_LOCK_KEY],
        [lockToken],
      )
      .catch(() => {});
  }
}
