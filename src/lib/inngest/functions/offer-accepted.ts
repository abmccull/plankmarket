import { inngest } from "../client";
import { db } from "@/server/db";
import { offers } from "@/server/db/schema/offers";
import { users } from "@/server/db/schema/users";
import { eq } from "drizzle-orm";
import { sendOfferAcceptedEmail } from "@/lib/email/send";

interface OfferAcceptedEvent {
  data: {
    offerId: string;
    buyerId: string;
    listingId: string;
    listingTitle: string;
    acceptedPrice: string;
    quantity: string;
    estimatedTotal: string;
    expiresAt: string;
  };
}

export const offerAccepted = inngest.createFunction(
  { id: "offer-accepted", name: "Send Offer Accepted Email & Auto-Expire" },
  { event: "offer/accepted" },
  async ({ event, step }) => {
    const eventData = event.data as OfferAcceptedEvent["data"];

    await step.run("send-checkout-email", async () => {
      const buyer = await db
        .select({
          email: users.email,
          name: users.name,
        })
        .from(users)
        .where(eq(users.id, eventData.buyerId))
        .limit(1);

      if (buyer.length === 0) {
        return { sent: false, reason: "Buyer not found" };
      }

      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const checkoutUrl = `${appUrl}/listings/${eventData.listingId}/checkout?offerId=${eventData.offerId}`;

      await sendOfferAcceptedEmail({
        to: buyer[0].email,
        buyerName: buyer[0].name,
        listingTitle: eventData.listingTitle,
        acceptedPrice: eventData.acceptedPrice,
        quantity: eventData.quantity,
        estimatedTotal: eventData.estimatedTotal,
        checkoutUrl,
        expiresAt: eventData.expiresAt,
      });

      return { sent: true, email: buyer[0].email };
    });

    // Wait 48 hours for the buyer to complete checkout
    await step.sleep("wait-for-payment", "48h");

    const expiryResult = await step.run("check-and-expire", async () => {
      const offer = await db.query.offers.findFirst({
        where: eq(offers.id, eventData.offerId),
      });

      if (!offer) {
        return { expired: false, reason: "Offer not found" };
      }

      // Only expire if still accepted and no order was created
      if (offer.status === "accepted" && !offer.orderId) {
        await db
          .update(offers)
          .set({
            status: "expired",
            updatedAt: new Date(),
          })
          .where(eq(offers.id, eventData.offerId));

        return { expired: true, offerId: eventData.offerId };
      }

      return {
        expired: false,
        reason:
          offer.orderId
            ? "Order already created"
            : `Offer status is ${offer.status}`,
      };
    });

    return expiryResult;
  }
);
