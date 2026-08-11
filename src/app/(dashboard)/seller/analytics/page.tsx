"use client";

import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { StatsCard } from "@/components/dashboard/stats-card";
import { DateRangeSelector } from "@/components/analytics/date-range-selector";
import { ChartCard } from "@/components/analytics/chart-card";
import { AreaChart } from "@/components/analytics/area-chart";
import { BarChart } from "@/components/analytics/bar-chart";
import { DonutChart } from "@/components/analytics/donut-chart";
import { TopListingsTable } from "@/components/analytics/top-listings-table";
import { ReviewCard } from "@/components/shared/review-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState, StatePanel } from "@/components/ui/state-panel";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { periods, type Period } from "@/lib/validators/analytics";
import {
  BarChart3,
  DollarSign,
  ShoppingCart,
  Eye,
  TrendingUp,
  Package,
  Ruler,
  Clock,
  MessageSquare,
  Star,
  Percent,
} from "lucide-react";

const analyticsTabs = [
  "overview",
  "revenue",
  "inventory",
  "offers",
  "reviews",
] as const;

type AnalyticsTab = (typeof analyticsTabs)[number];

function isAnalyticsTab(value: string): value is AnalyticsTab {
  return analyticsTabs.includes(value as AnalyticsTab);
}

function isPeriod(value: string): value is Period {
  return periods.includes(value as Period);
}

function calcTrend(
  current: number,
  previous: number,
): { value: number; label: string } {
  if (previous === 0)
    return { value: current > 0 ? 100 : 0, label: "vs prev period" };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { value: pct, label: "vs prev period" };
}

function formatMaterialType(mt: string) {
  return mt
    .replace(/_/g, " ")
    .replace(/\blvp\b/i, "LVP")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return <Skeleton className="w-full rounded-lg" style={{ height }} />;
}

export default function SellerAnalyticsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const requestedTab = searchParams.get("tab") ?? "overview";
  const requestedPeriod = searchParams.get("period") ?? "30d";
  const tab = isAnalyticsTab(requestedTab) ? requestedTab : "overview";
  const period = isPeriod(requestedPeriod) ? requestedPeriod : "30d";

  const setParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Track your performance and net payouts
          </p>
        </div>
        <DateRangeSelector
          value={period}
          onChange={(p) => setParams({ period: p })}
        />
      </div>

      <Tabs value={tab} onValueChange={(t) => setParams({ tab: t })}>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList
            className="h-auto w-max min-w-full justify-start sm:min-w-0"
            aria-label="Analytics sections"
          >
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="revenue">Payouts</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="offers">Offers</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6">
          <OverviewTab period={period} />
        </TabsContent>

        <TabsContent value="revenue" className="space-y-6">
          <RevenueTab period={period} />
        </TabsContent>

        <TabsContent value="inventory" className="space-y-6">
          <InventoryTab period={period} />
        </TabsContent>

        <TabsContent value="offers" className="space-y-6">
          <OffersTab period={period} />
        </TabsContent>

        <TabsContent value="reviews" className="space-y-6">
          <ReviewsTab period={period} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Overview Tab ─── */
