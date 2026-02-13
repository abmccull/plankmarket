import { inngest } from "../client";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema/orders";
import { listings } from "@/server/db/schema/listings";
import { users } from "@/server/db/schema/users";
import { eq, and } from "drizzle-orm";
import { resend } from "@/lib/email/client";
import { env } from "@/env";
import { formatCurrency } from "@/lib/utils";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface CheckoutStartedEvent {
  data: {
    checkoutId: string;
    buyerId: string;
    listingId: string;
    quantitySqFt: number;
    totalPrice: number;
  };
}

export const abandonedCheckout = inngest.createFunction(
  { id: "abandoned-checkout", name: "Send Abandoned Checkout Reminder" },
  { event: "checkout/started" },
  async ({ event, step }) => {
    const checkoutData = event.data as CheckoutStartedEvent["data"];

    // Wait 2 hours
    await step.sleep("wait-2-hours", "2h");

    const checkoutStatus = await step.run("check-order-status", async () => {
      // Check if THIS BUYER completed an order for THIS LISTING (not just any buyer)
      const existingOrder = await db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.listingId, checkoutData.listingId),
            eq(orders.buyerId, checkoutData.buyerId)
          )
        )
        .limit(1);

      return {
        orderCompleted: existingOrder.length > 0,
        checkoutId: checkoutData.checkoutId,
      };
    });

    if (!checkoutStatus.orderCompleted) {
      await step.run("send-reminder-email", async () => {
        const buyer = await db
          .select({
            email: users.email,
            name: users.name,
          })
          .from(users)
          .where(eq(users.id, checkoutData.buyerId))
          .limit(1);

        const listing = await db
          .select({
            id: listings.id,
            title: listings.title,
            askPricePerSqFt: listings.askPricePerSqFt,
            totalSqFt: listings.totalSqFt,
            materialType: listings.materialType,
          })
          .from(listings)
          .where(eq(listings.id, checkoutData.listingId))
          .limit(1);

        if (buyer.length > 0 && listing.length > 0) {
          await resend.emails.send({
            from: env.EMAIL_FROM,
            to: buyer[0].email,
            subject: `Complete your purchase of ${escapeHtml(listing[0].title)}`,
            html: `
              <p>Hi ${escapeHtml(buyer[0].name)},</p>
              <p>You started checkout for <strong>${escapeHtml(listing[0].title)}</strong> but didn't complete your purchase.</p>
              <p><strong>Order Details:</strong></p>
              <ul>
                <li>Material: ${escapeHtml(listing[0].materialType)}</li>
                <li>Quantity: ${checkoutData.quantitySqFt} sq ft</li>
                <li>Price: $${listing[0].askPricePerSqFt}/sq ft</li>
                <li>Total: ${formatCurrency(checkoutData.totalPrice)}</li>
              </ul>
              <p>This listing is still available. Complete your purchase before someone else does!</p>
              <p><a href="${env.NEXT_PUBLIC_APP_URL}/listings/${listing[0].id}">Complete Purchase</a></p>
              <p>Have questions? Contact us at support@plankmarket.com.</p>
            `,
          });
        }
      });

      return { reminderSent: true, checkoutId: checkoutData.checkoutId };
    }

    return { reminderSent: false, reason: "Order completed" };
  }
);
