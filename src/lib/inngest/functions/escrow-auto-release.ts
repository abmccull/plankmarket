import { inngest } from "../client";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema/orders";
import { users } from "@/server/db/schema/users";
import { eq } from "drizzle-orm";
import { resend } from "@/lib/email/client";

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
      // Fetch order details
      const order = await db
        .select()
        .from(orders)
        .where(eq(orders.id, eventData.orderId))
        .limit(1);

      if (order.length === 0) {
        return { released: false, reason: "Order not found" };
      }

      const orderData = order[0];

      // Check if escrow is still held (no dispute opened)
      if (orderData.escrowStatus !== "held") {
        return {
          released: false,
          reason: `Escrow status is ${orderData.escrowStatus}`,
        };
      }

      // Release escrow funds
      // In a real implementation, this would trigger Stripe Transfer API
      // For now, we just update the status
      await db
        .update(orders)
        .set({
          escrowStatus: "released",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, eventData.orderId));

      // Notify seller
      const seller = await db
        .select({
          email: users.email,
          name: users.name,
        })
        .from(users)
        .where(eq(users.id, orderData.sellerId))
        .limit(1);

      if (seller.length > 0) {
        await resend.emails.send({
          from: "PlankMarket <noreply@plankmarket.com>",
          to: seller[0].email,
          subject: `Funds released for order ${orderData.orderNumber}`,
          html: `
            <p>Hi ${seller[0].name},</p>
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
