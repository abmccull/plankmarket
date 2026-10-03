import { inngest } from "../client";
import { db } from "@/server/db";
import {
  offers,
  listings,
  agentActions,
  notifications,
  offerEvents,
} from "@/server/db/schema";
import { and, eq, gt, isNull, or, sql, inArray, desc } from "drizzle-orm";
import {
  lockAgentConfig,
  getEligibleAgentUser,
} from "@/server/services/agent-controls";
import {
  buildOfferResponseDeadlineEvent,
  OFFER_RESPONSE_WINDOW_MS,
} from "@/lib/offer-lifecycle";

interface OfferDecision {
  action: "accepted" | "countered" | "rejected";
  expiresAt: string | null;
  offerId: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  listingTitle: string;
  offerPrice: number;
  quantity: number;
}

export const agentOfferHandler = inngest.createFunction(
  { id: "agent-offer-handler", name: "AI Agent: Auto-Handle Offer" },
  { event: "offer/created" },
  async ({ event, step }) => {
    const { offerId } = event.data as { offerId: string };
    // Discovery locates the owner only. Cached configuration never authorizes a write.
    const discovered = await step.run("load-offer", () =>
      db.query.offers.findFirst({
        where: eq(offers.id, offerId),
        with: { listing: true },
      }),
    );
    if (!discovered) return;

    const result = await step.run("apply-rules", () =>
      db.transaction(async (tx): Promise<OfferDecision | null> => {
        const config = await lockAgentConfig(tx, discovered.sellerId);
        const executionKey = `offer-created:${offerId}`;
        const previous = await tx.query.agentActions.findFirst({
          where: and(
            eq(agentActions.userId, discovered.sellerId),
            eq(agentActions.relatedId, offerId),
            or(
              sql`${agentActions.details}->>'executionKey' = ${executionKey}`,
              and(
                sql`${agentActions.details}->>'executionKey' is null`,
                inArray(agentActions.actionType, [
                  "offer_accepted",
                  "offer_countered",
                ]),
              ),
            ),
          ),
          orderBy: [desc(agentActions.createdAt)],
        });
        const persisted = (
          previous?.details as { result?: OfferDecision } | null
        )?.result;
        // Finish dispatch for a committed decision, even after the owner stops future work.
        if (persisted) return persisted;
        if (previous) {
          // Older atomic actions did not persist the result payload. Require both
          // the agent audit and its matching offer event before recovering them.
          const committed = await tx.query.offers.findFirst({
            where: eq(offers.id, offerId),
            with: { listing: true },
          });
          const accepted = previous.actionType === "offer_accepted";
          const expectedStatus = accepted ? "accepted" : "countered";
          if (
            committed?.status === expectedStatus &&
            committed.lastActorId === discovered.sellerId &&
            committed.expiresAt
          ) {
            const evidence = await tx.query.offerEvents.findFirst({
              where: and(
                eq(offerEvents.offerId, offerId),
                eq(offerEvents.actorId, discovered.sellerId),
                eq(offerEvents.eventType, accepted ? "accept" : "counter"),
                eq(
                  offerEvents.pricePerSqFt,
                  accepted
                    ? committed.offerPricePerSqFt
                    : (committed.counterPricePerSqFt ?? 0),
                ),
              ),
              orderBy: [desc(offerEvents.createdAt)],
            });
            if (
              evidence &&
              evidence.createdAt.getTime() >=
                previous.createdAt.getTime() - 1000 &&
              evidence.createdAt.getTime() <=
                previous.createdAt.getTime() + 1000
            ) {
              return {
                action: expectedStatus,
                expiresAt: committed.expiresAt.toISOString(),
                offerId,
                buyerId: committed.buyerId,
                sellerId: committed.sellerId,
                listingId: committed.listingId,
                listingTitle: committed.listing.title,
                offerPrice: Number(committed.offerPricePerSqFt),
                quantity: committed.quantitySqFt,
              };
            }
          }
        }
        if (
          !config?.offerAutoEnabled ||
          !(await getEligibleAgentUser(tx, discovered.sellerId, true))
        )
          return null;

        // Match the existing listing -> offer lock order used by manual workflows.
        await tx.execute(
          sql`select id from ${listings} where ${listings.id} = ${discovered.listingId} for update`,
        );
        await tx.execute(
          sql`select id from ${offers} where ${offers.id} = ${offerId} for update`,
        );
        const offer = await tx.query.offers.findFirst({
          where: eq(offers.id, offerId),
          with: { listing: true },
        });
        const transitionAt = new Date();
        if (
          !offer ||
          offer.sellerId !== discovered.sellerId ||
          offer.listing.sellerId !== offer.sellerId ||
          offer.listing.status !== "active" ||
          offer.status !== "pending" ||
          offer.currentRound !== discovered.currentRound ||
          offer.lastActorId !== offer.buyerId ||
          (offer.expiresAt && offer.expiresAt <= transitionAt)
        )
          return null;

        const askPrice = Number(offer.listing.askPricePerSqFt);
        const offerPrice = Number(offer.offerPricePerSqFt);
        if (
          !Number.isFinite(askPrice) ||
          askPrice <= 0 ||
          !Number.isFinite(offerPrice) ||
          offerPrice <= 0
        )
          return null;
        const offerPercent = (offerPrice / askPrice) * 100;
        const action =
          config.offerAcceptAbove !== null &&
          offerPercent >= config.offerAcceptAbove
            ? "accepted"
            : config.offerCounterAt !== null &&
                config.offerAcceptAbove !== null &&
                offerPercent >= config.offerCounterAt
              ? "countered"
              : config.offerRejectBelow !== null &&
                  offerPercent < config.offerRejectBelow
                ? "rejected"
                : null;
        if (!action) return null;
        const expiresAt =
          action === "rejected"
            ? null
            : new Date(transitionAt.getTime() + OFFER_RESPONSE_WINDOW_MS);
        const counterPrice =
          action === "countered"
            ? (askPrice * config.offerAcceptAbove!) / 100
            : null;
        const message =
          action === "accepted"
            ? "Auto-accepted by AI agent"
            : action === "countered"
              ? (config.offerCounterMessage ??
                "Counter-offer from seller's automated pricing.")
              : (config.offerRejectMessage ??
                "This offer is below the seller's minimum threshold.");
        const [changed] = await tx
          .update(offers)
          .set({
            status: action,
            lastActorId: offer.sellerId,
            updatedAt: transitionAt,
            ...(expiresAt ? { expiresAt } : {}),
            ...(action === "countered"
              ? {
                  counterPricePerSqFt: counterPrice,
                  counterMessage: message,
                  currentRound: offer.currentRound + 1,
                }
              : {}),
            ...(action === "rejected" ? { counterMessage: message } : {}),
          })
          .where(
            and(
              eq(offers.id, offerId),
              eq(offers.status, "pending"),
              eq(offers.currentRound, discovered.currentRound),
              eq(offers.lastActorId, offer.buyerId),
              or(isNull(offers.expiresAt), gt(offers.expiresAt, transitionAt)),
            ),
          )
          .returning({ id: offers.id });
        if (!changed) return null;

        const decision: OfferDecision = {
          action,
          expiresAt: expiresAt?.toISOString() ?? null,
          offerId,
          sellerId: offer.sellerId,
          buyerId: offer.buyerId,
          listingId: offer.listingId,
          listingTitle: offer.listing.title,
          offerPrice,
          quantity: offer.quantitySqFt,
        };
        await tx.insert(agentActions).values({
          userId: offer.sellerId,
          actionType: `offer_${action}`,
          relatedId: offerId,
          details: {
            executionKey,
            result: decision,
            offerPercent,
            askPrice,
            offerPrice,
            counterPrice,
            rule:
              action === "accepted"
                ? "accept_above"
                : action === "countered"
                  ? "counter_at"
                  : "reject_below",
            configUpdatedAt: config.updatedAt,
          },
        });
        const responsePrice = counterPrice ?? offerPrice;
        await tx
          .insert(offerEvents)
          .values({
            offerId,
            actorId: offer.sellerId,
            eventType:
              action === "accepted"
                ? "accept"
                : action === "countered"
                  ? "counter"
                  : "reject",
            pricePerSqFt: responsePrice,
            quantitySqFt: offer.quantitySqFt,
            totalPrice:
              Math.round(responsePrice * offer.quantitySqFt * 100) / 100,
            message,
          });
        const verb =
          action === "accepted"
            ? "Accepted"
            : action === "countered"
              ? "Countered"
              : "Rejected";
        await tx.insert(notifications).values({
          userId: offer.sellerId,
          type: "system",
          title: `Agent ${verb} Offer`,
          message: `Your AI agent ${action} an offer of $${offerPrice.toFixed(2)}/sq ft${counterPrice ? ` with a counter at $${counterPrice.toFixed(2)}/sq ft` : ""}.`,
          data: { offerId, listingId: offer.listingId },
          read: false,
        });
        await tx.insert(notifications).values({
          userId: offer.buyerId,
          type: "system",
          title: `Offer ${verb}`,
          message:
            action === "countered"
              ? `The seller countered your offer at $${counterPrice!.toFixed(2)}/sq ft.`
              : `Your offer of $${offerPrice.toFixed(2)}/sq ft was ${action === "accepted" ? "accepted" : "declined"}.`,
          data: { offerId, listingId: offer.listingId },
          read: false,
        });
        return decision;
      }),
    );

    // Existing executions may have checkpointed the old {action, expiresAt}
    // shape. Its discovery checkpoint contains the original dispatch fields.
    const dispatch = result
      ? Object.assign(
          {
            offerId,
            buyerId: discovered.buyerId,
            sellerId: discovered.sellerId,
            listingId: discovered.listingId,
            listingTitle: discovered.listing.title,
            offerPrice: Number(discovered.offerPricePerSqFt),
            quantity: discovered.quantitySqFt,
          },
          result,
        )
      : null;
    if (dispatch?.action === "accepted" && dispatch.expiresAt) {
      await step.sendEvent("emit-offer-accepted", {
        id: `offer-accepted:${offerId}`,
        name: "offer/accepted",
        data: {
          offerId,
          buyerId: dispatch.buyerId,
          sellerId: dispatch.sellerId,
          listingId: dispatch.listingId,
          listingTitle: dispatch.listingTitle,
          acceptedPrice: `$${dispatch.offerPrice.toFixed(2)}/sq ft`,
          quantity: `${Number(dispatch.quantity).toLocaleString()} sq ft`,
          estimatedTotal: `$${(dispatch.offerPrice * dispatch.quantity).toFixed(2)}`,
          expiresAt: dispatch.expiresAt,
        },
      });
    } else if (result?.action === "countered" && result.expiresAt) {
      await step.sendEvent(
        "emit-offer-response-deadline",
        buildOfferResponseDeadlineEvent(offerId, new Date(result.expiresAt)),
      );
    }
  },
);
