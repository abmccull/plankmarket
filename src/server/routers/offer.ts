import {
  createTRPCRouter,
  protectedProcedure,
  verifiedProcedure,
  sellerProcedure,
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
} from "@/server/db/schema";
import { eq, and, or, desc, sql, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

/**
 * Helper function to validate that the current user is allowed to act on an offer.
 * After an initial offer, only the other party can respond (turn-based system).
 */
function validateTurn(
  offer: { lastActorId: string | null; buyerId: string; sellerId: string },
  currentUserId: string
): void {
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

  // Verify user is either buyer or seller
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
  createOffer: verifiedProcedure
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

      // Check floor price
      if (
        listing.floorPrice &&
        input.offerPricePerSqFt < listing.floorPrice
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Offer must be at least ${listing.floorPrice} per sq ft`,
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

      // Use transaction to create offer + event atomically
      const result = await ctx.db.transaction(async (tx) => {
        // Create the offer (no expiration — offers don't expire unless a counter sets a deadline)
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

      return result;
    }),

  /**
   * Counter an offer. Either party can counter if it's their turn.
   * Increments currentRound, updates lastActorId, creates counter event.
   */
  counterOffer: verifiedProcedure
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
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
          seller: {
            columns: {
              id: true,
              role: true,
              businessState: true,
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

      // Validate status
      if (offer.status !== "pending" && offer.status !== "countered") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This offer cannot be countered",
        });
      }

      // Check expiration (only if an expiration was set)
      if (offer.expiresAt && new Date() > offer.expiresAt) {
        await ctx.db
          .update(offers)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(offers.id, input.offerId));

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
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);

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
            updatedAt: new Date(),
          })
          .where(eq(offers.id, input.offerId))
          .returning();

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
  acceptOffer: verifiedProcedure
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
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
          seller: {
            columns: {
              id: true,
              role: true,
              businessState: true,
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

      // Validate status
      if (offer.status !== "pending" && offer.status !== "countered") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This offer cannot be accepted",
        });
      }

      // Check expiration (only if an expiration was set)
      if (offer.expiresAt && new Date() > offer.expiresAt) {
        await ctx.db
          .update(offers)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(offers.id, input.offerId));

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This offer has expired",
        });
      }

      // Validate turn
      validateTurn(offer, ctx.user.id);

      // Determine the accepted price (counter price if available, else offer price)
      const acceptedPrice = offer.counterPricePerSqFt || offer.offerPricePerSqFt;
      const totalPrice =
        Math.round(acceptedPrice * offer.quantitySqFt * 100) / 100;

      // Transaction: update offer + create event
      const result = await ctx.db.transaction(async (tx) => {
        const [updatedOffer] = await tx
          .update(offers)
          .set({
            status: "accepted",
            lastActorId: ctx.user.id,
            updatedAt: new Date(),
          })
          .where(eq(offers.id, input.offerId))
          .returning();

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
  rejectOffer: verifiedProcedure
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
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
          seller: {
            columns: {
              id: true,
              role: true,
              businessState: true,
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

      // Validate status
      if (offer.status !== "pending" && offer.status !== "countered") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This offer cannot be rejected",
        });
      }

      // Check expiration (only if an expiration was set)
      if (offer.expiresAt && new Date() > offer.expiresAt) {
        await ctx.db
          .update(offers)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(offers.id, input.offerId));

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
            updatedAt: new Date(),
          })
          .where(eq(offers.id, input.offerId))
          .returning();

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
  withdrawOffer: verifiedProcedure
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
            columns: {
              id: true,
              role: true,
              businessState: true,
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

      // Transaction: update offer + create event
      const result = await ctx.db.transaction(async (tx) => {
        const [updatedOffer] = await tx
          .update(offers)
          .set({
            status: "withdrawn",
            lastActorId: ctx.user.id,
            updatedAt: new Date(),
          })
          .where(eq(offers.id, input.offerId))
          .returning();

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
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
          seller: {
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
          events: {
            orderBy: [desc(offerEvents.createdAt)],
            with: {
              actor: {
                columns: {
                  id: true,
                  role: true,
                  businessState: true,
                },
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

      return offer;
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
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
        },
      });

      return events;
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
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
          seller: {
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
        },
      });

      // Get total count
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(offers)
        .where(whereClause);

      return {
        offers: offersList,
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
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
          seller: {
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
        },
      });

      return offersList;
    }),

  /**
   * Legacy endpoint: seller responds to an offer.
   * @deprecated Use counterOffer, acceptOffer, or rejectOffer instead.
   */
  respond: sellerProcedure
    .input(
      z.object({
        offerId: z.string().uuid(),
        action: z.enum(["accept", "reject", "counter"]),
        counterPricePerSqFt: z
          .number()
          .positive()
          .max(1000)
          .optional(),
        counterMessage: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const offer = await ctx.db.query.offers.findFirst({
        where: eq(offers.id, input.offerId),
        with: {
          listing: true,
        },
      });

      if (!offer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Offer not found",
        });
      }

      if (offer.sellerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only respond to offers on your listings",
        });
      }

      if (offer.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This offer has already been responded to",
        });
      }

      if (offer.expiresAt && new Date() > offer.expiresAt) {
        await ctx.db
          .update(offers)
          .set({ status: "expired" })
          .where(eq(offers.id, input.offerId));

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This offer has expired",
        });
      }

      const statusMap = {
        accept: "accepted",
        reject: "rejected",
        counter: "countered",
      } as const;
      const newStatus = statusMap[input.action];
      const updateData: Record<string, unknown> = {
        status: newStatus,
        updatedAt: new Date(),
      };

      if (input.action === "counter") {
        updateData.counterPricePerSqFt = input.counterPricePerSqFt;
        updateData.counterMessage = input.counterMessage;
      }

      const [updatedOffer] = await ctx.db
        .update(offers)
        .set(updateData)
        .where(eq(offers.id, input.offerId))
        .returning();

      return updatedOffer;
    }),

  /**
   * Legacy endpoint: buyer withdraws their offer.
   * @deprecated Use withdrawOffer instead.
   */
  withdraw: verifiedProcedure
    .input(z.object({ offerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const offer = await ctx.db.query.offers.findFirst({
        where: eq(offers.id, input.offerId),
      });

      if (!offer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Offer not found",
        });
      }

      if (offer.buyerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only withdraw your own offers",
        });
      }

      if (offer.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can only withdraw pending offers",
        });
      }

      const [updatedOffer] = await ctx.db
        .update(offers)
        .set({
          status: "withdrawn",
          updatedAt: new Date(),
        })
        .where(eq(offers.id, input.offerId))
        .returning();

      return updatedOffer;
    }),
});
