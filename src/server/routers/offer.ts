import {
  createTRPCRouter,
  protectedProcedure,
  sellerProcedure,
} from "../trpc";
import {
  createOfferSchema,
  respondToOfferSchema,
} from "@/lib/validators/offer";
import { offers, listings } from "../db/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const offerRouter = createTRPCRouter({
  // Create an offer on a listing
  create: protectedProcedure
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

      // Check if user has a pending offer
      const existingOffer = await ctx.db.query.offers.findFirst({
        where: and(
          eq(offers.listingId, input.listingId),
          eq(offers.buyerId, ctx.user.id),
          eq(offers.status, "pending")
        ),
      });

      if (existingOffer) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You already have a pending offer on this listing",
        });
      }

      // Calculate total price
      const totalPrice =
        Math.round(input.offerPricePerSqFt * input.quantitySqFt * 100) / 100;

      // Set expiration to 48 hours from now
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);

      // Create the offer
      const [offer] = await ctx.db
        .insert(offers)
        .values({
          listingId: input.listingId,
          buyerId: ctx.user.id,
          sellerId: listing.sellerId,
          offerPricePerSqFt: input.offerPricePerSqFt,
          quantitySqFt: input.quantitySqFt,
          totalPrice,
          message: input.message,
          expiresAt,
        })
        .returning();

      // Update listing offer count
      await ctx.db
        .update(listings)
        .set({
          offerCount: sql`${listings.offerCount} + 1`,
        })
        .where(eq(listings.id, input.listingId));

      return offer;
    }),

  // Get offers for a listing
  getByListing: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Get the listing to check permissions
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
        orderBy: [desc(offers.createdAt)],
        with: {
          buyer: {
            columns: {
              id: true,
              name: true,
              businessName: true,
              avatarUrl: true,
            },
          },
        },
      });

      return offersList;
    }),

  // Seller responds to an offer
  respond: sellerProcedure
    .input(respondToOfferSchema)
    .mutation(async ({ ctx, input }) => {
      // Get the offer
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

      // Verify user is the seller
      if (offer.sellerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only respond to offers on your listings",
        });
      }

      // Verify offer is pending
      if (offer.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This offer has already been responded to",
        });
      }

      // Check if offer has expired
      if (new Date() > offer.expiresAt) {
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

      // Update the offer
      const [updatedOffer] = await ctx.db
        .update(offers)
        .set(updateData)
        .where(eq(offers.id, input.offerId))
        .returning();

      return updatedOffer;
    }),

  // Buyer withdraws their offer
  withdraw: protectedProcedure
    .input(z.object({ offerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Get the offer
      const offer = await ctx.db.query.offers.findFirst({
        where: eq(offers.id, input.offerId),
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

      // Verify offer is pending
      if (offer.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can only withdraw pending offers",
        });
      }

      // Update the offer
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

  // Get all offers for current user
  getMyOffers: protectedProcedure
    .input(
      z.object({
        role: z.enum(["buyer", "seller"]).optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      // Determine where clause based on role filter
      let whereClause;
      if (input.role === "buyer") {
        whereClause = eq(offers.buyerId, ctx.user.id);
      } else if (input.role === "seller") {
        whereClause = eq(offers.sellerId, ctx.user.id);
      } else {
        whereClause = or(
          eq(offers.buyerId, ctx.user.id),
          eq(offers.sellerId, ctx.user.id)
        );
      }

      const offersList = await ctx.db.query.offers.findMany({
        where: whereClause,
        orderBy: [desc(offers.createdAt)],
        limit: input.limit,
        offset,
        with: {
          listing: {
            columns: {
              id: true,
              title: true,
              status: true,
            },
          },
          buyer: {
            columns: {
              id: true,
              name: true,
              businessName: true,
              avatarUrl: true,
            },
          },
          seller: {
            columns: {
              id: true,
              name: true,
              businessName: true,
              avatarUrl: true,
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
});
