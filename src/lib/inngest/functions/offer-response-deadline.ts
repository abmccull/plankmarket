import { and, eq, inArray, lte } from "drizzle-orm";
import { inngest } from "../client";
import { db } from "@/server/db";
import { offerEvents, offers } from "@/server/db/schema";
import { OFFER_RESPONSE_DEADLINE_EVENT } from "@/lib/offer-lifecycle";

interface OfferResponseDeadlineEvent {
  data: {
    offerId: string;
    expiresAt: string;
  };
}

export const offerResponseDeadline = inngest.createFunction(
  {
    id: "offer-response-deadline",
    name: "Offers: Expire Unanswered Negotiations",
  },
  { event: OFFER_RESPONSE_DEADLINE_EVENT },
  async ({ event, step }) => {
    const eventData = event.data as OfferResponseDeadlineEvent["data"];
    const scheduledDeadline = new Date(eventData.expiresAt);

    if (Number.isNaN(scheduledDeadline.getTime())) {
      return {
        expired: false,
        offerId: eventData.offerId,
        reason: "Invalid response deadline",
      };
    }

    await step.sleepUntil("wait-for-response-deadline", scheduledDeadline);

    return step.run("expire-unanswered-offer", async () => {
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
              inArray(offers.status, ["pending", "countered"]),
              lte(offers.expiresAt, now),
            ),
          )
          .returning({
            id: offers.id,
            buyerId: offers.buyerId,
            sellerId: offers.sellerId,
            lastActorId: offers.lastActorId,
            offerPricePerSqFt: offers.offerPricePerSqFt,
            counterPricePerSqFt: offers.counterPricePerSqFt,
            quantitySqFt: offers.quantitySqFt,
          });

        if (expiredOffer) {
          const pricePerSqFt =
            expiredOffer.counterPricePerSqFt ??
            expiredOffer.offerPricePerSqFt;
          const responsePartyId =
            expiredOffer.lastActorId === expiredOffer.buyerId
              ? expiredOffer.sellerId
              : expiredOffer.buyerId;

          await tx.insert(offerEvents).values({
            offerId: expiredOffer.id,
            actorId: responsePartyId,
            eventType: "expire",
            pricePerSqFt,
            quantitySqFt: expiredOffer.quantitySqFt,
            totalPrice:
              Math.round(
                pricePerSqFt * expiredOffer.quantitySqFt * 100,
              ) / 100,
            message:
              "Automatically expired after the 48-hour response window.",
          });

          return {
            expired: true,
            offerId: expiredOffer.id,
          };
        }

        const currentOffer = await tx.query.offers.findFirst({
          where: eq(offers.id, eventData.offerId),
          columns: {
            status: true,
            expiresAt: true,
          },
        });

        if (!currentOffer) {
          return {
            expired: false,
            offerId: eventData.offerId,
            reason: "Offer not found",
          };
        }

        return {
          expired: false,
          offerId: eventData.offerId,
          reason:
            currentOffer.expiresAt &&
            currentOffer.expiresAt.getTime() > now.getTime()
              ? "A newer response deadline is active"
              : `Offer status is ${currentOffer.status}`,
        };
      });
    });
  },
);
