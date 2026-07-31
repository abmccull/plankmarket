import { inngest } from "../client";
import { db } from "@/server/db";
import {
  offers,
  agentConfigs,
  agentActions,
  notifications,
  users,
  offerEvents,
} from "@/server/db/schema";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { isPro } from "@/lib/pro";
import {
  buildOfferResponseDeadlineEvent,
  OFFER_RESPONSE_WINDOW_MS,
} from "@/lib/offer-lifecycle";

export const agentOfferHandler = inngest.createFunction(
  { id: "agent-offer-handler", name: "AI Agent: Auto-Handle Offer" },
  { event: "offer/created" },
  async ({ event, step }) => {
    const { offerId } = event.data as { offerId: string };

    // Step 1: Load the offer with its listing
    const offer = await step.run("load-offer", async () => {
      return db.query.offers.findFirst({
        where: eq(offers.id, offerId),
        with: { listing: true },
      });
    });
    if (!offer || offer.status !== "pending") return;

    // Step 2: Check if seller has agent config with auto-offer enabled
    const config = await step.run("load-config", async () => {
      return db.query.agentConfigs.findFirst({
        where: eq(agentConfigs.userId, offer.sellerId),
      });
    });
    if (!config?.offerAutoEnabled) return;

    // Step 3: Check seller is Pro
    const seller = await step.run("check-pro", async () => {
      return db.query.users.findFirst({
        where: eq(users.id, offer.sellerId),
        columns: { proStatus: true, proExpiresAt: true },
      });
    });
    if (!seller) return;
    // Inngest serializes dates to strings; reconstruct for isPro check
    const proCheckable = {
      proStatus: seller.proStatus ?? "free",
      proExpiresAt: seller.proExpiresAt
        ? new Date(seller.proExpiresAt as unknown as string)
        : null,
    };
    if (!isPro(proCheckable)) return;

    // Step 4: Evaluate offer against rules and take action
    const askPrice = Number(offer.listing.askPricePerSqFt);
    const offerPrice = Number(offer.offerPricePerSqFt);

    if (!askPrice || askPrice <= 0) {
      // Can't evaluate offer against zero/missing ask price
      return;
    }

    const offerPercent = (offerPrice / askPrice) * 100;

    const actionResult = await step.run("apply-rules", async () => {
      const transitionAt = new Date();
      const offerIsStillActionable = and(
        eq(offers.id, offerId),
        eq(offers.status, "pending"),
        eq(offers.currentRound, offer.currentRound),
        eq(offers.lastActorId, offer.buyerId),
        or(isNull(offers.expiresAt), gt(offers.expiresAt, transitionAt)),
      );

      if (
        config.offerAcceptAbove !== null &&
        offerPercent >= config.offerAcceptAbove
      ) {
        // AUTO-ACCEPT
        const expiresAt = new Date(
          transitionAt.getTime() + OFFER_RESPONSE_WINDOW_MS,
        );
        return db.transaction(async (tx) => {
          const [accepted] = await tx
            .update(offers)
            .set({
              status: "accepted",
              lastActorId: offer.sellerId,
              expiresAt,
              updatedAt: transitionAt,
            })
            .where(offerIsStillActionable)
            .returning({ id: offers.id });

          if (!accepted) {
            // Recover a committed acceptance if this Inngest step crashed
            // before its result was checkpointed. The stable event ID below
            // makes re-emission safe when a manual acceptance won instead.
            const currentOffer = await tx.query.offers.findFirst({
              where: eq(offers.id, offerId),
              columns: {
                status: true,
                expiresAt: true,
              },
            });
            if (
              currentOffer?.status === "accepted" &&
              currentOffer.expiresAt
            ) {
              return {
                action: "accepted" as const,
                expiresAt: currentOffer.expiresAt.toISOString(),
              };
            }
            return null;
          }

          await tx.insert(agentActions).values({
            userId: offer.sellerId,
            actionType: "offer_accepted",
            relatedId: offerId,
            details: {
              offerPercent,
              askPrice,
              offerPrice,
              rule: "accept_above",
            },
          });

          await tx.insert(offerEvents).values({
            offerId,
            actorId: offer.sellerId,
            eventType: "accept",
            pricePerSqFt: offerPrice,
            quantitySqFt: offer.quantitySqFt,
            totalPrice:
              Math.round(offerPrice * offer.quantitySqFt * 100) / 100,
            message: "Auto-accepted by AI agent",
          });

          await tx.insert(notifications).values({
            userId: offer.sellerId,
            type: "system",
            title: "Agent Accepted Offer",
            message: `Your AI agent accepted an offer of $${offerPrice}/sqft (${offerPercent.toFixed(0)}% of ask) on your listing.`,
            data: { offerId, listingId: offer.listingId },
            read: false,
          });

          // Also notify the buyer that their offer was accepted
          await tx.insert(notifications).values({
            userId: offer.buyerId,
            type: "system",
            title: "Offer Accepted",
            message: `Your offer of $${offerPrice}/sqft has been accepted.`,
            data: { offerId, listingId: offer.listingId },
            read: false,
          });

          return {
            action: "accepted" as const,
            expiresAt: expiresAt.toISOString(),
          };
        });
      }

      if (
        config.offerCounterAt !== null &&
        config.offerAcceptAbove !== null && // Must have explicit accept threshold to calculate counter price
        offerPercent >= config.offerCounterAt
      ) {
        // AUTO-COUNTER at the accept threshold price
        const counterPrice = (askPrice * config.offerAcceptAbove) / 100;
        const expiresAt = new Date(
          transitionAt.getTime() + OFFER_RESPONSE_WINDOW_MS,
        );

        return db.transaction(async (tx) => {
          const [countered] = await tx
            .update(offers)
            .set({
              status: "countered",
              counterPricePerSqFt: counterPrice,
              counterMessage:
                config.offerCounterMessage ??
                "Counter-offer from seller's automated pricing.",
              currentRound: (offer.currentRound ?? 1) + 1,
              lastActorId: offer.sellerId,
              expiresAt,
              updatedAt: transitionAt,
            })
            .where(offerIsStillActionable)
            .returning({ id: offers.id });

          if (!countered) {
            const currentOffer = await tx.query.offers.findFirst({
              where: eq(offers.id, offerId),
              columns: {
                status: true,
                expiresAt: true,
                lastActorId: true,
                currentRound: true,
              },
            });
            if (
              currentOffer?.status === "countered" &&
              currentOffer.lastActorId === offer.sellerId &&
              currentOffer.currentRound === (offer.currentRound ?? 1) + 1 &&
              currentOffer.expiresAt
            ) {
              return {
                action: "countered" as const,
                expiresAt: currentOffer.expiresAt.toISOString(),
              };
            }
            return null;
          }

          await tx.insert(agentActions).values({
            userId: offer.sellerId,
            actionType: "offer_countered",
            relatedId: offerId,
            details: { offerPercent, counterPrice, rule: "counter_at" },
          });

          await tx.insert(offerEvents).values({
            offerId,
            actorId: offer.sellerId,
            eventType: "counter",
            pricePerSqFt: counterPrice,
            quantitySqFt: offer.quantitySqFt,
            totalPrice:
              Math.round(counterPrice * offer.quantitySqFt * 100) / 100,
            message:
              config.offerCounterMessage ??
              "Counter-offer from seller's automated pricing.",
          });

          await tx.insert(notifications).values({
            userId: offer.sellerId,
            type: "system",
            title: "Agent Countered Offer",
            message: `Your AI agent countered at $${counterPrice.toFixed(2)}/sqft (was $${offerPrice}/sqft).`,
            data: { offerId, listingId: offer.listingId },
            read: false,
          });

          // Notify buyer of counter
          await tx.insert(notifications).values({
            userId: offer.buyerId,
            type: "system",
            title: "Offer Countered",
            message: `The seller countered your offer with $${counterPrice.toFixed(2)}/sqft.`,
            data: { offerId, listingId: offer.listingId },
            read: false,
          });

          return {
            action: "countered" as const,
            expiresAt: expiresAt.toISOString(),
          };
        });
      }

      if (
        config.offerRejectBelow !== null &&
        offerPercent < config.offerRejectBelow
      ) {
        // AUTO-REJECT
        return db.transaction(async (tx) => {
          const [rejected] = await tx
            .update(offers)
            .set({
              status: "rejected",
              counterMessage:
                config.offerRejectMessage ??
                "This offer is below the seller's minimum threshold.",
              lastActorId: offer.sellerId,
              updatedAt: transitionAt,
            })
            .where(offerIsStillActionable)
            .returning({ id: offers.id });

          if (!rejected) return null; // Already handled manually or expired

          await tx.insert(agentActions).values({
            userId: offer.sellerId,
            actionType: "offer_rejected",
            relatedId: offerId,
            details: { offerPercent, rule: "reject_below" },
          });

          await tx.insert(offerEvents).values({
            offerId,
            actorId: offer.sellerId,
            eventType: "reject",
            pricePerSqFt: offerPrice,
            quantitySqFt: offer.quantitySqFt,
            totalPrice:
              Math.round(offerPrice * offer.quantitySqFt * 100) / 100,
            message:
              config.offerRejectMessage ??
              "This offer is below the seller's minimum threshold.",
          });

          await tx.insert(notifications).values({
            userId: offer.sellerId,
            type: "system",
            title: "Agent Rejected Offer",
            message: `Your AI agent rejected an offer of $${offerPrice}/sqft (${offerPercent.toFixed(0)}% of ask, below your ${config.offerRejectBelow}% threshold).`,
            data: { offerId, listingId: offer.listingId },
            read: false,
          });

          // Notify buyer of rejection
          await tx.insert(notifications).values({
            userId: offer.buyerId,
            type: "system",
            title: "Offer Rejected",
            message: `Your offer of $${offerPrice}/sqft was declined.`,
            data: { offerId, listingId: offer.listingId },
            read: false,
          });

          return { action: "rejected" as const };
        });
      }

      // If between reject and counter thresholds (or thresholds not set), do nothing -- let seller handle manually
      return null;
    });

    if (actionResult?.action === "accepted") {
      await step.sendEvent("emit-offer-accepted", {
        id: `offer-accepted:${offerId}`,
        name: "offer/accepted",
        data: {
          offerId,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
          listingId: offer.listingId,
          listingTitle: offer.listing.title,
          acceptedPrice: `$${offerPrice.toFixed(2)}/sq ft`,
          quantity: `${Number(offer.quantitySqFt).toLocaleString()} sq ft`,
          estimatedTotal: `$${(
            offerPrice * Number(offer.quantitySqFt)
          ).toFixed(2)}`,
          expiresAt: actionResult.expiresAt,
        },
      });
    } else if (actionResult?.action === "countered") {
      await step.sendEvent(
        "emit-offer-response-deadline",
        buildOfferResponseDeadlineEvent(
          offerId,
          new Date(actionResult.expiresAt),
        ),
      );
    }
  }
);
