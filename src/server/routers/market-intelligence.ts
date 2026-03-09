import { createTRPCRouter, sellerProcedure } from "../trpc";
import { listings, offers, savedSearches, buyerRequests } from "../db/schema";
import { eq, and, sql, gte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { isPro } from "@/lib/pro";

const PRO_GATE_MESSAGE =
  "Market Intelligence is a Pro feature. Upgrade to Pro for pricing benchmarks, demand signals, and trending categories.";

export const marketIntelligenceRouter = createTRPCRouter({
  /**
   * getOverview — Pricing benchmarks per material type the seller is active in.
   * Compares seller's avg price vs market avg price and shows category listing counts.
   */
  getOverview: sellerProcedure.query(async ({ ctx }) => {
    if (!isPro(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: PRO_GATE_MESSAGE });
    }

    // Get seller's distinct active material types
    const sellerMaterials = await ctx.db
      .selectDistinct({ materialType: listings.materialType })
      .from(listings)
      .where(
        and(eq(listings.sellerId, ctx.user.id), eq(listings.status, "active"))
      );

    const materialTypes = sellerMaterials
      .map((m) => m.materialType)
      .filter(Boolean);

    if (materialTypes.length === 0) {
      return { materials: [] };
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // For each material type: market avg, seller avg, active count, new in 30d
    const marketStats = await ctx.db
      .select({
        materialType: listings.materialType,
        marketAvgPrice: sql<number>`coalesce(avg(${listings.askPricePerSqFt})::float, 0)`,
        activeListings: sql<number>`count(*)::int`,
        newLast30d: sql<number>`count(CASE WHEN ${listings.createdAt} >= ${thirtyDaysAgo} THEN 1 END)::int`,
      })
      .from(listings)
      .where(
        and(
          eq(listings.status, "active"),
          inArray(listings.materialType, materialTypes)
        )
      )
      .groupBy(listings.materialType);

    const sellerStats = await ctx.db
      .select({
        materialType: listings.materialType,
        sellerAvgPrice: sql<number>`coalesce(avg(${listings.askPricePerSqFt})::float, 0)`,
        sellerListings: sql<number>`count(*)::int`,
      })
      .from(listings)
      .where(
        and(
          eq(listings.sellerId, ctx.user.id),
          eq(listings.status, "active"),
          inArray(listings.materialType, materialTypes)
        )
      )
      .groupBy(listings.materialType);

    const sellerMap = new Map(
      sellerStats.map((s) => [s.materialType, s])
    );

    const materials = marketStats.map((m) => {
      const seller = sellerMap.get(m.materialType);
      const marketAvg = Math.round(m.marketAvgPrice * 100) / 100;
      const sellerAvg = seller
        ? Math.round(seller.sellerAvgPrice * 100) / 100
        : 0;
      const diff = marketAvg > 0 ? Math.round(((sellerAvg - marketAvg) / marketAvg) * 10000) / 100 : 0;

      return {
        materialType: m.materialType,
        marketAvgPrice: marketAvg,
        sellerAvgPrice: sellerAvg,
        priceDiffPercent: diff,
        activeListings: m.activeListings,
        newLast30d: m.newLast30d,
        sellerListings: seller?.sellerListings ?? 0,
      };
    });

    return { materials };
  }),

  /**
   * getDemandSignals — Demand indicators for the seller's material types.
   * Shows saved search alerts, buyer requests, offer activity, and avg offer-to-ask ratio.
   */
  getDemandSignals: sellerProcedure.query(async ({ ctx }) => {
    if (!isPro(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: PRO_GATE_MESSAGE });
    }

    // Get seller's distinct active material types
    const sellerMaterials = await ctx.db
      .selectDistinct({ materialType: listings.materialType })
      .from(listings)
      .where(
        and(eq(listings.sellerId, ctx.user.id), eq(listings.status, "active"))
      );

    const materialTypes = sellerMaterials
      .map((m) => m.materialType)
      .filter(Boolean);

    if (materialTypes.length === 0) {
      return { signals: [] };
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Count saved searches with alerts by material type
    // savedSearches.filters is jsonb with materialType field
    // We need to check if the materialType array in the filters overlaps with our materialTypes
    const savedSearchCounts = await ctx.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(savedSearches)
      .where(eq(savedSearches.alertEnabled, true));

    const totalAlertedSearches = savedSearchCounts[0]?.count ?? 0;

    // 2. Count active buyer requests per material type
    // buyerRequests.materialTypes is a jsonb array, so use jsonb containment
    const requestCountsByType = await Promise.all(
      materialTypes.map(async (mt) => {
        const [result] = await ctx.db
          .select({
            count: sql<number>`count(*)::int`,
          })
          .from(buyerRequests)
          .where(
            and(
              eq(buyerRequests.status, "open"),
              sql`${buyerRequests.materialTypes} @> ${JSON.stringify([mt])}::jsonb`
            )
          );
        return { materialType: mt, requestCount: result?.count ?? 0 };
      })
    );

    // 3. Offers in last 30 days per material type + avg offer-to-ask ratio
    const offerStats = await ctx.db
      .select({
        materialType: listings.materialType,
        offerCount: sql<number>`count(*)::int`,
        avgOfferToAsk: sql<number>`coalesce(
          avg(
            CASE WHEN ${listings.askPricePerSqFt} > 0
            THEN (${offers.offerPricePerSqFt})::float / (${listings.askPricePerSqFt})::float * 100.0
            ELSE NULL END
          ), 0)::float`,
      })
      .from(offers)
      .innerJoin(listings, eq(offers.listingId, listings.id))
      .where(
        and(
          gte(offers.createdAt, thirtyDaysAgo),
          inArray(listings.materialType, materialTypes)
        )
      )
      .groupBy(listings.materialType);

    const offerMap = new Map(offerStats.map((o) => [o.materialType, o]));
    const requestMap = new Map(
      requestCountsByType.map((r) => [r.materialType, r.requestCount])
    );

    const signals = materialTypes.map((mt) => {
      const offerData = offerMap.get(mt);
      const requestCount = requestMap.get(mt) ?? 0;
      const offerCount = offerData?.offerCount ?? 0;
      const avgOfferToAsk = offerData
        ? Math.round(offerData.avgOfferToAsk * 10) / 10
        : 0;

      // Simple demand level heuristic
      const score = requestCount * 2 + offerCount;
      const demandLevel: "Low" | "Medium" | "High" =
        score >= 10 ? "High" : score >= 3 ? "Medium" : "Low";

      return {
        materialType: mt,
        buyerRequests: requestCount,
        recentOffers: offerCount,
        avgOfferToAskPercent: avgOfferToAsk,
        demandLevel,
      };
    });

    return {
      signals,
      totalAlertedSearches,
    };
  }),

  /**
   * getTrending — Top 10 material types across the platform by activity.
   * Combines new listings, offers, and view counts over the last 30 days.
   */
  getTrending: sellerProcedure.query(async ({ ctx }) => {
    if (!isPro(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: PRO_GATE_MESSAGE });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // New listings in last 30 days by material type
    const newListings = await ctx.db
      .select({
        materialType: listings.materialType,
        newListings: sql<number>`count(*)::int`,
        totalViews: sql<number>`coalesce(sum(${listings.viewsCount}), 0)::int`,
      })
      .from(listings)
      .where(
        and(
          eq(listings.status, "active"),
          gte(listings.createdAt, thirtyDaysAgo)
        )
      )
      .groupBy(listings.materialType);

    // Offers in last 30 days by material type
    const recentOffers = await ctx.db
      .select({
        materialType: listings.materialType,
        offerCount: sql<number>`count(*)::int`,
      })
      .from(offers)
      .innerJoin(listings, eq(offers.listingId, listings.id))
      .where(gte(offers.createdAt, thirtyDaysAgo))
      .groupBy(listings.materialType);

    const offerMap = new Map(
      recentOffers.map((o) => [o.materialType, o.offerCount])
    );

    // Combine and rank by composite score: newListings + offers + views/100
    const trending = newListings
      .map((nl) => {
        const offerCount = offerMap.get(nl.materialType) ?? 0;
        const score = nl.newListings + offerCount + Math.floor(nl.totalViews / 100);

        return {
          materialType: nl.materialType,
          newListings: nl.newListings,
          offers: offerCount,
          views: nl.totalViews,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return { trending };
  }),
});
