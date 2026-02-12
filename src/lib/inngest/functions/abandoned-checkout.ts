import { inngest } from "../client";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema/orders";
import { listings } from "@/server/db/schema/listings";
import { users } from "@/server/db/schema/users";
import { eq } from "drizzle-orm";
import { resend } from "@/lib/email/client";

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
      // Check if order was completed
      const existingOrder = await db
        .select()
        .from(orders)
        .where(eq(orders.listingId, checkoutData.listingId))
        .limit(1);

      return {
        orderCompleted: existingOrder.length > 0,
        checkoutId: checkoutData.checkoutId,
      };
    });

    if (!checkoutStatus.orderCompleted) {
      await step.run("send-reminder-email", async () => {
        // Fetch buyer and listing details
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
            from: "PlankMarket <noreply@plankmarket.com>",
            to: buyer[0].email,
            subject: `Complete your purchase of ${listing[0].title}`,
            html: `
              <p>Hi ${buyer[0].name},</p>
              <p>You started checkout for <strong>${listing[0].title}</strong> but didn't complete your purchase.</p>
              <p><strong>Order Details:</strong></p>
              <ul>
                <li>Material: ${listing[0].materialType}</li>
                <li>Quantity: ${checkoutData.quantitySqFt} sq ft</li>
                <li>Price: $${listing[0].askPricePerSqFt}/sq ft</li>
                <li>Total: $${checkoutData.totalPrice.toFixed(2)}</li>
              </ul>
              <p>This listing is still available. Complete your purchase before someone else does!</p>
              <p><a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/listings/${listing[0].id}">Complete Purchase</a></p>
              <p>Have questions? Reply to this email and we'll help.</p>
            `,
          });
        }
      });

      return { reminderSent: true, checkoutId: checkoutData.checkoutId };
    }

    return { reminderSent: false, reason: "Order completed" };
  }
);
