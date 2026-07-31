import {
  createTRPCRouter,
  protectedProcedure,
  buyerProcedure,
} from "../trpc";
import {
  createOfferSchema,
  counterOfferSchema,
  acceptOfferSchema,
  rejectOfferSchema,
  withdrawOfferSchema,
  getOfferByIdSchema,
} from "@/lib/validators/offer";
import {
  offers,
  offerEvents,
  listings,
  notifications,
  orders,
} from "@/server/db/schema";
import {
  eq,
  and,
  or,
  desc,
  sql,
  gt,
  inArray,
  isNull,
  lte,
} from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { inngest } from "@/lib/inngest/client";
import {
  buildOfferResponseDeadlineEvent,
  OFFER_RESPONSE_WINDOW_MS,
} from "@/lib/offer-lifecycle";
import { toConversationParty } from "@/server/security/public-data";
import {
  assertListingVisibleToViewer,
} from "@/server/security/listing-visibility";

const offerPartyColumns = {
  id: true,
  name: true,
  role: true,
  businessCity: true,
  businessState: true,
  verificationStatus: true,
} as const;

async function canRevealOfferIdentity(
  db: typeof import("@/server/db").db,
  orderId: string | null,
) {
  if (!orderId) return false;
  const deliveredOrder = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.status, "delivered")),
    columns: { id: true },
  });
  return Boolean(deliveredOrder);
}

function shapeOfferParties<
  T extends {
    buyer: Parameters<typeof toConversationParty>[0];
    seller: Parameters<typeof toConversationParty>[0];
  },
>(offer: T, revealIdentity: boolean) {
  return {
    ...offer,
    buyer: toConversationParty(offer.buyer, revealIdentity),
    seller: toConversationParty(offer.seller, revealIdentity),
  };
}

type NegotiationOfferForExpiry = {
  id: string;
  buyerId: string;
  sellerId: string;
  lastActorId: string | null;
  offerPricePerSqFt: number;
  counterPricePerSqFt: number | null;
  quantitySqFt: number;
};

function responseDeadlineActorId(offer: NegotiationOfferForExpiry): string {
  return offer.lastActorId === offer.buyerId
    ? offer.sellerId
    : offer.buyerId;
}

const QUANTITY_TOLERANCE_SQFT = 0.01;

function getMinimumOrderQuantitySqFt(listing: {
  moq: number | null;
  moqUnit: "pallets" | "sqft" | null;
  sqFtPerBox: number | null;
  boxesPerPallet: number | null;
}): number {
  if (!listing.moq || listing.moq <= 0) {
    return 0;
  }

  if (listing.moqUnit === "pallets") {
    return (
      listing.moq *
      (listing.sqFtPerBox ?? 20) *
      (listing.boxesPerPallet ?? 30)
    );
  }

  return listing.moq;
}

/**
 * Lazily expires a negotiation and records the transition atomically.
 *
 * The conditional update is the idempotency boundary: only the request that
 * changes an actionable offer to expired inserts the corresponding event.
 */
async function expireNegotiationOffer(
  db: typeof import("@/server/db").db,
  offer: NegotiationOfferForExpiry,
  now: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [expiredOffer] = await tx
      .update(offers)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          eq(offers.id, offer.id),
          inArray(offers.status, ["pending", "countered"]),
          lte(offers.expiresAt, now),
        ),
      )
      .returning({ id: offers.id });

    if (!expiredOffer) return false;

    const pricePerSqFt =
      offer.counterPricePerSqFt ?? offer.offerPricePerSqFt;
    await tx.insert(offerEvents).values({
      offerId: offer.id,
      actorId: responseDeadlineActorId(offer),
      eventType: "expire",
      pricePerSqFt,
      quantitySqFt: offer.quantitySqFt,
      totalPrice:
        Math.round(pricePerSqFt * offer.quantitySqFt * 100) / 100,
      message: "Automatically expired after the 48-hour response window.",
    });

    return true;
  });
}

