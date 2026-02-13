import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  sellerProcedure,
} from "../trpc";
import { listingFormSchema, listingFilterSchema } from "@/lib/validators/listing";
import { listings, media } from "../db/schema";
import { eq, and, sql, gte, lte, inArray, desc, asc, ilike, or, gt, isNull, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import zipcodes from "zipcodes";
import { priority1 } from "@/server/services/priority1";

export const listingRouter = createTRPCRouter({
  // Create a new listing
  create: sellerProcedure
    .input(listingFormSchema)
    .mutation(async ({ ctx, input }) => {
      const { mediaIds, ...listingData } = input;

      // Geo-lookup from ZIP code
      let locationLat: number | undefined;
      let locationLng: number | undefined;
      if (listingData.locationZip) {
        const zipInfo = zipcodes.lookup(listingData.locationZip);
        if (zipInfo) {
          locationLat = zipInfo.latitude;
          locationLng = zipInfo.longitude;
        }
      }

      const [listing] = await ctx.db
        .insert(listings)
        .values({
          ...listingData,
          sellerId: ctx.user.id,
          status: "active",
          originalTotalSqFt: listingData.totalSqFt,
          locationLat,
          locationLng,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        })
        .returning();

      // Link uploaded media to the listing
      if (mediaIds && mediaIds.length > 0) {
        await ctx.db
          .update(media)
          .set({ listingId: listing.id })
          .where(inArray(media.id, mediaIds));
      }

      // Auto-calculate freight class from Priority1 (non-fatal)
      if (listingData.palletWeight && listingData.palletLength && listingData.palletWidth && listingData.palletHeight) {
        priority1.getSuggestedClass({
          totalWeight: listingData.palletWeight,
          length: listingData.palletLength,
          width: listingData.palletWidth,
          height: listingData.palletHeight,
          units: 1,
        }).then(async (result) => {
          await ctx.db
            .update(listings)
            .set({ freightClass: result.suggestedClass, updatedAt: new Date() })
            .where(eq(listings.id, listing.id));
        }).catch(() => {
          // Non-fatal: listing still saved without freight class
        });
      }

      return listing;
    }),

  // Update an existing listing
  update: sellerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: listingFormSchema.partial(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const existing = await ctx.db.query.listings.findFirst({
        where: and(
          eq(listings.id, input.id),
          eq(listings.sellerId, ctx.user.id)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found or you do not have permission to edit it",
        });
      }

      const { mediaIds, ...updateData } = input.data;

      const [updated] = await ctx.db
        .update(listings)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(listings.id, input.id))
        .returning();

      // Auto-calculate freight class from Priority1 (non-fatal)
      // If pallet dimensions are being updated, recalculate freight class
      if (updateData.palletWeight || updateData.palletLength || updateData.palletWidth || updateData.palletHeight) {
        // Get current values for any fields not being updated
        const currentValues = {
          palletWeight: updateData.palletWeight ?? existing.palletWeight,
          palletLength: updateData.palletLength ?? existing.palletLength,
          palletWidth: updateData.palletWidth ?? existing.palletWidth,
          palletHeight: updateData.palletHeight ?? existing.palletHeight,
        };

        // Only recalculate if all dimensions are present
        if (currentValues.palletWeight && currentValues.palletLength && currentValues.palletWidth && currentValues.palletHeight) {
          priority1.getSuggestedClass({
            totalWeight: currentValues.palletWeight,
            length: currentValues.palletLength,
            width: currentValues.palletWidth,
            height: currentValues.palletHeight,
            units: 1,
          }).then(async (result) => {
            await ctx.db
              .update(listings)
              .set({ freightClass: result.suggestedClass, updatedAt: new Date() })
              .where(eq(listings.id, input.id));
          }).catch(() => {
            // Non-fatal: listing still updated without freight class
          });
        }
      }

      return updated;
    }),

  // Delete (archive) a listing
  delete: sellerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.listings.findFirst({
        where: and(
          eq(listings.id, input.id),
          eq(listings.sellerId, ctx.user.id)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      const [archived] = await ctx.db
        .update(listings)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(listings.id, input.id))
        .returning();

      return archived;
    }),

  // Get a single listing by ID (public)
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.query.listings.findFirst({
        where: eq(listings.id, input.id),
        with: {
          seller: {
            columns: {
              id: true,
              name: true,
              businessName: true,
              avatarUrl: true,
              verified: true,
              createdAt: true,
              stripeOnboardingComplete: true,
            },
          },
          media: {
            orderBy: (media, { asc }) => [asc(media.sortOrder)],
          },
        },
      });

      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      // Increment view count (fire-and-forget)
      ctx.db
        .update(listings)
        .set({ viewsCount: sql`${listings.viewsCount} + 1` })
        .where(eq(listings.id, input.id))
        .execute()
        .catch(() => {});

      return listing;
    }),

  // Search and filter listings (public)
  list: publicProcedure
    .input(listingFilterSchema)
    .query(async ({ ctx, input }) => {
      const conditions = [eq(listings.status, "active")];

      // Text search (escape LIKE special characters to prevent wildcard injection)
      if (input.query) {
        const escapedQuery = input.query
          .replace(/\\/g, "\\\\")
          .replace(/%/g, "\\%")
          .replace(/_/g, "\\_");
        conditions.push(
          or(
            ilike(listings.title, `%${escapedQuery}%`),
            ilike(listings.description, `%${escapedQuery}%`),
            ilike(listings.brand, `%${escapedQuery}%`),
            ilike(listings.species, `%${escapedQuery}%`)
          )!
        );
      }

      // Material type filter
      if (input.materialType && input.materialType.length > 0) {
        conditions.push(inArray(listings.materialType, input.materialType));
      }

      // Species filter
      if (input.species && input.species.length > 0) {
        conditions.push(inArray(listings.species, input.species));
      }

      // Color family filter
      if (input.colorFamily && input.colorFamily.length > 0) {
        conditions.push(inArray(listings.colorFamily, input.colorFamily));
      }

      // Finish type filter
      if (input.finishType && input.finishType.length > 0) {
        conditions.push(inArray(listings.finish, input.finishType));
      }

      // Width multi-select (match within ±0.1" tolerance)
      if (input.width && input.width.length > 0) {
        const widthConditions = input.width.map((w) =>
          and(gte(listings.width, w - 0.1), lte(listings.width, w + 0.1))
        );
        conditions.push(or(...widthConditions)!);
      }

      // Thickness multi-select (match within ±0.1" tolerance)
      if (input.thickness && input.thickness.length > 0) {
        const thicknessConditions = input.thickness.map((t) =>
          and(gte(listings.thickness, t - 0.1), lte(listings.thickness, t + 0.1))
        );
        conditions.push(or(...thicknessConditions)!);
      }

      // Wear layer multi-select (match within ±0.02mm tolerance)
      if (input.wearLayer && input.wearLayer.length > 0) {
        const wearConditions = input.wearLayer.map((w) =>
          and(gte(listings.wearLayer, w - 0.02), lte(listings.wearLayer, w + 0.02))
        );
        conditions.push(or(...wearConditions)!);
      }

      // Price range
      if (input.priceMin !== undefined) {
        conditions.push(gte(listings.askPricePerSqFt, input.priceMin));
      }
      if (input.priceMax !== undefined) {
        conditions.push(lte(listings.askPricePerSqFt, input.priceMax));
      }

      // Condition filter
      if (input.condition && input.condition.length > 0) {
        conditions.push(inArray(listings.condition, input.condition));
      }

      // State filter
      if (input.state && input.state.length > 0) {
        conditions.push(inArray(listings.locationState, input.state));
      }

      // Lot size range
      if (input.minLotSize !== undefined) {
        conditions.push(gte(listings.totalSqFt, input.minLotSize));
      }
      if (input.maxLotSize !== undefined) {
        conditions.push(lte(listings.totalSqFt, input.maxLotSize));
      }

      // Distance filter (Haversine)
      let buyerLat: number | undefined;
      let buyerLng: number | undefined;
      if (input.buyerZip && input.maxDistance && input.maxDistance > 0) {
        const zipInfo = zipcodes.lookup(input.buyerZip);
        if (zipInfo) {
          buyerLat = zipInfo.latitude;
          buyerLng = zipInfo.longitude;
          conditions.push(
            sql`(
              3959 * acos(
                cos(radians(${buyerLat})) * cos(radians(${listings.locationLat})) * cos(radians(${listings.locationLng}) - radians(${buyerLng}))
                + sin(radians(${buyerLat})) * sin(radians(${listings.locationLat}))
              )
            ) <= ${input.maxDistance}`
          );
        }
      }

      // Sort
      let orderByClause;
      switch (input.sort) {
        case "price_asc":
          orderByClause = asc(listings.askPricePerSqFt);
          break;
        case "price_desc":
          orderByClause = desc(listings.askPricePerSqFt);
          break;
        case "date_oldest":
          orderByClause = asc(listings.createdAt);
          break;
        case "lot_value_desc":
          orderByClause = desc(
            sql`${listings.askPricePerSqFt} * ${listings.totalSqFt}`
          );
          break;
        case "lot_value_asc":
          orderByClause = asc(
            sql`${listings.askPricePerSqFt} * ${listings.totalSqFt}`
          );
          break;
        case "popularity":
          orderByClause = desc(listings.viewsCount);
          break;
        case "proximity":
          if (buyerLat !== undefined && buyerLng !== undefined) {
            orderByClause = asc(
              sql`3959 * acos(
                cos(radians(${buyerLat})) * cos(radians(${listings.locationLat})) * cos(radians(${listings.locationLng}) - radians(${buyerLng}))
                + sin(radians(${buyerLat})) * sin(radians(${listings.locationLat}))
              )`
            );
          } else {
            orderByClause = desc(listings.createdAt);
          }
          break;
        case "date_newest":
        default:
          orderByClause = desc(listings.createdAt);
          break;
      }

      const where = and(...conditions);
      const offset = (input.page - 1) * input.limit;

      // Max 20% of results can be promoted (e.g. 5 of 24)
      const maxPromoted = Math.ceil(input.limit * 0.2);
      const now = new Date();

      // Promoted listings matching all active filters
      const promotedConditions = [
        ...conditions,
        isNotNull(listings.promotionTier),
        gt(listings.promotionExpiresAt, now),
      ];

      // Organic listings: no active promotion
      const organicConditions = [
        ...conditions,
        or(
          isNull(listings.promotionTier),
          sql`${listings.promotionExpiresAt} <= ${now}`,
          isNull(listings.promotionExpiresAt)
        )!,
      ];

      const withClause = {
        media: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          orderBy: (media: any, { asc }: any) => [asc(media.sortOrder)],
          limit: 1,
        },
        seller: {
          columns: {
            id: true as const,
            businessName: true as const,
            verified: true as const,
          },
        },
      };

      const [promotedItems, organicItems, countResult] = await Promise.all([
        ctx.db.query.listings.findMany({
          where: and(...promotedConditions),
          with: withClause,
          orderBy: [
            desc(
              sql`CASE ${listings.promotionTier} WHEN 'premium' THEN 3 WHEN 'featured' THEN 2 ELSE 1 END`
            ),
            desc(listings.createdAt),
          ],
          limit: maxPromoted,
          // No offset for promoted — always show the top promoted for this page
        }),
        ctx.db.query.listings.findMany({
          where: and(...organicConditions),
          with: withClause,
          orderBy: orderByClause,
          limit: input.limit - maxPromoted,
          offset: Math.max(0, offset - maxPromoted), // Adjust offset for organic
        }),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(listings)
          .where(where),
      ]);

      // Interleave: promoted at positions 0, 5, 10, 15
      const interleaved: (typeof organicItems[number] & { isPromoted?: boolean })[] = [];
      let pIdx = 0;
      let oIdx = 0;
      const promotedPositions = [0, 5, 10, 15];

      for (let pos = 0; pos < input.limit; pos++) {
        if (
          promotedPositions.includes(pos) &&
          pIdx < promotedItems.length
        ) {
          interleaved.push({
            ...promotedItems[pIdx],
            isPromoted: true,
          });
          pIdx++;
        } else if (oIdx < organicItems.length) {
          interleaved.push({
            ...organicItems[oIdx],
            isPromoted: false,
          });
          oIdx++;
        }
      }

      const total = countResult[0]?.count ?? 0;

      return {
        items: interleaved,
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
        hasMore: offset + interleaved.length < total,
      };
    }),

  // Get seller's own listings
  getMyListings: sellerProcedure
    .input(
      z.object({
        status: z
          .enum(["draft", "active", "sold", "expired", "archived"])
          .optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(listings.sellerId, ctx.user.id)];

      if (input.status) {
        conditions.push(eq(listings.status, input.status));
      }

      const where = and(...conditions);
      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        ctx.db.query.listings.findMany({
          where,
          with: {
            media: {
              orderBy: (media, { asc }) => [asc(media.sortOrder)],
              limit: 1,
            },
          },
          orderBy: desc(listings.createdAt),
          limit: input.limit,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(listings)
          .where(where),
      ]);

      const total = countResult[0]?.count ?? 0;

      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
        hasMore: offset + items.length < total,
      };
    }),

  // Get seller stats
  getSellerStats: sellerProcedure.query(async ({ ctx }) => {
    const stats = await ctx.db
      .select({
        status: listings.status,
        count: sql<number>`count(*)::int`,
        totalViews: sql<number>`coalesce(sum(${listings.viewsCount}), 0)::int`,
        totalSqFt: sql<number>`coalesce(sum(${listings.totalSqFt}), 0)::float`,
      })
      .from(listings)
      .where(eq(listings.sellerId, ctx.user.id))
      .groupBy(listings.status);

    return stats;
  }),
});
