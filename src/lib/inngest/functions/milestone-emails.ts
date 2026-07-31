import { inngest } from "../client";
import { db } from "@/server/db";
import { users, listings, orders } from "@/server/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { sendMilestoneCongratsEmail } from "@/lib/email/send";

export const firstListingCongrats = inngest.createFunction(
  { id: "first-listing-congrats", name: "First Listing Congratulation Email" },
  { event: "listing/created" },
  async ({ event, step }) => {
    const { listingId, sellerId } = event.data;

    const shouldSend = await step.run("check-first-listing", async () => {
      const [count] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(listings)
        .where(eq(listings.sellerId, sellerId));

      // Only send if this is their first listing (count === 1)
      return (count?.count ?? 0) === 1;
    });

    if (!shouldSend) {
      return { sent: false, reason: "Not first listing" };
    }

    await step.run("send-congrats", async () => {
      const seller = await db.query.users.findFirst({
        where: eq(users.id, sellerId),
      });
      if (seller) {
        await sendMilestoneCongratsEmail({
          to: seller.email,
          name: seller.name,
          milestone: "first_listing",
          idempotencyKey: `first-listing-${listingId}`,
        });
      }
    });

    return { sent: true, sellerId };
  }
);

export const firstPurchaseCongrats = inngest.createFunction(
  { id: "first-purchase-congrats", name: "First Purchase Congratulation Email" },
  { event: "order/confirmed" },
  async ({ event, step }) => {
    const { orderId, buyerId } = event.data;

    const shouldSend = await step.run("check-first-purchase", async () => {
      const [count] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(
          and(
            eq(orders.buyerId, buyerId),
            inArray(orders.paymentStatus, [
              "succeeded",
              "partially_refunded",
            ]),
          ),
        );

      // Only send if this is their first order (count === 1)
      return (count?.count ?? 0) === 1;
    });

    if (!shouldSend) {
      return { sent: false, reason: "Not first purchase" };
    }

    await step.run("send-congrats", async () => {
      const buyer = await db.query.users.findFirst({
        where: eq(users.id, buyerId),
      });
      if (buyer) {
        await sendMilestoneCongratsEmail({
          to: buyer.email,
          name: buyer.name,
          milestone: "first_purchase",
          idempotencyKey: `first-purchase-${orderId}`,
        });
      }
    });

    return { sent: true, buyerId };
  }
);
