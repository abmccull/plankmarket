import { inngest } from "../client";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema/orders";
import { users } from "@/server/db/schema/users";
import { eq } from "drizzle-orm";
import { resend } from "@/lib/email/client";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover" as Stripe.LatestApiVersion,
});

interface OrderDeliveredEvent {
  data: {
    orderId: string;
    deliveredAt: string;
  };
}

export const escrowAutoRelease = inngest.createFunction(
  { id: "escrow-auto-release", name: "Auto-release Escrow Funds" },
  { event: "order/delivered" },
  async ({ event, step }) => {
    const eventData = event.data as OrderDeliveredEvent["data"];

    // Wait 3 days
    await step.sleep("wait-3-days", "3d");

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

      const orderData = order;

      // Check if escrow is still held (no dispute opened)
      if (orderData.escrowStatus !== "held") {
        return {
          released: false,
          reason: `Escrow status is ${orderData.escrowStatus}`,
        };
      }

      // Transfer funds via Stripe before updating escrow status
      if (!orderData.seller?.stripeAccountId) {
        throw new Error(
          `Seller ${orderData.sellerId} has no Stripe account connected`
        );
      }

      try {
        await stripe.transfers.create(
          {
            amount: Math.round(Number(orderData.sellerPayout) * 100), // cents
            currency: "usd",
            destination: orderData.seller.stripeAccountId,
            metadata: {
              orderId: orderData.id,
              orderNumber: orderData.orderNumber,
            },
          },
          {
            idempotencyKey: `escrow-release-${orderData.id}`,
          }
        );
      } catch (error) {
        // If Stripe transfer fails, throw error to trigger Inngest retry
        throw new Error(
          `Failed to transfer funds for order ${orderData.id}: ${error instanceof Error ? error.message : "Unknown error"}`
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

      // Notify seller (use seller from order relation)
      if (orderData.seller) {
        await resend.emails.send({
          from: "PlankMarket <noreply@plankmarket.com>",
          to: orderData.seller.email,
          subject: `Funds released for order ${orderData.orderNumber}`,
          html: `
            <p>Hi ${orderData.seller.name},</p>
            <p>Great news! The escrow funds for order <strong>${orderData.orderNumber}</strong> have been released and transferred to your account.</p>
            <p><strong>Payout Details:</strong></p>
            <ul>
              <li>Order Number: ${orderData.orderNumber}</li>
              <li>Payout Amount: $${orderData.sellerPayout.toFixed(2)}</li>
              <li>Released: ${new Date().toLocaleDateString()}</li>
            </ul>
            <p>The funds should appear in your connected bank account within 2-3 business days.</p>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/seller/orders/${orderData.id}">View Order Details</a></p>
          `,
        });
      }

      return {
        released: true,
        orderId: eventData.orderId,
        orderNumber: orderData.orderNumber,
        payoutAmount: orderData.sellerPayout,
      };
    });

    return releaseResult;
  }
);
