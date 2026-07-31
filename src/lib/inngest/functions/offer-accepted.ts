import { inngest } from "../client";
import { db } from "@/server/db";
import { offers } from "@/server/db/schema/offers";
import { offerEvents } from "@/server/db/schema/offer-events";
import { users } from "@/server/db/schema/users";
import { and, eq, isNull, lte } from "drizzle-orm";
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
        idempotencyKey: `offer-accepted-${eventData.offerId}`,
      });

      return { sent: true, email: buyer[0].email };
    });

    // Wait until the exact checkout deadline. This stays correct even if
    // delivery of the accepted event or a retry starts later than acceptance.
    await step.sleepUntil(
      "wait-for-payment",
      new Date(eventData.expiresAt),
    );

    const expiryResult = await step.run("check-and-expire", async () => {
      const now = new Date();
      return db.transaction(async (tx) => {
        const [expiredOffer] = await tx
          .update(offers)
          .set({
            status: "expired",
            updatedAt: now,
          })
          .where(
            and(
              eq(offers.id, eventData.offerId),
              eq(offers.status, "accepted"),
              isNull(offers.orderId),
              lte(offers.expiresAt, now),
            ),
          )
          .returning({
            id: offers.id,
            offerPricePerSqFt: offers.offerPricePerSqFt,
            counterPricePerSqFt: offers.counterPricePerSqFt,
            quantitySqFt: offers.quantitySqFt,
          });

        if (expiredOffer) {
          const pricePerSqFt =
            expiredOffer.counterPricePerSqFt ??
            expiredOffer.offerPricePerSqFt;
          await tx.insert(offerEvents).values({
            offerId: eventData.offerId,
            actorId: eventData.buyerId,
            eventType: "expire",
            pricePerSqFt,
            quantitySqFt: expiredOffer.quantitySqFt,
            totalPrice:
              Math.round(
                pricePerSqFt * expiredOffer.quantitySqFt * 100,
              ) / 100,
            message:
              "Automatically expired after the 48-hour checkout window; no order was created.",
          });

          return { expired: true, offerId: eventData.offerId };
        }

        const offer = await tx.query.offers.findFirst({
          where: eq(offers.id, eventData.offerId),
        });

        if (!offer) {
          return { expired: false, reason: "Offer not found" };
        }

        return {
          expired: false,
          reason:
          offer.orderId
            ? "Order already created"
            : `Offer status is ${offer.status}`,
        };
      });
    });

    return expiryResult;
  }
);