async function enqueueOfferResponseDeadline(
  offerId: string,
  expiresAt: Date,
): Promise<void> {
  try {
    await inngest.send(buildOfferResponseDeadlineEvent(offerId, expiresAt));
  } catch {
    console.error("Failed to enqueue offer response deadline", {
      offerId,
      expiresAt: expiresAt.toISOString(),
    });
  }
}

/**
 * Helper function to validate that the current user is allowed to act on an offer.
 * After an initial offer, only the other party can respond (turn-based system).
 */
function validateOfferParty(
  offer: { buyerId: string; sellerId: string },
  currentUserId: string,
): void {
  if (
    currentUserId !== offer.buyerId &&
    currentUserId !== offer.sellerId
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a party to this offer",
    });
  }
}

function validateTurn(
  offer: { lastActorId: string | null; buyerId: string; sellerId: string },
  currentUserId: string
): void {
  validateOfferParty(offer, currentUserId);

  // If lastActorId is null, this is a new offer and only seller can respond
  if (!offer.lastActorId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Offer has not been initialized properly",
    });
  }

  // The current user must NOT be the last actor (turn-based)
  if (offer.lastActorId === currentUserId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "It's not your turn. Wait for the other party to respond.",
    });
  }

}

/**
 * Helper function to create a notification for the other party in the negotiation.
 */
async function createOfferNotification(
  db: typeof import("@/server/db").db,
  {
    recipientId,
    title,
    message,
    data,
  }: {
    recipientId: string;
    title: string;
    message: string;
    data: Record<string, unknown>;
  }
) {
  // Check for spam: don't create notification if one was sent in the last 30 seconds
  const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
  const recentNotification = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.userId, recipientId),
      eq(notifications.type, "new_offer"),
      gt(notifications.createdAt, thirtySecondsAgo),
      sql`${notifications.data}->>'offerId' = ${data.offerId}`
    ),
  });

  if (!recentNotification) {
    await db.insert(notifications).values({
      userId: recipientId,
      type: "new_offer",
      title,
      message,
      data,
    });
  }
}

