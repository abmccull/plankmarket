import { inngest } from "../client";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema/orders";
import { listings } from "@/server/db/schema/listings";
import { users } from "@/server/db/schema/users";
import { eq } from "drizzle-orm";
import { sendEmailOrThrow } from "@/lib/email/delivery";
import { buildEmailIdempotencyKey } from "@/lib/email/delivery-policy";
import { env } from "@/env";
import { escapeHtml } from "@/lib/utils";

export const abandonedCheckout = inngest.createFunction(
  { id: "abandoned-checkout", name: "Send Abandoned Checkout Reminder" },
  { event: "checkout/started" },
  async ({ event, step }) => {
    const checkoutData = event.data;

    // Wait 2 hours
    await step.sleep("wait-2-hours", "2h");

    const checkoutStatus = await step.run("check-order-status", async () => {
      // Check this exact reserved order. Looking up by listing alone can match
      // another buyer's order and incorrectly suppress the reminder.
      const [existingOrder] = await db
        .select({
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          quantitySqFt: orders.quantitySqFt,
          pricePerSqFt: orders.pricePerSqFt,
          totalPrice: orders.totalPrice,
        })
        .from(orders)
        .where(eq(orders.id, checkoutData.checkoutId))
        .limit(1);

      return {
        shouldRemind:
          existingOrder?.status === "pending" &&
          !["succeeded", "partially_refunded", "refunded"].includes(
            existingOrder.paymentStatus ?? "",
          ),
        checkoutId: checkoutData.checkoutId,
        quantitySqFt: Number(existingOrder?.quantitySqFt ?? 0),
        pricePerSqFt: Number(existingOrder?.pricePerSqFt ?? 0),
        totalPrice: Number(existingOrder?.totalPrice ?? 0),
      };
    });

    if (checkoutStatus.shouldRemind) {
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
            materialType: listings.materialType,
          })
          .from(listings)
          .where(eq(listings.id, checkoutData.listingId))
          .limit(1);

        if (buyer.length > 0 && listing.length > 0) {
          await sendEmailOrThrow({
            category: "abandoned_checkout",
            idempotencyKey: buildEmailIdempotencyKey(
              "abandoned_checkout",
              checkoutData.checkoutId,
              checkoutData.buyerId,
            ),
            message: {
              from: env.EMAIL_FROM,
              to: buyer[0].email,
              subject: `Complete your purchase of ${escapeHtml(listing[0].title)}`,
              html: `
              <p>Hi ${escapeHtml(buyer[0].name ?? "")},</p>
              <p>You started checkout for <strong>${escapeHtml(listing[0].title)}</strong> but didn't complete your purchase.</p>
              <p><strong>Order Details:</strong></p>
              <ul>
                <li>Material: ${escapeHtml(listing[0].materialType)}</li>
                <li>Quantity: ${checkoutStatus.quantitySqFt.toLocaleString()} sq ft</li>
                <li>Order price: $${checkoutStatus.pricePerSqFt.toFixed(2)}/sq ft</li>
                <li>Total charged at checkout: $${checkoutStatus.totalPrice.toFixed(2)}</li>
              </ul>
              <p>Your reserved order is still waiting. Complete payment before the reservation expires.</p>
              <p><a href="${env.NEXT_PUBLIC_APP_URL}/listings/${listing[0].id}">Complete Purchase</a></p>
              <p>Have questions? Reply to this email and we'll help.</p>
            `,
            },
          });
        }
      });

      return { reminderSent: true, checkoutId: checkoutData.checkoutId };
    }

    return {
      reminderSent: false,
      reason: "Checkout completed, cancelled, or no longer available",
    };
  }
);
