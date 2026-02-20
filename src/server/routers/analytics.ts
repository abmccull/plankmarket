import { createTRPCRouter, sellerProcedure } from "../trpc";
import { dateRangeInput, periodToDateRange } from "@/lib/validators/analytics";
import { orders, listings, offers, reviews } from "../db/schema";
import { eq, and, sql, gte, lt, desc } from "drizzle-orm";
import { z } from "zod";

// Safe to use sql.raw() here because trunc is always one of "day" | "week" | "month"
// from our own periodToDateRange function — never user input.
function dateTrunc(trunc: "day" | "week" | "month", column: ReturnType<typeof sql>) {
  return sql`date_trunc(${sql.raw(`'${trunc}'`)}, ${column})`;
}

export const analyticsRouter = createTRPCRouter({
  /**
   * Overview — KPIs with trends + revenue time series
   */
  overview: sellerProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const { start, prevStart, end, trunc } = periodToDateRange(input.period);
    const userId = ctx.user.id;

    // Current period conditions
    const currentPeriodCond = start
      ? and(eq(orders.sellerId, userId), gte(orders.createdAt, start), lt(orders.createdAt, end))
      : eq(orders.sellerId, userId);

    // Previous period conditions
    const prevPeriodCond =
      prevStart && start
        ? and(eq(orders.sellerId, userId), gte(orders.createdAt, prevStart), lt(orders.createdAt, start))
        : null;

    // Current period KPIs
    const [currentStats] = await ctx.db
      .select({
        revenue: sql<number>`coalesce(sum(${orders.sellerPayout}), 0)::float`,
        orderCount: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(currentPeriodCond);

    // Previous period KPIs
    let prevStats = { revenue: 0, orderCount: 0 };
    if (prevPeriodCond) {
      const [prev] = await ctx.db
        .select({
          revenue: sql<number>`coalesce(sum(${orders.sellerPayout}), 0)::float`,
          orderCount: sql<number>`count(*)::int`,
        })
        .from(orders)
        .where(prevPeriodCond);
      prevStats = prev;
    }

    // Views (all time for the seller)
    const [viewStats] = await ctx.db
      .select({
        totalViews: sql<number>`coalesce(sum(${listings.viewsCount}), 0)::int`,
      })
      .from(listings)
      .where(eq(listings.sellerId, userId));

    // Conversion rate: orders / views
    const views = viewStats.totalViews || 0;
    const conversionRate = views > 0 ? (currentStats.orderCount / views) * 100 : 0;

    // Revenue time series
    const timeSeriesCond = start
      ? and(eq(orders.sellerId, userId), gte(orders.createdAt, start))
      : eq(orders.sellerId, userId);

    const bucket = dateTrunc(trunc, sql`${orders.createdAt}`);

    const timeSeries = await ctx.db
      .select({
        date: sql<string>`${bucket}::text`,
        revenue: sql<number>`coalesce(sum(${orders.sellerPayout}), 0)::float`,
        orders: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(timeSeriesCond)
      .groupBy(bucket)
      .orderBy(bucket);

    // Orders by status for the period
    const ordersByStatus = await ctx.db
      .select({
        status: orders.status,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(currentPeriodCond)
      .groupBy(orders.status);

    return {
      kpis: {
        revenue: currentStats.revenue,
        prevRevenue: prevStats.revenue,
        orders: currentStats.orderCount,
        prevOrders: prevStats.orderCount,
        views,
        conversionRate: Math.round(conversionRate * 100) / 100,
      },
      timeSeries,
      ordersByStatus,
    };
  }),

  /**
   * Revenue — breakdown by material type, order status, avg order value
   */
  revenue: sellerProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const { start, end, trunc } = periodToDateRange(input.period);
    const userId = ctx.user.id;

    const periodCond = start
      ? and(eq(orders.sellerId, userId), gte(orders.createdAt, start), lt(orders.createdAt, end))
      : eq(orders.sellerId, userId);

    // Total revenue, avg order value, shipping margin
    const [totals] = await ctx.db
      .select({
        totalRevenue: sql<number>`coalesce(sum(${orders.sellerPayout}), 0)::float`,
        avgOrderValue: sql<number>`coalesce(avg(${orders.subtotal}), 0)::float`,
        shippingRevenue: sql<number>`coalesce(sum(${orders.shippingMargin}), 0)::float`,
        orderCount: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(periodCond);

    // Revenue by material type
    const byMaterialType = await ctx.db
      .select({
        materialType: listings.materialType,
        revenue: sql<number>`coalesce(sum(${orders.sellerPayout}), 0)::float`,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .innerJoin(listings, eq(orders.listingId, listings.id))
      .where(periodCond)
      .groupBy(listings.materialType)
      .orderBy(sql`sum(${orders.sellerPayout}) desc`);

    // Revenue by order status
    const byOrderStatus = await ctx.db
      .select({
        status: orders.status,
        revenue: sql<number>`coalesce(sum(${orders.sellerPayout}), 0)::float`,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(periodCond)
      .groupBy(orders.status)
      .orderBy(sql`sum(${orders.sellerPayout}) desc`);

    // Revenue time series
    const timeSeriesCond = start
      ? and(eq(orders.sellerId, userId), gte(orders.createdAt, start))
      : eq(orders.sellerId, userId);

    const bucket = dateTrunc(trunc, sql`${orders.createdAt}`);

    const timeSeries = await ctx.db
      .select({
        date: sql<string>`${bucket}::text`,
        revenue: sql<number>`coalesce(sum(${orders.sellerPayout}), 0)::float`,
        avgOrderValue: sql<number>`coalesce(avg(${orders.subtotal}), 0)::float`,
      })
      .from(orders)
      .where(timeSeriesCond)
      .groupBy(bucket)
      .orderBy(bucket);

    return {
      kpis: {
        totalRevenue: totals.totalRevenue,
        avgOrderValue: Math.round(totals.avgOrderValue * 100) / 100,
        shippingMargin: totals.shippingRevenue,
        orderCount: totals.orderCount,
      },
      byMaterialType,
      byOrderStatus,
      timeSeries,
    };
  }),

  /**
   * Inventory — listings by status, top viewed, days on market
   */
  inventory: sellerProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const { start } = periodToDateRange(input.period);
    const userId = ctx.user.id;

    // Listings by status with sqft totals
    const byStatus = await ctx.db
      .select({
        status: listings.status,
        count: sql<number>`count(*)::int`,
        totalSqFt: sql<number>`coalesce(sum(${listings.totalSqFt}), 0)::float`,
      })
      .from(listings)
      .where(eq(listings.sellerId, userId))
      .groupBy(listings.status);

    const activeCount = byStatus.find((s) => s.status === "active")?.count ?? 0;
    const activeSqFt = byStatus.find((s) => s.status === "active")?.totalSqFt ?? 0;

    // Average days on market for active listings
    const [avgDom] = await ctx.db
      .select({
        avgDays: sql<number>`coalesce(avg(extract(epoch from now() - ${listings.createdAt}) / 86400), 0)::float`,
      })
      .from(listings)
      .where(and(eq(listings.sellerId, userId), eq(listings.status, "active")));

    // Top 10 most viewed listings
    const topViewed = await ctx.db
      .select({
        id: listings.id,
        title: listings.title,
        slug: listings.slug,
        viewsCount: listings.viewsCount,
        watchlistCount: listings.watchlistCount,
        status: listings.status,
        materialType: listings.materialType,
        askPricePerSqFt: listings.askPricePerSqFt,
        totalSqFt: listings.totalSqFt,
        createdAt: listings.createdAt,
      })
      .from(listings)
      .where(eq(listings.sellerId, userId))
      .orderBy(desc(listings.viewsCount))
      .limit(10);

    // Listing creation time series
    const listingCond = start
      ? and(eq(listings.sellerId, userId), gte(listings.createdAt, start))
      : eq(listings.sellerId, userId);

    const monthBucket = sql`date_trunc(${sql.raw("'month'")}, ${listings.createdAt})`;

    const creationSeries = await ctx.db
      .select({
        date: sql<string>`${monthBucket}::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(listings)
      .where(listingCond)
      .groupBy(monthBucket)
      .orderBy(monthBucket);

    return {
      kpis: {
        activeListings: activeCount,
        totalSqFtAvailable: Math.round(activeSqFt),
        avgDaysOnMarket: Math.round(avgDom.avgDays),
      },
      byStatus,
      topViewed,
      creationSeries,
    };
  }),

  /**
   * Offers — funnel, acceptance rate, avg discount, time series
   */
  offers: sellerProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const { start, end, trunc } = periodToDateRange(input.period);
    const userId = ctx.user.id;

    const periodCond = start
      ? and(eq(offers.sellerId, userId), gte(offers.createdAt, start), lt(offers.createdAt, end))
      : eq(offers.sellerId, userId);

    // Offer funnel by status
    const byStatus = await ctx.db
      .select({
        status: offers.status,
        count: sql<number>`count(*)::int`,
      })
      .from(offers)
      .where(periodCond)
      .groupBy(offers.status);

    const totalOffers = byStatus.reduce((sum, s) => sum + s.count, 0);
    const accepted = byStatus.find((s) => s.status === "accepted")?.count ?? 0;
    const acceptanceRate = totalOffers > 0 ? (accepted / totalOffers) * 100 : 0;

    // Average discount from ask price
    const [discountStats] = await ctx.db
      .select({
        avgDiscount: sql<number>`coalesce(
          avg(
            CASE WHEN ${listings.askPricePerSqFt} > 0
            THEN (1.0 - (${offers.offerPricePerSqFt})::float / (${listings.askPricePerSqFt})::float) * 100.0
            ELSE 0.0 END
          ), 0)::float`,
      })
      .from(offers)
      .innerJoin(listings, eq(offers.listingId, listings.id))
      .where(periodCond);

    // Offers time series
    const timeSeriesCond = start
      ? and(eq(offers.sellerId, userId), gte(offers.createdAt, start))
      : eq(offers.sellerId, userId);

    const bucket = dateTrunc(trunc, sql`${offers.createdAt}`);

    const timeSeries = await ctx.db
      .select({
        date: sql<string>`${bucket}::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(offers)
      .where(timeSeriesCond)
      .groupBy(bucket)
      .orderBy(bucket);

    // Top negotiated listings
    const topNegotiated = await ctx.db
      .select({
        listingId: offers.listingId,
        title: listings.title,
        slug: listings.slug,
        offerCount: sql<number>`count(*)::int`,
        avgRounds: sql<number>`coalesce(avg(${offers.currentRound}), 0)::float`,
      })
      .from(offers)
      .innerJoin(listings, eq(offers.listingId, listings.id))
      .where(periodCond)
      .groupBy(offers.listingId, listings.title, listings.slug)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    return {
      kpis: {
        totalOffers,
        accepted,
        acceptanceRate: Math.round(acceptanceRate * 100) / 100,
        avgDiscount: Math.round(discountStats.avgDiscount * 100) / 100,
      },
      byStatus,
      timeSeries,
      topNegotiated,
    };
  }),

  /**
   * Reviews — rating distribution, sub-ratings, recent reviews
   */
  reviews: sellerProcedure
    .input(
      dateRangeInput.extend({
        reviewPage: z.number().int().positive().default(1),
        reviewLimit: z.number().int().positive().max(20).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const { start, end, trunc } = periodToDateRange(input.period);
      const userId = ctx.user.id;

      const baseCond = and(
        eq(reviews.revieweeId, userId),
        eq(reviews.direction, "buyer_to_seller")
      );

      const periodCond = start
        ? and(baseCond, gte(reviews.createdAt, start), lt(reviews.createdAt, end))
        : baseCond;

      // Overall stats
      const [stats] = await ctx.db
        .select({
          avgRating: sql<number>`coalesce(avg(${reviews.rating}), 0)::float`,
          totalReviews: sql<number>`count(*)::int`,
          avgCommunication: sql<number>`coalesce(avg(${reviews.communicationRating}), 0)::float`,
          avgAccuracy: sql<number>`coalesce(avg(${reviews.accuracyRating}), 0)::float`,
          avgShipping: sql<number>`coalesce(avg(${reviews.shippingRating}), 0)::float`,
          withResponse: sql<number>`count(CASE WHEN ${reviews.sellerResponse} IS NOT NULL THEN 1 END)::int`,
        })
        .from(reviews)
        .where(periodCond);

      const responseRate =
        stats.totalReviews > 0
          ? (stats.withResponse / stats.totalReviews) * 100
          : 0;

      // Rating distribution (1-5)
      const distribution = await ctx.db
        .select({
          rating: reviews.rating,
          count: sql<number>`count(*)::int`,
        })
        .from(reviews)
        .where(periodCond)
        .groupBy(reviews.rating)
        .orderBy(reviews.rating);

      // Fill in missing ratings
      const ratingDist = [1, 2, 3, 4, 5].map((r) => ({
        rating: r,
        count: distribution.find((d) => d.rating === r)?.count ?? 0,
      }));

      // Rating over time
      const reviewBucket = dateTrunc(trunc, sql`${reviews.createdAt}`);

      const ratingTimeSeries = await ctx.db
        .select({
          date: sql<string>`${reviewBucket}::text`,
          avgRating: sql<number>`coalesce(avg(${reviews.rating}), 0)::float`,
          count: sql<number>`count(*)::int`,
        })
        .from(reviews)
        .where(
          start
            ? and(baseCond, gte(reviews.createdAt, start))
            : baseCond
        )
        .groupBy(reviewBucket)
        .orderBy(reviewBucket);

      // Recent reviews (paginated)
      const offset = (input.reviewPage - 1) * input.reviewLimit;
      const recentReviews = await ctx.db.query.reviews.findMany({
        where: baseCond,
        with: {
          reviewer: {
            columns: { id: true, name: true, avatarUrl: true },
          },
        },
        orderBy: desc(reviews.createdAt),
        limit: input.reviewLimit,
        offset,
      });

      return {
        kpis: {
          avgRating: Math.round(stats.avgRating * 10) / 10,
          totalReviews: stats.totalReviews,
          responseRate: Math.round(responseRate),
        },
        subRatings: {
          communication: Math.round(stats.avgCommunication * 10) / 10,
          accuracy: Math.round(stats.avgAccuracy * 10) / 10,
          shipping: Math.round(stats.avgShipping * 10) / 10,
        },
        ratingDistribution: ratingDist,
        ratingTimeSeries,
        recentReviews: recentReviews.map((r) => ({
          id: r.id,
          reviewerName: r.reviewer?.name ?? "Anonymous",
          reviewerAvatar: r.reviewer?.avatarUrl ?? undefined,
          date: r.createdAt,
          rating: r.rating,
          title: r.title,
          comment: r.comment ?? "",
          subRatings: {
            communication: r.communicationRating ?? undefined,
            accuracy: r.accuracyRating ?? undefined,
            shipping: r.shippingRating ?? undefined,
          },
          sellerResponse: r.sellerResponse
            ? { message: r.sellerResponse, date: r.sellerRespondedAt! }
            : undefined,
        })),
      };
    }),
});