export const offerRouter = createTRPCRouter({
  /**
   * Create an initial offer on a listing.
   * Sets lastActorId to buyerId, creates initial_offer event.
   */
  createOffer: buyerProcedure
    .input(createOfferSchema)
    .mutation(async ({ ctx, input }) => {
      // Get the listing
      const listing = await ctx.db.query.listings.findFirst({
        where: and(
          eq(listings.id, input.listingId),
          eq(listings.status, "active")
        ),
      });

      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found or no longer available",
        });
      }

      assertListingVisibleToViewer(
        listing,
        ctx.user,
        "Listing not found or no longer available",
      );

      // Check if offers are allowed
      if (!listing.allowOffers) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Offers are not allowed on this listing",
        });
      }

      // Prevent self-offer
      if (listing.sellerId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot make an offer on your own listing",
        });
      }

      const minimumOrderQtySqFt = getMinimumOrderQuantitySqFt(listing);

      if (
        minimumOrderQtySqFt > 0 &&
        Number(input.quantitySqFt) <
          minimumOrderQtySqFt - QUANTITY_TOLERANCE_SQFT
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Minimum order quantity is ${minimumOrderQtySqFt} sq ft`,
        });
      }

      if (
        Number(input.quantitySqFt) >
        Number(listing.totalSqFt) + QUANTITY_TOLERANCE_SQFT
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Maximum available quantity is ${listing.totalSqFt} sq ft`,
        });
      }

      if (
        listing.fullLotOnly &&
        Number(input.quantitySqFt) <
          Number(listing.totalSqFt) - QUANTITY_TOLERANCE_SQFT
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This seller currently negotiates this inventory only as a full lot.",
        });
      }

      // Check floor price
      if (
        listing.floorPrice &&
        input.offerPricePerSqFt < listing.floorPrice
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Offer does not meet the seller's minimum.",
        });
      }

      // Check if user has a pending or countered offer
      const existingOffer = await ctx.db.query.offers.findFirst({
        where: and(
          eq(offers.listingId, input.listingId),
          eq(offers.buyerId, ctx.user.id),
          or(eq(offers.status, "pending"), eq(offers.status, "countered"))
        ),
      });

      if (existingOffer) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You already have an active offer on this listing",
        });
      }

      // Calculate total price
      const totalPrice =
        Math.round(input.offerPricePerSqFt * input.quantitySqFt * 100) / 100;
      const expiresAt = new Date(Date.now() + OFFER_RESPONSE_WINDOW_MS);

      // Use transaction to create offer + event atomically
      const result = await ctx.db.transaction(async (tx) => {
        // Create the offer with the same 48-hour response window advertised publicly.
        const [offer] = await tx
          .insert(offers)
          .values({
            listingId: input.listingId,
            buyerId: ctx.user.id,
            sellerId: listing.sellerId,
            offerPricePerSqFt: input.offerPricePerSqFt,
            quantitySqFt: input.quantitySqFt,
            totalPrice,
            message: input.message,
            currentRound: 1,
            lastActorId: ctx.user.id,
            status: "pending",
            expiresAt,
          })
          .returning();

        // Create initial_offer event
        await tx.insert(offerEvents).values({
          offerId: offer!.id,
          actorId: ctx.user.id,
          eventType: "initial_offer",
          pricePerSqFt: input.offerPricePerSqFt,
          quantitySqFt: input.quantitySqFt,
          totalPrice,
          message: input.message,
        });

        // Update listing offer count
        await tx
          .update(listings)
          .set({
            offerCount: sql`${listings.offerCount} + 1`,
          })
          .where(eq(listings.id, input.listingId));

        return offer;
      });

      await enqueueOfferResponseDeadline(result!.id, expiresAt);

      // Create notification for seller
      await createOfferNotification(ctx.db, {
        recipientId: listing.sellerId,
        title: "New Offer Received",
        message: `You received a new offer of $${input.offerPricePerSqFt}/sq ft on "${listing.title}"`,
        data: {
          offerId: result!.id,
          listingId: input.listingId,
        },
      });

      // Fire event for AI agent auto-handling (Pro sellers)
      try {
        await inngest.send({
          id: `offer-created:${result!.id}`,
          name: "offer/created",
          data: { offerId: result!.id },
        });
      } catch {
        console.error("Failed to enqueue offer/created event", {
          offerId: result!.id,
        });
      }

      return result;
    }),

  /**
   * Counter an offer. Either party can counter if it's their turn.
   * Increments currentRound, updates lastActorId, creates counter event.
   */
  counterOffer: protectedProcedure
    .input(counterOfferSchema)
    .mutation(async ({ ctx, input }) => {
      // Get the offer
      const offer = await ctx.db.query.offers.findFirst({
        where: eq(offers.id, input.offerId),
        with: {
          listing: {
            columns: {
              id: true,
              title: true,
            },
          },
          buyer: {
            columns: offerPartyColumns,
          },
          seller: {
            columns: offerPartyColumns,
          },
        },
      });

      if (!offer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Offer not found",
        });
      }

      validateOfferParty(offer, ctx.user.id);

      // Validate status
      if (offer.status !== "pending" && offer.status !== "countered") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This offer cannot be countered",
        });
      }

      const transitionAt = new Date();
      if (
        offer.expiresAt &&
        transitionAt.getTime() >= offer.expiresAt.getTime()
      ) {
        await expireNegotiationOffer(ctx.db, offer, transitionAt);

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This offer has expired",
        });
      }

      // Validate turn
      validateTurn(offer, ctx.user.id);

      // Calculate new total price
      const totalPrice =
        Math.round(input.pricePerSqFt * offer.quantitySqFt * 100) / 100;

      // Set new expiration (48 hours from now)
      const expiresAt = new Date(
        transitionAt.getTime() + OFFER_RESPONSE_WINDOW_MS,
      );

      // Transaction: update offer + create event
      const result = await ctx.db.transaction(async (tx) => {
        const [updatedOffer] = await tx
          .update(offers)
          .set({
            status: "countered",
            counterPricePerSqFt: input.pricePerSqFt,
            currentRound: offer.currentRound + 1,
            lastActorId: ctx.user.id,
            expiresAt,
            updatedAt: transitionAt,
          })
          .where(
            and(
              eq(offers.id, input.offerId),
              inArray(offers.status, ["pending", "countered"]),
              eq(offers.currentRound, offer.currentRound),
              eq(offers.lastActorId, offer.lastActorId!),
              or(isNull(offers.expiresAt), gt(offers.expiresAt, transitionAt)),
            ),
          )
          .returning();

        if (!updatedOffer) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This offer changed or expired. Refresh before responding.",
          });
        }

        await tx.insert(offerEvents).values({
          offerId: input.offerId,
          actorId: ctx.user.id,
          eventType: "counter",
          pricePerSqFt: input.pricePerSqFt,
          quantitySqFt: offer.quantitySqFt,
          totalPrice,
          message: input.message,
        });

        return updatedOffer;
      });

      await enqueueOfferResponseDeadline(input.offerId, expiresAt);

      // Notify the other party
      const recipientId =
        ctx.user.id === offer.buyerId ? offer.sellerId : offer.buyerId;
      const actorRole =
        ctx.user.id === offer.buyerId ? "The buyer" : "The seller";

      await createOfferNotification(ctx.db, {
        recipientId,
        title: "Counter Offer Received",
        message: `${actorRole} countered with $${input.pricePerSqFt}/sq ft on "${offer.listing.title}"`,
        data: {
          offerId: input.offerId,
          listingId: offer.listingId,
        },
      });

      return result;
    }),

  /**
   * Accept an offer. Only the party whose turn it is can accept.
   * Creates accept event, updates status to accepted.
   */
  acceptOffer: protectedProcedure
    .input(acceptOfferSchema)
    .mutation(async ({ ctx, input }) => {
      const offer = await ctx.db.query.offers.findFirst({
        where: eq(offers.id, input.offerId),
        with: {
          listing: {
            columns: {
              id: true,
              title: true,
            },
          },
          buyer: {
            columns: offerPartyColumns,
          },
          seller: {
            columns: offerPartyColumns,
          },
        },
      });

      if (!offer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Offer not found",
        });
      }

      validateOfferParty(offer, ctx.user.id);

      // Validate status
      if (offer.status !== "pending" && offer.status !== "countered") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This offer cannot be accepted",
        });
      }

      const transitionAt = new Date();
      if (
        offer.expiresAt &&
        transitionAt.getTime() >= offer.expiresAt.getTime()
      ) {
        await expireNegotiationOffer(ctx.db, offer, transitionAt);

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This offer has expired",
        });
      }

      // Validate turn
      validateTurn(offer, ctx.user.id);

      // Determine the accepted price (counter price if available, else offer price)
      const acceptedPrice = offer.counterPricePerSqFt ?? offer.offerPricePerSqFt;
      const totalPrice =
        Math.round(acceptedPrice * offer.quantitySqFt * 100) / 100;

      // Set 48-hour expiration for buyer to complete checkout
      const expiresAt = new Date(
        transitionAt.getTime() + OFFER_RESPONSE_WINDOW_MS,
      );

      // Transaction: update offer + create event
      const result = await ctx.db.transaction(async (tx) => {
        const [updatedOffer] = await tx
          .update(offers)
          .set({
            status: "accepted",
            lastActorId: ctx.user.id,
            expiresAt,
            updatedAt: transitionAt,
          })
          .where(
            and(
              eq(offers.id, input.offerId),
              inArray(offers.status, ["pending", "countered"]),
              eq(offers.currentRound, offer.currentRound),
              eq(offers.lastActorId, offer.lastActorId!),
              or(isNull(offers.expiresAt), gt(offers.expiresAt, transitionAt)),
            ),
          )
          .returning();

        if (!updatedOffer) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This offer changed or expired. Refresh before responding.",
          });
        }

        await tx.insert(offerEvents).values({
          offerId: input.offerId,
          actorId: ctx.user.id,
          eventType: "accept",
          pricePerSqFt: acceptedPrice,
          quantitySqFt: offer.quantitySqFt,
          totalPrice,
        });

        return updatedOffer;
      });

      // Fire Inngest event for accepted offer processing (fire-and-forget)
      try {
        await inngest.send({
          id: `offer-accepted:${input.offerId}`,
          name: "offer/accepted",
          data: {
            offerId: input.offerId,
            buyerId: offer.buyerId,
            sellerId: offer.sellerId,
            listingId: offer.listingId,
            listingTitle: offer.listing.title,
            acceptedPrice: `$${Number(acceptedPrice).toFixed(2)}/sq ft`,
            quantity: `${Number(offer.quantitySqFt).toLocaleString()} sq ft`,
            estimatedTotal: `$${(Number(acceptedPrice) * Number(offer.quantitySqFt)).toFixed(2)}`,
            expiresAt: expiresAt.toISOString(),
          },
        });
      } catch {
        console.error("Failed to enqueue offer/accepted event", {
          offerId: input.offerId,
        });
      }

      // Notify the other party
      const recipientId =
        ctx.user.id === offer.buyerId ? offer.sellerId : offer.buyerId;
      const actorRole =
        ctx.user.id === offer.buyerId ? "The buyer" : "The seller";

      await createOfferNotification(ctx.db, {
        recipientId,
        title: "Offer Accepted",
        message: `${actorRole} accepted your offer on "${offer.listing.title}"`,
        data: {
          offerId: input.offerId,
          listingId: offer.listingId,
        },
      });

      return result;
    }),

  /**
   * Reject an offer. Only the party whose turn it is can reject.
   * Creates reject event, updates status to rejected.
   */
  rejectOffer: protectedProcedure
    .input(rejectOfferSchema)
    .mutation(async ({ ctx, input }) => {
      const offer = await ctx.db.query.offers.findFirst({
        where: eq(offers.id, input.offerId),
        with: {
          listing: {
            columns: {
              id: true,
              title: true,
            },
          },
          buyer: {
            columns: offerPartyColumns,
          },
          seller: {
            columns: offerPartyColumns,
          },
        },
      });

      if (!offer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Offer not found",
        });
      }

      validateOfferParty(offer, ctx.user.id);

      // Validate status
      if (offer.status !== "pending" && offer.status !== "countered") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This offer cannot be rejected",
        });
      }

      const transitionAt = new Date();
      if (
        offer.expiresAt &&
        transitionAt.getTime() >= offer.expiresAt.getTime()
      ) {
        await expireNegotiationOffer(ctx.db, offer, transitionAt);

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This offer has expired",
        });
      }

      // Validate turn
      validateTurn(offer, ctx.user.id);

      // Transaction: update offer + create event
      const result = await ctx.db.transaction(async (tx) => {
        const [updatedOffer] = await tx
          .update(offers)
          .set({
            status: "rejected",
            lastActorId: ctx.user.id,
            updatedAt: transitionAt,
          })
          .where(
            and(
              eq(offers.id, input.offerId),
              inArray(offers.status, ["pending", "countered"]),
              eq(offers.currentRound, offer.currentRound),
              eq(offers.lastActorId, offer.lastActorId!),
              or(isNull(offers.expiresAt), gt(offers.expiresAt, transitionAt)),
            ),
          )
          .returning();

        if (!updatedOffer) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This offer changed or expired. Refresh before responding.",
          });
        }

        await tx.insert(offerEvents).values({
          offerId: input.offerId,
          actorId: ctx.user.id,
          eventType: "reject",
          message: input.message,
        });

        return updatedOffer;
      });

      // Notify the other party
      const recipientId =
        ctx.user.id === offer.buyerId ? offer.sellerId : offer.buyerId;
      const actorRole =
        ctx.user.id === offer.buyerId ? "The buyer" : "The seller";

      await createOfferNotification(ctx.db, {
        recipientId,
        title: "Offer Rejected",
        message: `${actorRole} rejected your offer on "${offer.listing.title}"`,
        data: {
          offerId: input.offerId,
          listingId: offer.listingId,
        },
      });

      return result;
    }),

  /**
   * Withdraw an offer. Only the buyer can withdraw, and only if status is pending or countered.
   * Creates withdraw event, updates status to withdrawn.
   */
  withdrawOffer: protectedProcedure
    .input(withdrawOfferSchema)
    .mutation(async ({ ctx, input }) => {
      const offer = await ctx.db.query.offers.findFirst({
        where: eq(offers.id, input.offerId),
        with: {
          listing: {
            columns: {
              id: true,
              title: true,
            },
          },
          seller: {
            columns: offerPartyColumns,
          },
        },
      });

      if (!offer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Offer not found",
        });
      }

      // Verify user is the buyer
      if (offer.buyerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only withdraw your own offers",
        });
      }

      // Verify offer is pending or countered
      if (offer.status !== "pending" && offer.status !== "countered") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can only withdraw pending or countered offers",
        });
      }

      const transitionAt = new Date();
      if (
        offer.expiresAt &&
        transitionAt.getTime() >= offer.expiresAt.getTime()
      ) {
        await expireNegotiationOffer(ctx.db, offer, transitionAt);

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This offer has expired",
        });
      }

      // Transaction: update offer + create event
      const result = await ctx.db.transaction(async (tx) => {
        const [updatedOffer] = await tx
          .update(offers)
          .set({
            status: "withdrawn",
            lastActorId: ctx.user.id,
            updatedAt: transitionAt,
          })
          .where(
            and(
              eq(offers.id, input.offerId),
              inArray(offers.status, ["pending", "countered"]),
              eq(offers.currentRound, offer.currentRound),
              eq(offers.lastActorId, offer.lastActorId!),
              or(isNull(offers.expiresAt), gt(offers.expiresAt, transitionAt)),
            ),
          )
          .returning();

        if (!updatedOffer) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This offer changed or expired. Refresh before responding.",
          });
        }

        await tx.insert(offerEvents).values({
          offerId: input.offerId,
          actorId: ctx.user.id,
          eventType: "withdraw",
        });

        return updatedOffer;
      });

      // Notify the seller
      await createOfferNotification(ctx.db, {
        recipientId: offer.sellerId,
        title: "Offer Withdrawn",
        message: `An offer on "${offer.listing.title}" was withdrawn`,
        data: {
          offerId: input.offerId,
          listingId: offer.listingId,
        },
      });

      return result;
    }),

  /**
   * Get offer by ID with full event history.
   * Only accessible to buyer or seller.
   */
  getOfferById: protectedProcedure
    .input(getOfferByIdSchema)
    .query(async ({ ctx, input }) => {
      const offer = await ctx.db.query.offers.findFirst({
        where: eq(offers.id, input.offerId),
        with: {
          listing: {
            columns: {
              id: true,
              title: true,
              status: true,
              askPricePerSqFt: true,
              totalSqFt: true,
            },
          },
          buyer: {
            columns: offerPartyColumns,
          },
          seller: {
            columns: offerPartyColumns,
          },
          events: {
            orderBy: [desc(offerEvents.createdAt)],
            with: {
              actor: {
                columns: offerPartyColumns,
              },
            },
          },
        },
      });

      if (!offer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Offer not found",
        });
      }

      // Verify user is buyer or seller
      if (offer.buyerId !== ctx.user.id && offer.sellerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this offer",
        });
      }

      const revealIdentity = await canRevealOfferIdentity(ctx.db, offer.orderId);
      const shapedOffer = shapeOfferParties(offer, revealIdentity);
      return {
        ...shapedOffer,
        events: offer.events.map((event) => ({
          ...event,
          actor: toConversationParty(event.actor, revealIdentity),
        })),
      };
    }),

  /**
   * Get offer history (all events) for an offer.
   * Only accessible to buyer or seller.
   */
  getOfferHistory: protectedProcedure
    .input(z.object({ offerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify access
      const offer = await ctx.db.query.offers.findFirst({
        where: eq(offers.id, input.offerId),
        columns: {
          id: true,
          buyerId: true,
          sellerId: true,
          orderId: true,
        },
      });

      if (!offer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Offer not found",
        });
      }

      if (offer.buyerId !== ctx.user.id && offer.sellerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this offer",
        });
      }

      // Get all events
      const events = await ctx.db.query.offerEvents.findMany({
        where: eq(offerEvents.offerId, input.offerId),
        orderBy: [desc(offerEvents.createdAt)],
        with: {
          actor: {
            columns: offerPartyColumns,
          },
        },
      });

      const revealIdentity = await canRevealOfferIdentity(ctx.db, offer.orderId);
      return events.map((event) => ({
        ...event,
        actor: toConversationParty(event.actor, revealIdentity),
      }));
    }),

  /**
   * Get all offers for current user (as buyer or seller).
   * Includes listing title, other party info, current status, latest price.
   */
  getMyOffers: protectedProcedure
    .input(
      z.object({
        role: z.enum(["buyer", "seller"]).optional(),
        status: z
          .enum([
            "pending",
            "accepted",
            "rejected",
            "countered",
            "withdrawn",
            "expired",
          ])
          .optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      // Build where clause
      const conditions = [];

      if (input.role === "buyer") {
        conditions.push(eq(offers.buyerId, ctx.user.id));
      } else if (input.role === "seller") {
        conditions.push(eq(offers.sellerId, ctx.user.id));
      } else {
        conditions.push(
          or(eq(offers.buyerId, ctx.user.id), eq(offers.sellerId, ctx.user.id))
        );
      }

      if (input.status) {
        conditions.push(eq(offers.status, input.status));
      }

      const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

      const offersList = await ctx.db.query.offers.findMany({
        where: whereClause,
        orderBy: [desc(offers.updatedAt)],
        limit: input.limit,
        offset,
        with: {
          listing: {
            columns: {
              id: true,
              title: true,
              status: true,
              askPricePerSqFt: true,
            },
          },
          buyer: {
            columns: offerPartyColumns,
          },
          seller: {
            columns: offerPartyColumns,
          },
        },
      });

      const orderIds = offersList
        .map((offer) => offer.orderId)
        .filter((orderId): orderId is string => Boolean(orderId));
      const deliveredOrderIds = orderIds.length
        ? new Set(
            (
              await ctx.db
                .select({ id: orders.id })
                .from(orders)
                .where(
                  and(
                    inArray(orders.id, orderIds),
                    eq(orders.status, "delivered"),
                  ),
                )
            ).map((order) => order.id),
          )
        : new Set<string>();
      const shapedOffers = offersList.map((offer) =>
        shapeOfferParties(
          offer,
          Boolean(offer.orderId && deliveredOrderIds.has(offer.orderId)),
        ),
      );

      // Get total count
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(offers)
        .where(whereClause);

      return {
        offers: shapedOffers,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  /**
   * Get offers for a listing (kept for backward compatibility).
   * Sellers see all offers, buyers see only their own.
   */
  getByListing: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.query.listings.findFirst({
        where: eq(listings.id, input.listingId),
      });

      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      // Sellers see all offers, buyers see only their own
      const whereClause =
        listing.sellerId === ctx.user.id
          ? eq(offers.listingId, input.listingId)
          : and(
              eq(offers.listingId, input.listingId),
              eq(offers.buyerId, ctx.user.id)
            );

      const offersList = await ctx.db.query.offers.findMany({
        where: whereClause,
        orderBy: [desc(offers.updatedAt)],
        with: {
          buyer: {
            columns: offerPartyColumns,
          },
          seller: {
            columns: offerPartyColumns,
          },
        },
      });

      const orderIds = offersList
        .map((offer) => offer.orderId)
        .filter((orderId): orderId is string => Boolean(orderId));
      const deliveredOrderIds = orderIds.length
        ? new Set(
            (
              await ctx.db
                .select({ id: orders.id })
                .from(orders)
                .where(
                  and(
                    inArray(orders.id, orderIds),
                    eq(orders.status, "delivered"),
                  ),
                )
            ).map((order) => order.id),
          )
        : new Set<string>();

      return offersList.map((offer) =>
        shapeOfferParties(
          offer,
          Boolean(offer.orderId && deliveredOrderIds.has(offer.orderId)),
        ),
      );
    }),
});