function OverviewTab({ period }: { period: Period }) {
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.analytics.overview.useQuery({ period });

  if (isLoading) return <LoadingKPIs count={4} />;
  if (isError || !data) {
    return (
      <AnalyticsErrorState
        onRetry={() => void refetch()}
        isRetrying={isFetching}
      />
    );
  }

  const { kpis, timeSeries, ordersByStatus } = data;

  if (kpis.views === 0 && kpis.orders === 0 && timeSeries.length === 0) {
    return (
      <StatePanel
        icon={TrendingUp}
        title="No marketplace activity yet"
        description="Publish or refresh an accurate, ship-ready listing. Views, paid orders, and net proceeds will appear here as buyers engage."
        primaryAction={{ label: "Manage listings", href: "/seller/listings" }}
        secondaryAction={{
          label: "Create a listing",
          href: "/seller/listings/new",
        }}
      />
    );
  }

  const revenueTrend = calcTrend(kpis.revenue, kpis.prevRevenue);
  const ordersTrend = calcTrend(kpis.orders, kpis.prevOrders);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Captured net proceeds"
          value={formatCurrency(kpis.revenue)}
          icon={DollarSign}
          trend={revenueTrend}
          accentColor="secondary"
        />
        <StatsCard
          title="Paid orders"
          value={formatNumber(kpis.orders)}
          icon={ShoppingCart}
          trend={ordersTrend}
          accentColor="primary"
        />
        <StatsCard
          title="All-time views"
          value={formatNumber(kpis.views)}
          icon={Eye}
          accentColor="accent"
        />
        <StatsCard
          title="All-time paid conversion"
          value={`${kpis.conversionRate}%`}
          icon={TrendingUp}
          accentColor="warning"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Captured Net Proceeds Over Time">
          {timeSeries.length > 0 ? (
            <AreaChart
              data={timeSeries}
              dataKey="revenue"
              formatValue={(v) => formatCurrency(v)}
            />
          ) : (
            <ChartEmpty message="No paid orders in this date range." />
          )}
        </ChartCard>

        <ChartCard title="Paid Orders by Fulfillment Status">
          {ordersByStatus.length > 0 ? (
            <BarChart
              data={ordersByStatus.map((s) => ({
                name: s.status,
                value: s.count,
              }))}
            />
          ) : (
            <ChartEmpty message="No fulfillment activity in this date range." />
          )}
        </ChartCard>
      </div>
    </>
  );
}

