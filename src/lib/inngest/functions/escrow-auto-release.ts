import { inngest } from "../client";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema/orders";
import { users } from "@/server/db/schema/users";
import { eq, and } from "drizzle-orm";
import { resend } from "@/lib/email/client";
import { env } from "@/env";
import Stripe from "stripe";
import { formatCurrency } from "@/lib/utils";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-01-28.clover" as const,
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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
      // Atomically update escrow status only if still "held" (prevents TOCTOU race)
      const [updatedOrder] = await db
        .update(orders)
        .set({
          escrowStatus: "released",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orders.id, eventData.orderId),
            eq(orders.escrowStatus, "held")
          )
        )
        .returning();

      if (!updatedOrder) {
        const order = await db
          .select({ escrowStatus: orders.escrowStatus })
          .from(orders)
          .where(eq(orders.id, eventData.orderId))
          .limit(1);

        return {
          released: false,
          reason: order.length === 0
            ? "Order not found"
            : `Escrow status is ${order[0].escrowStatus}`,
        };
      }

      // Execute Stripe Transfer to seller's connected account
      const seller = await db
        .select({
          email: users.email,
          name: users.name,
          stripeAccountId: users.stripeAccountId,
        })
        .from(users)
        .where(eq(users.id, updatedOrder.sellerId))
        .limit(1);

      if (seller.length > 0 && seller[0].stripeAccountId) {
        try {
          const amountCents = Math.round(updatedOrder.sellerPayout * 100);
          await stripe.transfers.create({
            amount: amountCents,
            currency: "usd",
            destination: seller[0].stripeAccountId,
            transfer_group: updatedOrder.orderNumber,
            metadata: {
              orderId: updatedOrder.id,
              orderNumber: updatedOrder.orderNumber,
            },
          });
        } catch (transferErr) {
          // Revert escrow status on transfer failure so Inngest can retry
          await db
            .update(orders)
            .set({ escrowStatus: "held", updatedAt: new Date() })
            .where(eq(orders.id, eventData.orderId));

          throw transferErr;
        }

        await resend.emails.send({
          from: env.EMAIL_FROM,
          to: seller[0].email,
          subject: `Funds released for order ${escapeHtml(updatedOrder.orderNumber)}`,
          html: `
            <p>Hi ${escapeHtml(seller[0].name)},</p>
            <p>Great news! The escrow funds for order <strong>${escapeHtml(updatedOrder.orderNumber)}</strong> have been released and transferred to your account.</p>
            <p><strong>Payout Details:</strong></p>
            <ul>
              <li>Order Number: ${escapeHtml(updatedOrder.orderNumber)}</li>
              <li>Payout Amount: ${formatCurrency(updatedOrder.sellerPayout)}</li>
              <li>Released: ${new Date().toLocaleDateString()}</li>
            </ul>
            <p>The funds should appear in your connected bank account within 2-3 business days.</p>
            <p><a href="${env.NEXT_PUBLIC_APP_URL}/seller/orders/${updatedOrder.id}">View Order Details</a></p>
          `,
        });
      }

      return {
        released: true,
        orderId: eventData.orderId,
        orderNumber: updatedOrder.orderNumber,
        payoutAmount: updatedOrder.sellerPayout,
      };
    });

    return releaseResult;
  }
);
