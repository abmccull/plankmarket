import { inngest } from "../client";
import { db } from "@/server/db";
import { users, listings, orders } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";
import { sendMilestoneCongratsEmail } from "@/lib/email/send";

interface ListingCreatedEvent {
  data: {
    listingId: string;
    sellerId: string;
  };
}

interface OrderConfirmedEvent {
  data: {
    orderId: string;
    buyerId: string;
  };
}

export const firstListingCongrats = inngest.createFunction(
  { id: "first-listing-congrats", name: "First Listing Congratulation Email" },
  { event: "listing/created" },
  async ({ event, step }) => {
    const { sellerId } = event.data as ListingCreatedEvent["data"];

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
    const { buyerId } = event.data as OrderConfirmedEvent["data"];

    const shouldSend = await step.run("check-first-purchase", async () => {
      const [count] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(eq(orders.buyerId, buyerId));

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
        });
      }
    });

    return { sent: true, buyerId };
  }
);
