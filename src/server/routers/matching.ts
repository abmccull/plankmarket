import { publicProductPhotoWhere } from "@/server/services/listing-media";
import { createTRPCRouter, buyerProcedure, sellerProcedure } from "../trpc";
import { userPreferences } from "../db/schema/user-preferences";
import { buyerRequests } from "../db/schema/buyer-requests";
import { listings } from "../db/schema";
import { and, eq, sql, lte, gte, inArray } from "drizzle-orm";
import {
  publicListingColumns,
  publicMediaColumns,
  publicSellerColumns,
  toPublicListing,
} from "@/server/security/public-data";
import { publicActiveListingWhere } from "@/server/security/listing-visibility";
import zipcodes from "zipcodes";
import { getPreferenceCompletion } from "@/lib/preferences-completion";
import { getDirectPurchaseUnitPriceSql } from "@/server/db/expressions/listing-pricing";
import {
  getListingBoundingBoxConditions,
  getListingDistanceMilesSql,
} from "@/server/db/expressions/listing-geo";

/**
 * Maximum number of recommendations to return in each direction.
 */
const MAX_RECOMMENDATIONS = 20;

export const matchingRouter = createTRPCRouter({
  /**
   * Recommended listings for a buyer based on their saved preferences.
   * If no preferences are set, returns an empty list with prefsIncomplete: true.
   */
  recommendedListings: buyerProcedure.query(async ({ ctx }) => {
    const prefs = await ctx.db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, ctx.user.id),
    });

    if (!prefs || !getPreferenceCompletion(prefs, "buyer").profileComplete) {
      return {
        items: [],
        prefsIncomplete: true,
      };
    }

    // Build filter conditions
    const conditions = [publicActiveListingWhere(new Date(), ctx.user)];
    const purchasePrice = getDirectPurchaseUnitPriceSql();

    // Filter by preferred material types
    if (
      prefs.preferredMaterialTypes &&
      prefs.preferredMaterialTypes.length > 0
    ) {
      conditions.push(
        inArray(
          listings.materialType,
          prefs.preferredMaterialTypes as Array<
            | "hardwood"
            | "engineered"
            | "laminate"
            | "vinyl_lvp"
            | "bamboo"
            | "tile"
            | "other"
          >,
        ),
      );
    }

    // Filter by price range
    if (prefs.priceMinPerSqFt !== null && prefs.priceMinPerSqFt !== undefined) {
      conditions.push(gte(purchasePrice, prefs.priceMinPerSqFt));
    }

    if (prefs.priceMaxPerSqFt !== null && prefs.priceMaxPerSqFt !== undefined) {
      conditions.push(lte(purchasePrice, prefs.priceMaxPerSqFt));
    }

    // Filter by lot size preference
    if (prefs.minLotSizeSqFt !== null && prefs.minLotSizeSqFt !== undefined) {
      conditions.push(gte(listings.totalSqFt, prefs.minLotSizeSqFt));
    }

    if (prefs.maxLotSizeSqFt !== null && prefs.maxLotSizeSqFt !== undefined) {
      conditions.push(lte(listings.totalSqFt, prefs.maxLotSizeSqFt));
    }

    if (prefs.waterproofRequired) {
      conditions.push(
        sql`${listings.waterResistance} = 'waterproof' AND ${listings.specificationProvenance} = 'evidence_reviewed' AND ${listings.specificationReviewedAt} IS NOT NULL AND ${listings.specificationEvidenceId} IS NOT NULL`,
      );
    }

    if (prefs.preferredRadiusMiles && prefs.preferredRadiusMiles > 0) {
      const origin = prefs.preferredZip
        ? zipcodes.lookup(prefs.preferredZip)
        : undefined;
      if (!origin) {
        return {
          items: [],
          prefsIncomplete: false,
          limitation: "location_unverified" as const,
        };
      }
      conditions.push(
        ...getListingBoundingBoxConditions(origin, prefs.preferredRadiusMiles),
        lte(
          getListingDistanceMilesSql(origin.latitude, origin.longitude),
          prefs.preferredRadiusMiles,
        ),
      );
    }

    const items = await ctx.db.query.listings.findMany({
      where: and(...conditions),
      columns: publicListingColumns,
      orderBy: [
        // Promoted listings first, then newest
        sql`${listings.promotionTier} IS NOT NULL DESC`,
        sql`${listings.createdAt} DESC`,
      ],
      limit: MAX_RECOMMENDATIONS,
      with: {
        media: {
          columns: publicMediaColumns,
          where: publicProductPhotoWhere,
          orderBy: (media, { asc }) => [asc(media.sortOrder)],
          limit: 1,
        },
        seller: {
          columns: publicSellerColumns,
        },
      },
    });

    return {
      items: items.map(toPublicListing),
      prefsIncomplete: false,
    };
  }),

  /**
   * Recommended open buyer requests for a seller based on their preferences.
   * If no preferences are set, returns an empty list with prefsIncomplete: true.
   */
  recommendedRequests: sellerProcedure.query(async ({ ctx }) => {
    const prefs = await ctx.db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, ctx.user.id),
    });

    if (!prefs || !getPreferenceCompletion(prefs, "seller").profileComplete) {
      return {
        items: [],
        prefsIncomplete: true,
      };
    }

    // Build filter conditions against open buyer requests
    const conditions = [eq(buyerRequests.status, "open")];

    // Match requests that want material types the seller typically carries
    if (prefs.typicalMaterialTypes && prefs.typicalMaterialTypes.length > 0) {
      conditions.push(
        sql`${buyerRequests.materialTypes} ?| array[${sql.join(
          prefs.typicalMaterialTypes.map((m: string) => sql`${m}`),
          sql`, `,
        )}]`,
      );
    }

    // Match requests within the seller's preferred buyer radius (zip-based proximity)
    // We filter by minTotalSqFt relative to seller's minLotSqFt if set
    if (prefs.minLotSqFt !== null && prefs.minLotSqFt !== undefined) {
      conditions.push(
        sql`${buyerRequests.minTotalSqFt} >= ${prefs.minLotSqFt * 0.5}`,
      );
    }

    const items = await ctx.db.query.buyerRequests.findMany({
      where: and(...conditions),
      orderBy: [
        // Most urgent first
        sql`CASE ${buyerRequests.urgency}
          WHEN 'asap' THEN 1
          WHEN '2_weeks' THEN 2
          WHEN '4_weeks' THEN 3
          ELSE 4
        END ASC`,
        sql`${buyerRequests.createdAt} DESC`,
      ],
      limit: MAX_RECOMMENDATIONS,
    });

    return {
      items,
      prefsIncomplete: false,
    };
  }),
});
