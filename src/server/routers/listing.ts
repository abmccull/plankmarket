import {
  createTRPCRouter,
  publicProcedure,
  sellerProcedure,
  sellerOrPendingProcedure,
} from "../trpc";
import { listingFormSchema, listingFilterSchema, csvListingRowSchema } from "@/lib/validators/listing";
import { listings, media, notifications } from "../db/schema";
import { eq, and, sql, gte, lte, inArray, desc, asc, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import zipcodes from "zipcodes";
import { priority1 } from "@/server/services/priority1";
import { redis } from "@/lib/redis/client";
import { slugify } from "@/lib/utils";
import { getFreightDefaults } from "@/lib/constants/freight-defaults";

export const listingRouter = createTRPCRouter({
  // Create a new listing
  create: sellerOrPendingProcedure
    .input(listingFormSchema)
    .mutation(async ({ ctx, input }) => {
      const { mediaIds, ...listingData } = input;

      // Geo-lookup from ZIP code + auto-derive city/state
      let locationLat: number | undefined;
      let locationLng: number | undefined;
      if (listingData.locationZip) {
        const zipInfo = zipcodes.lookup(listingData.locationZip);
        if (zipInfo) {
          locationLat = zipInfo.latitude;
          locationLng = zipInfo.longitude;
          if (!listingData.locationCity) listingData.locationCity = zipInfo.city;
          if (!listingData.locationState) listingData.locationState = zipInfo.state;
        }
      }

      const [listing] = await ctx.db
        .insert(listings)
        .values({
          ...listingData,
          sellerId: ctx.user.id,
          status: ctx.user.verificationStatus === "verified" || ctx.user.role === "admin" ? "active" : "draft",
          originalTotalSqFt: listingData.totalSqFt,
          locationLat,
          locationLng,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        })
        .returning();

      // Generate and update slug (title + first 6 chars of UUID for uniqueness)
      const slug = `${slugify(input.title)}-${listing.id.slice(0, 6)}`;
      await ctx.db
        .update(listings)
        .set({ slug })
        .where(eq(listings.id, listing.id));

      // Link uploaded media to the listing
      if (mediaIds && mediaIds.length > 0) {
        await ctx.db
          .update(media)
          .set({ listingId: listing.id })
          .where(inArray(media.id, mediaIds));
      }

      // Only call Priority1 for freight class if seller didn't provide one
      if (!listingData.freightClass && listingData.palletWeight && listingData.palletLength && listingData.palletWidth && listingData.palletHeight) {
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

  // Bulk create listings from CSV data
  bulkCreate: sellerOrPendingProcedure
    .input(z.object({ rows: z.array(csvListingRowSchema).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const batchId = crypto.randomUUID();

      const createdListings = await ctx.db.transaction(async (tx) => {
        const results = [];

        for (const row of input.rows) {
          let locationLat: number | undefined;
          let locationLng: number | undefined;
          if (row.locationZip) {
            const zipInfo = zipcodes.lookup(row.locationZip);
            if (zipInfo) {
              locationLat = zipInfo.latitude;
              locationLng = zipInfo.longitude;
              if (!row.locationCity) row.locationCity = zipInfo.city;
              if (!row.locationState) row.locationState = zipInfo.state;
            }
          }

          // Apply freight defaults from material type if not explicitly provided
          const freightDefaults = getFreightDefaults(row.materialType);
          const nmfcCode = row.nmfcCode ?? freightDefaults?.nmfcCode;
          const freightClass = row.freightClass ?? freightDefaults?.freightClass;

          const [listing] = await tx
            .insert(listings)
            .values({
              ...row,
              nmfcCode,
              freightClass,
              sellerId: ctx.user.id,
              status: "draft",
              originalTotalSqFt: row.totalSqFt,
              locationLat,
              locationLng,
              allowOffers: true,
              certifications: [],
              expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            })
            .returning();

          const slug = `${slugify(row.title)}-${listing.id.slice(0, 6)}`;
          await tx
            .update(listings)
            .set({ slug })
            .where(eq(listings.id, listing.id));

          results.push(listing);
        }

        return results;
      });

      // Fire-and-forget freight class calculations (only for rows without a freight class)
      for (const row of input.rows) {
        const rowFreightClass = row.freightClass ?? getFreightDefaults(row.materialType)?.freightClass;
        if (!rowFreightClass && row.palletWeight && row.palletLength && row.palletWidth && row.palletHeight) {
          const listing = createdListings.find((l) => l.title === row.title);
          if (listing) {
            priority1.getSuggestedClass({
              totalWeight: row.palletWeight,
              length: row.palletLength,
              width: row.palletWidth,
              height: row.palletHeight,
              units: 1,
            }).then(async (result) => {
              await ctx.db
                .update(listings)
                .set({ freightClass: result.suggestedClass, updatedAt: new Date() })
                .where(eq(listings.id, listing.id));
            }).catch(() => {});
          }
        }
      }

      // Create in-app notification
      await ctx.db.insert(notifications).values({
        userId: ctx.user.id,
        type: "system",
        title: "Bulk Upload Complete",
        message: `${createdListings.length} draft listing${createdListings.length !== 1 ? "s" : ""} created from CSV upload`,
        data: { batchId, count: createdListings.length },
      });

      return {
        batchId,
        listings: createdListings.map((l) => ({
          id: l.id,
          title: l.title,
          materialType: l.materialType,
          totalSqFt: l.totalSqFt,
          askPricePerSqFt: l.askPricePerSqFt,
        })),
        count: createdListings.length,
      };
    }),

  // Publish multiple draft listings that have photos
  publishBulk: sellerProcedure
    .input(z.object({ listingIds: z.array(z.string().uuid()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership and draft status, and check for media
      const ownedListings = await ctx.db.query.listings.findMany({
        where: and(
          inArray(listings.id, input.listingIds),
          eq(listings.sellerId, ctx.user.id),
          eq(listings.status, "draft")
        ),
        with: {
          media: { columns: { id: true }, limit: 1 },
        },
      });

      const publishable = ownedListings.filter((l) => l.media.length > 0);
      const skipped = ownedListings.filter((l) => l.media.length === 0);

      if (publishable.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No listings have photos to publish. Add photos before publishing.",
        });
      }

      const publishedIds = publishable.map((l) => l.id);
      await ctx.db
        .update(listings)
        .set({ status: "active", updatedAt: new Date() })
        .where(inArray(listings.id, publishedIds));

      return {
        publishedCount: publishable.length,
        skippedCount: skipped.length,
        publishedIds,
      };
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

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { mediaIds, ...updateData } = input.data;

      const [updated] = await ctx.db
        .update(listings)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(listings.id, input.id))
        .returning();

      // Only call Priority1 for freight class if seller didn't provide one in this update
      // and the listing doesn't already have a seller-provided freight class
      const hasFreightClass = updateData.freightClass || (updated?.freightClass && !updateData.palletWeight && !updateData.palletLength && !updateData.palletWidth && !updateData.palletHeight);
      if (!hasFreightClass && (updateData.palletWeight || updateData.palletLength || updateData.palletWidth || updateData.palletHeight)) {
        const currentValues = {
          palletWeight: updateData.palletWeight ?? existing.palletWeight,
          palletLength: updateData.palletLength ?? existing.palletLength,
          palletWidth: updateData.palletWidth ?? existing.palletWidth,
          palletHeight: updateData.palletHeight ?? existing.palletHeight,
        };

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
              verified: true,
              createdAt: true,
              stripeOnboardingComplete: true,
              businessCity: true,
              businessState: true,
              role: true,
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

      // Increment view count with Redis deduplication (fire-and-forget, non-fatal)
      (async () => {
        try {
          // Use authenticated user ID if available, otherwise use client IP
          const viewerIdentifier = ctx.authUser?.id ?? `ip:${ctx.clientIp}`;
          const viewKey = `listing-view:${input.id}:${viewerIdentifier}`;

          // Check if this viewer has already viewed this listing recently
          const alreadyViewed = await redis.get(viewKey);

          if (!alreadyViewed) {
            // Mark as viewed with 1 hour TTL
            await redis.set(viewKey, "1", { ex: 3600 });

            // Increment the view count in the database
            await ctx.db
              .update(listings)
              .set({ viewsCount: sql`${listings.viewsCount} + 1` })
              .where(eq(listings.id, input.id));
          }
        } catch {
          // Non-fatal: view count tracking failure should not break the listing view
          // Silently fail to ensure user experience is not affected
        }
      })();

      return listing;
    }),

  // Get a single listing by slug (public)
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.query.listings.findFirst({
        where: eq(listings.slug, input.slug),
        with: {
          seller: {
            columns: {
              id: true,
              name: true,
              verified: true,
              createdAt: true,
              stripeOnboardingComplete: true,
              businessCity: true,
              businessState: true,
              role: true,
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

      // Increment view count with Redis deduplication (fire-and-forget, non-fatal)
      (async () => {
        try {
          // Use authenticated user ID if available, otherwise use client IP
          const viewerIdentifier = ctx.authUser?.id ?? `ip:${ctx.clientIp}`;
          const viewKey = `listing-view:${listing.id}:${viewerIdentifier}`;

          // Check if this viewer has already viewed this listing recently
          const alreadyViewed = await redis.get(viewKey);

          if (!alreadyViewed) {
            // Mark as viewed with 1 hour TTL
            await redis.set(viewKey, "1", { ex: 3600 });

            // Increment the view count in the database
            await ctx.db
              .update(listings)
              .set({ viewsCount: sql`${listings.viewsCount} + 1` })
              .where(eq(listings.id, listing.id));
          }
        } catch {
          // Non-fatal: view count tracking failure should not break the listing view
          // Silently fail to ensure user experience is not affected
        }
      })();

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

      // Promotion boost tiebreaker: promoted listings sort first
      const promotionBoost = desc(
        sql`CASE
          WHEN ${listings.promotionTier} IS NOT NULL AND ${listings.promotionExpiresAt} > NOW()
          THEN CASE ${listings.promotionTier}
            WHEN 'premium' THEN 3
            WHEN 'featured' THEN 2
            WHEN 'spotlight' THEN 1
            ELSE 0
          END
          ELSE 0
        END`
      );

      // Sort
      let userSort;
      switch (input.sort) {
        case "price_asc":
          userSort = asc(listings.askPricePerSqFt);
          break;
        case "price_desc":
          userSort = desc(listings.askPricePerSqFt);
          break;
        case "date_oldest":
          userSort = asc(listings.createdAt);
          break;
        case "lot_value_desc":
          userSort = desc(
            sql`${listings.askPricePerSqFt} * ${listings.totalSqFt}`
          );
          break;
        case "lot_value_asc":
          userSort = asc(
            sql`${listings.askPricePerSqFt} * ${listings.totalSqFt}`
          );
          break;
        case "popularity":
          userSort = desc(listings.viewsCount);
          break;
        case "proximity":
          if (buyerLat !== undefined && buyerLng !== undefined) {
            userSort = asc(
              sql`3959 * acos(
                cos(radians(${buyerLat})) * cos(radians(${listings.locationLat})) * cos(radians(${listings.locationLng}) - radians(${buyerLng}))
                + sin(radians(${buyerLat})) * sin(radians(${listings.locationLat}))
              )`
            );
          } else {
            userSort = desc(listings.createdAt);
          }
          break;
        case "date_newest":
        default:
          userSort = desc(listings.createdAt);
          break;
      }

      const orderByClause = [promotionBoost, userSort];

      const where = and(...conditions);
      const offset = (input.page - 1) * input.limit;

      const withClause = {
        media: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          orderBy: (media: any, { asc }: any) => [asc(media.sortOrder)],
          limit: 1,
        },
        seller: {
          columns: {
            id: true as const,
            name: true as const,
            verified: true as const,
            businessCity: true as const,
            businessState: true as const,
            role: true as const,
          },
        },
      };

      const [items, countResult] = await Promise.all([
        ctx.db.query.listings.findMany({
          where,
          with: withClause,
          orderBy: orderByClause,
          limit: input.limit,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(listings)
          .where(where),
      ]);

      const now = new Date();
      const interleaved = items.map((item) => ({
        ...item,
        isPromoted:
          item.promotionTier != null &&
          item.promotionExpiresAt != null &&
          item.promotionExpiresAt > now,
      }));

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

  // Get trending/popular listings (public)
  getTrending: publicProcedure
    .input(z.object({ limit: z.number().int().positive().max(12).default(6) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 6;
      const items = await ctx.db.query.listings.findMany({
        where: eq(listings.status, "active"),
        with: {
          media: {
            orderBy: (media, { asc }) => [asc(media.sortOrder)],
            limit: 1,
          },
          seller: {
            columns: {
              id: true,
              name: true,
              verified: true,
              businessCity: true,
              businessState: true,
              role: true,
            },
          },
        },
        orderBy: desc(listings.viewsCount),
        limit,
      });
      return items;
    }),
});
