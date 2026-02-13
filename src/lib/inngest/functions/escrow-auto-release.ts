import { inngest } from "../client";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema/orders";
import { eq } from "drizzle-orm";
import { resend } from "@/lib/email/client";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover" as Stripe.LatestApiVersion,
});

interface OrderPickedUpEvent {
  data: {
    orderId: string;
    pickedUpAt: string;
  };
}

export const escrowAutoRelease = inngest.createFunction(
  { id: "escrow-auto-release", name: "Release Escrow on Shipment Pickup" },
  { event: "order/picked-up" },
  async ({ event, step }) => {
    const eventData = event.data as OrderPickedUpEvent["data"];

    const releaseResult = await step.run("check-and-release", async () => {
      // Fetch order details with seller relation
      const order = await db.query.orders.findFirst({
        where: eq(orders.id, eventData.orderId),
        with: {
          seller: {
            columns: {
              id: true,
              stripeAccountId: true,
              email: true,
              name: true,
            },
          },
        },
      });

      if (!order) {
        return { released: false, reason: "Order not found" };
      }

      // Check if escrow is still held (no dispute opened)
      if (order.escrowStatus !== "held") {
        return {
          released: false,
          reason: `Escrow status is ${order.escrowStatus}`,
        };
      }

      // Transfer funds via Stripe before updating escrow status
      if (!order.seller?.stripeAccountId) {
        throw new Error(
          `Seller ${order.sellerId} has no Stripe account connected`
        );
      }

      try {
        await stripe.transfers.create(
          {
            amount: Math.round(Number(order.sellerPayout) * 100), // cents
            currency: "usd",
            destination: order.seller.stripeAccountId,
            metadata: {
              orderId: order.id,
              orderNumber: order.orderNumber,
            },
          },
          {
            idempotencyKey: `escrow-release-${order.id}`,
          }
        );
      } catch (error) {
        // If Stripe transfer fails, throw error to trigger Inngest retry
        throw new Error(
          `Failed to transfer funds for order ${order.id}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      // Update escrow status only after successful transfer
      await db
        .update(orders)
        .set({
          escrowStatus: "released",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, eventData.orderId));

      // Notify seller
      if (order.seller) {
        await resend.emails.send({
          from: "PlankMarket <noreply@plankmarket.com>",
          to: order.seller.email,
          subject: `Funds released for order ${order.orderNumber}`,
          html: `
            <p>Hi ${order.seller.name},</p>
            <p>Great news! Your shipment for order <strong>${order.orderNumber}</strong> has been picked up by the carrier, and funds have been released to your account.</p>
            <p><strong>Payout Details:</strong></p>
            <ul>
              <li>Order Number: ${order.orderNumber}</li>
              <li>Payout Amount: $${order.sellerPayout.toFixed(2)}</li>
              <li>Released: ${new Date().toLocaleDateString()}</li>
            </ul>
            <p>The funds should appear in your connected bank account within 2-3 business days.</p>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/seller/orders/${order.id}">View Order Details</a></p>
          `,
        });
      }

      return {
        released: true,
        orderId: eventData.orderId,
        orderNumber: order.orderNumber,
        payoutAmount: order.sellerPayout,
      };
    });

    return releaseResult;
  }
);
