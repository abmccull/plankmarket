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
import { eq, and } from "drizzle-orm";
import { isPro } from "@/lib/pro";

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

    await step.run("apply-rules", async () => {
      if (
        config.offerAcceptAbove !== null &&
        offerPercent >= config.offerAcceptAbove
      ) {
        // AUTO-ACCEPT
        const [accepted] = await db
          .update(offers)
          .set({ status: "accepted", updatedAt: new Date() })
          .where(and(eq(offers.id, offerId), eq(offers.status, "pending")))
          .returning({ id: offers.id });

        if (!accepted) return; // Already handled manually

        await db.insert(agentActions).values({
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

        await db.insert(offerEvents).values({
          offerId,
          actorId: offer.sellerId,
          eventType: "accept",
          pricePerSqFt: offerPrice,
          message: "Auto-accepted by AI agent",
        });

        await db.insert(notifications).values({
          userId: offer.sellerId,
          type: "system",
          title: "Agent Accepted Offer",
          message: `Your AI agent accepted an offer of $${offerPrice}/sqft (${offerPercent.toFixed(0)}% of ask) on your listing.`,
          data: { offerId, listingId: offer.listingId },
          read: false,
        });

        // Also notify the buyer that their offer was accepted
        await db.insert(notifications).values({
          userId: offer.buyerId,
          type: "system",
          title: "Offer Accepted",
          message: `Your offer of $${offerPrice}/sqft has been accepted.`,
          data: { offerId, listingId: offer.listingId },
          read: false,
        });
      } else if (
        config.offerCounterAt !== null &&
        config.offerAcceptAbove !== null && // Must have explicit accept threshold to calculate counter price
        offerPercent >= config.offerCounterAt
      ) {
        // AUTO-COUNTER at the accept threshold price
        const counterPrice = (askPrice * config.offerAcceptAbove) / 100;

        const [countered] = await db
          .update(offers)
          .set({
            status: "countered",
            counterPricePerSqFt: counterPrice,
            counterMessage:
              config.offerCounterMessage ??
              "Counter-offer from seller's automated pricing.",
            currentRound: (offer.currentRound ?? 1) + 1,
            lastActorId: offer.sellerId,
            updatedAt: new Date(),
          })
          .where(and(eq(offers.id, offerId), eq(offers.status, "pending")))
          .returning({ id: offers.id });

        if (!countered) return; // Already handled manually

        await db.insert(agentActions).values({
          userId: offer.sellerId,
          actionType: "offer_countered",
          relatedId: offerId,
          details: { offerPercent, counterPrice, rule: "counter_at" },
        });

        await db.insert(offerEvents).values({
          offerId,
          actorId: offer.sellerId,
          eventType: "counter",
          pricePerSqFt: counterPrice,
          message:
            config.offerCounterMessage ??
            "Counter-offer from seller's automated pricing.",
        });

        await db.insert(notifications).values({
          userId: offer.sellerId,
          type: "system",
          title: "Agent Countered Offer",
          message: `Your AI agent countered at $${counterPrice.toFixed(2)}/sqft (was $${offerPrice}/sqft).`,
          data: { offerId, listingId: offer.listingId },
          read: false,
        });

        // Notify buyer of counter
        await db.insert(notifications).values({
          userId: offer.buyerId,
          type: "system",
          title: "Offer Countered",
          message: `The seller countered your offer with $${counterPrice.toFixed(2)}/sqft.`,
          data: { offerId, listingId: offer.listingId },
          read: false,
        });
      } else if (
        config.offerRejectBelow !== null &&
        offerPercent < config.offerRejectBelow
      ) {
        // AUTO-REJECT
        const [rejected] = await db
          .update(offers)
          .set({
            status: "rejected",
            counterMessage:
              config.offerRejectMessage ??
              "This offer is below the seller's minimum threshold.",
            updatedAt: new Date(),
          })
          .where(and(eq(offers.id, offerId), eq(offers.status, "pending")))
          .returning({ id: offers.id });

        if (!rejected) return; // Already handled manually

        await db.insert(agentActions).values({
          userId: offer.sellerId,
          actionType: "offer_rejected",
          relatedId: offerId,
          details: { offerPercent, rule: "reject_below" },
        });

        await db.insert(offerEvents).values({
          offerId,
          actorId: offer.sellerId,
          eventType: "reject",
          pricePerSqFt: offerPrice,
          message:
            config.offerRejectMessage ??
            "This offer is below the seller's minimum threshold.",
        });

        await db.insert(notifications).values({
          userId: offer.sellerId,
          type: "system",
          title: "Agent Rejected Offer",
          message: `Your AI agent rejected an offer of $${offerPrice}/sqft (${offerPercent.toFixed(0)}% of ask, below your ${config.offerRejectBelow}% threshold).`,
          data: { offerId, listingId: offer.listingId },
          read: false,
        });

        // Notify buyer of rejection
        await db.insert(notifications).values({
          userId: offer.buyerId,
          type: "system",
          title: "Offer Rejected",
          message: `Your offer of $${offerPrice}/sqft was declined.`,
          data: { offerId, listingId: offer.listingId },
          read: false,
        });
      }
      // If between reject and counter thresholds (or thresholds not set), do nothing -- let seller handle manually
    });
  }
);