/* ─── Revenue Tab ─── */
function RevenueTab({ period }: { period: Period }) {
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.analytics.revenue.useQuery({ period });

  if (isLoading) return <LoadingKPIs count={3} />;
  if (isError || !data) {
    return (
      <AnalyticsErrorState
        onRetry={() => void refetch()}
        isRetrying={isFetching}
      />
    );
  }

  const { kpis, byMaterialType, byOrderStatus, timeSeries } = data;

  if (
    kpis.orderCount === 0 &&
    kpis.transferredNetProceeds === 0 &&
    kpis.refundedBuyerCharges === 0
  ) {
    return (
      <StatePanel
        icon={DollarSign}
        title="No payout activity in this date range"
        description="Captured proceeds, transfers, refunds, and seller shipping contributions will appear after buyers complete paid orders."
        primaryAction={{ label: "View orders", href: "/seller/orders" }}
        secondaryAction={{ label: "Manage listings", href: "/seller/listings" }}
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Captured Net Proceeds"
          value={formatCurrency(kpis.totalRevenue)}
          icon={DollarSign}
          accentColor="secondary"
        />
        <StatsCard
          title="Transferred Proceeds"
          value={formatCurrency(kpis.transferredNetProceeds)}
          icon={ShoppingCart}
          accentColor="primary"
        />
        <StatsCard
          title="All-time Buyer Charges Refunded"
          value={formatCurrency(kpis.refundedBuyerCharges)}
          icon={DollarSign}
          accentColor="warning"
        />
        <StatsCard
          title="Seller Shipping Contributions"
          value={formatCurrency(kpis.sellerFreightContribution)}
          icon={Package}
          accentColor="accent"
        />
      </div>

      <ChartCard title="Captured Net Proceeds Over Time">
        {timeSeries.length > 0 ? (
          <AreaChart
            data={timeSeries}
            dataKey="revenue"
            formatValue={(v) => formatCurrency(v)}
          />
        ) : (
          <ChartEmpty message="No captured proceeds in this date range." />
        )}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Captured Net Proceeds by Material Type">
          {byMaterialType.length > 0 ? (
            <BarChart
              data={byMaterialType.map((m) => ({
                name: formatMaterialType(m.materialType),
                value: m.revenue,
              }))}
              layout="horizontal"
              formatValue={(v) => formatCurrency(v)}
            />
          ) : (
            <ChartEmpty message="No material-level proceeds to compare." />
          )}
        </ChartCard>

        <ChartCard title="Captured Net Proceeds by Fulfillment Status">
          {byOrderStatus.length > 0 ? (
            <div className="space-y-3">
              {byOrderStatus.map((s) => (
                <div
                  key={s.status}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm capitalize">{s.status}</span>
                  <div className="text-right">
                    <span className="text-sm font-medium">
                      {formatCurrency(s.revenue)}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({s.count} orders)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ChartEmpty message="No fulfillment proceeds to compare." />
          )}
        </ChartCard>
      </div>
    </>
  );
}

/* ─── Inventory Tab ─── */
function InventoryTab({ period }: { period: Period }) {
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.analytics.inventory.useQuery({ period });

  if (isLoading) return <LoadingKPIs count={3} />;
  if (isError || !data) {
    return (
      <AnalyticsErrorState
        onRetry={() => void refetch()}
        isRetrying={isFetching}
      />
    );
  }

  const { kpis, byStatus, topViewed } = data;

  if (byStatus.length === 0 && topViewed.length === 0) {
    return (
      <StatePanel
        icon={Package}
        title="No inventory to analyze yet"
        description="Create your first listing to start tracking active square footage, listing status, buyer views, and days on market."
        primaryAction={{
          label: "Create a listing",
          href: "/seller/listings/new",
        }}
        secondaryAction={{ label: "Open inventory", href: "/seller/inventory" }}
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="Active Listings"
          value={formatNumber(kpis.activeListings)}
          icon={Package}
          accentColor="primary"
        />
        <StatsCard
          title="Total Sqft Available"
          value={formatNumber(kpis.totalSqFtAvailable)}
          icon={Ruler}
          accentColor="accent"
        />
        <StatsCard
          title="Avg Days on Market"
          value={`${kpis.avgDaysOnMarket}d`}
          icon={Clock}
          accentColor="warning"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Listings by Status">
          <DonutChart
            data={byStatus.map((s) => ({
              name: s.status,
              value: s.count,
            }))}
          />
        </ChartCard>

        <ChartCard title="Top Listings by Views">
          <BarChart
            data={topViewed.slice(0, 10).map((l) => ({
              name:
                l.title.length > 25 ? l.title.slice(0, 25) + "..." : l.title,
              value: l.viewsCount,
            }))}
            layout="horizontal"
            height={Math.max(200, topViewed.length * 35)}
          />
        </ChartCard>
      </div>

      <ChartCard title="All Listings">
        <TopListingsTable listings={topViewed} />
      </ChartCard>
    </>
  );
}

/* ─── Offers Tab ─── */
function OffersTab({ period }: { period: Period }) {
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.analytics.offers.useQuery({ period });

  if (isLoading) return <LoadingKPIs count={4} />;
  if (isError || !data) {
    return (
      <AnalyticsErrorState
        onRetry={() => void refetch()}
        isRetrying={isFetching}
      />
    );
  }

  const { kpis, byStatus, timeSeries, topNegotiated } = data;

  if (kpis.totalOffers === 0) {
    return (
      <StatePanel
        icon={MessageSquare}
        title="No offers in this date range"
        description="Offer volume, acceptance rate, and negotiation trends will appear when buyers make offers on eligible listings."
        primaryAction={{ label: "Manage listings", href: "/seller/listings" }}
        secondaryAction={{
          label: "View buyer requests",
          href: "/seller/request-board",
        }}
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Offers Received"
          value={formatNumber(kpis.totalOffers)}
          icon={MessageSquare}
          accentColor="primary"
        />
        <StatsCard
          title="Accepted"
          value={formatNumber(kpis.accepted)}
          icon={ShoppingCart}
          accentColor="secondary"
        />
        <StatsCard
          title="Acceptance Rate"
          value={`${kpis.acceptanceRate}%`}
          icon={Percent}
          accentColor="accent"
        />
        <StatsCard
          title="Avg Discount"
          value={`${kpis.avgDiscount}%`}
          icon={TrendingUp}
          accentColor="warning"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Offer Funnel">
          <DonutChart
            data={byStatus.map((s) => ({
              name: s.status,
              value: s.count,
            }))}
          />
        </ChartCard>

        <ChartCard title="Offers Over Time">
          <AreaChart data={timeSeries} dataKey="count" />
        </ChartCard>
      </div>

      {topNegotiated.length > 0 && (
        <ChartCard title="Most Negotiated Listings">
          <div className="space-y-3">
            {topNegotiated.map((l) => (
              <div
                key={l.listingId}
                className="flex items-center justify-between py-1.5"
              >
                <Link
                  href={`/listings/${l.slug ?? l.listingId}`}
                  className="text-sm font-medium hover:text-primary transition-colors truncate max-w-[250px]"
                >
                  {l.title}
                </Link>
                <div className="text-right text-sm">
                  <span className="font-medium">{l.offerCount} offers</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    avg {Math.round(l.avgRounds * 10) / 10} rounds
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </>
  );
}

/* ─── Reviews Tab ─── */
function ReviewsTab({ period }: { period: Period }) {
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.analytics.reviews.useQuery({ period });

  if (isLoading) return <LoadingKPIs count={3} />;
  if (isError || !data) {
    return (
      <AnalyticsErrorState
        onRetry={() => void refetch()}
        isRetrying={isFetching}
      />
    );
  }

  const { kpis, subRatings, ratingDistribution, recentReviews } = data;

  if (kpis.totalReviews === 0) {
    return (
      <StatePanel
        icon={Star}
        title="No buyer reviews in this date range"
        description="Verified buyer feedback and your response rate will appear after eligible orders are completed and reviewed."
        primaryAction={{ label: "View orders", href: "/seller/orders" }}
        secondaryAction={{ label: "Manage listings", href: "/seller/listings" }}
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="Average Rating"
          value={kpis.avgRating.toFixed(1)}
          icon={Star}
          accentColor="warning"
        />
        <StatsCard
          title="Total Reviews"
          value={formatNumber(kpis.totalReviews)}
          icon={MessageSquare}
          accentColor="primary"
        />
        <StatsCard
          title="Response Rate"
          value={`${kpis.responseRate}%`}
          icon={Percent}
          accentColor="accent"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Rating Distribution">
          <BarChart
            data={ratingDistribution.map((r) => ({
              name: `${r.rating} star${r.rating !== 1 ? "s" : ""}`,
              value: r.count,
            }))}
            color="hsl(38 92% 50%)"
          />
        </ChartCard>

        <ChartCard title="Sub-Rating Averages">
          <BarChart
            data={[
              { name: "Communication", value: subRatings.communication },
              { name: "Accuracy", value: subRatings.accuracy },
              { name: "Shipping", value: subRatings.shipping },
            ]}
            layout="horizontal"
            formatValue={(v) => v.toFixed(1)}
            height={150}
          />
        </ChartCard>
      </div>

      {recentReviews.length > 0 && (
        <ChartCard title="Recent Reviews">
          <div className="space-y-4">
            {recentReviews.map((r) => (
              <ReviewCard
                key={r.id}
                reviewerName={r.reviewerName}
                reviewerAvatar={r.reviewerAvatar}
                date={new Date(r.date)}
                rating={r.rating}
                title={r.title ?? undefined}
                comment={r.comment}
                subRatings={r.subRatings}
                sellerResponse={
                  r.sellerResponse
                    ? {
                        message: r.sellerResponse.message,
                        date: new Date(r.sellerResponse.date),
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </ChartCard>
      )}
    </>
  );
}

/* ─── Loading State ─── */
function AnalyticsErrorState({
  onRetry,
  isRetrying,
}: {
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <QueryErrorState
      title="We couldn't load these analytics"
      description="No marketplace data was changed. Check your connection and try loading this section again."
      onRetry={onRetry}
      isRetrying={isRetrying}
      secondaryAction={{ label: "Open seller dashboard", href: "/seller" }}
    />
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 text-center"
    >
      <BarChart3
        className="mb-3 h-6 w-6 text-muted-foreground"
        aria-hidden="true"
      />
      <p className="max-w-xs text-sm leading-6 text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

function LoadingKPIs({ count }: { count: number }) {
  return (
    <div
      className="space-y-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading analytics</span>
      <div
        className={cn(
          "grid gap-4",
          count > 3 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3",
        )}
        aria-hidden="true"
      >
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2" aria-hidden="true">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    </div>
  );
}
