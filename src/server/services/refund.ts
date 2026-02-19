import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { orders, notifications } from "@/server/db/schema";
import { env } from "@/env";
import type { Database } from "@/server/db";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-01-28.clover" as const,
});

interface ProcessOrderRefundParams {
  db: Database;
  orderId: string;
  amountCents?: number;
  reason?: string;
}

interface RefundResult {
  refundId: string;
  amountRefunded: number;
  transferReversalId?: string;
}

/**
 * Shared utility that issues a Stripe refund for an order, optionally reverses
 * the transfer (if escrow was already released), and updates the order record.
 *
 * Used by: admin.refundOrder, admin.forceCancelOrder, dispute.resolve
 */
export async function processOrderRefund({
  db,
  orderId,
  amountCents,
  reason,
}: ProcessOrderRefundParams): Promise<RefundResult> {
  // Fetch order
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  if (!order.stripePaymentIntentId) {
    throw new Error(`Order ${orderId} has no payment intent — cannot refund`);
  }

  if (order.paymentStatus !== "succeeded") {
    throw new Error(
      `Order ${orderId} payment status is "${order.paymentStatus}" — can only refund succeeded payments`
    );
  }

  // Calculate refund amount (default to full order amount)
  const fullAmountCents = Math.round(Number(order.totalPrice) * 100);
  const refundAmountCents = amountCents ?? fullAmountCents;

  // Build refund params
  const refundParams: Stripe.RefundCreateParams = {
    payment_intent: order.stripePaymentIntentId,
    amount: refundAmountCents,
    reason: "requested_by_customer",
    metadata: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      adminReason: reason || "Admin-initiated refund",
    },
  };

  // If the transfer was already released to seller, reverse it
  if (order.stripeTransferId && order.escrowStatus === "released") {
    refundParams.reverse_transfer = true;
  }

  // Issue the Stripe refund
  const refund = await stripe.refunds.create(refundParams);

  // Determine new statuses
  const isFullRefund = refundAmountCents >= fullAmountCents;
  const newPaymentStatus = isFullRefund ? "refunded" : "partially_refunded";
  const newOrderStatus = isFullRefund ? "refunded" : order.status;
  const newEscrowStatus =
    order.escrowStatus === "held" || order.escrowStatus === "released"
      ? "refunded"
      : order.escrowStatus;

  // Update the order
  await db
    .update(orders)
    .set({
      paymentStatus: newPaymentStatus,
      status: newOrderStatus,
      escrowStatus: newEscrowStatus,
      refundedAt: new Date(),
      refundedAmount: refundAmountCents / 100,
      stripeRefundId: refund.id,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  // Create notifications for buyer and seller
  const refundAmountFormatted = `$${(refundAmountCents / 100).toFixed(2)}`;
  await db.insert(notifications).values([
    {
      userId: order.buyerId,
      type: "system" as const,
      title: "Refund Processed",
      message: `A ${isFullRefund ? "full" : "partial"} refund of ${refundAmountFormatted} has been issued for order ${order.orderNumber}.${reason ? ` Reason: ${reason}` : ""}`,
      data: { orderId: order.id },
      read: false,
    },
    {
      userId: order.sellerId,
      type: "system" as const,
      title: "Order Refunded",
      message: `A ${isFullRefund ? "full" : "partial"} refund of ${refundAmountFormatted} has been issued for order ${order.orderNumber}.${reason ? ` Reason: ${reason}` : ""}`,
      data: { orderId: order.id },
      read: false,
    },
  ]);

  return {
    refundId: refund.id,
    amountRefunded: refundAmountCents / 100,
    transferReversalId: refund.transfer_reversal as string | undefined,
  };
}
