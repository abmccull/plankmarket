"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { StatsCard } from "@/components/dashboard/stats-card";
import { DateRangeSelector } from "@/components/analytics/date-range-selector";
import { ChartCard } from "@/components/analytics/chart-card";
import { AreaChart } from "@/components/analytics/area-chart";
import { BarChart } from "@/components/analytics/bar-chart";
import { DonutChart } from "@/components/analytics/donut-chart";
import { MetricRow } from "@/components/analytics/metric-row";
import { TopListingsTable } from "@/components/analytics/top-listings-table";
import { ReviewCard } from "@/components/shared/review-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { Period } from "@/lib/validators/analytics";
import {
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

function calcTrend(current: number, previous: number): { value: number; label: string } {
  if (previous === 0) return { value: current > 0 ? 100 : 0, label: "vs prev period" };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { value: pct, label: "vs prev period" };
}

function formatMaterialType(mt: string) {
  return mt.replace(/_/g, " ").replace(/\blvp\b/i, "LVP").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return <Skeleton className="w-full rounded-lg" style={{ height }} />;
}

export default function SellerAnalyticsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tab = (searchParams.get("tab") ?? "overview") as string;
  const period = (searchParams.get("period") ?? "30d") as Period;

  const setParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Track your performance and revenue
          </p>
        </div>
        <DateRangeSelector
          value={period}
          onChange={(p) => setParams({ period: p })}
        />
      </div>

      <Tabs value={tab} onValueChange={(t) => setParams({ tab: t })}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="offers">Offers</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
        </TabsList>

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
  const { data, isLoading } = trpc.analytics.overview.useQuery({ period });

  if (isLoading) return <LoadingKPIs count={4} />;
  if (!data) return null;

  const { kpis, timeSeries, ordersByStatus } = data;
  const revenueTrend = calcTrend(kpis.revenue, kpis.prevRevenue);
  const ordersTrend = calcTrend(kpis.orders, kpis.prevOrders);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Revenue"
          value={formatCurrency(kpis.revenue)}
          icon={DollarSign}
          trend={revenueTrend}
          accentColor="secondary"
        />
        <StatsCard
          title="Orders"
          value={formatNumber(kpis.orders)}
          icon={ShoppingCart}
          trend={ordersTrend}
          accentColor="primary"
        />
        <StatsCard
          title="Total Views"
          value={formatNumber(kpis.views)}
          icon={Eye}
          accentColor="accent"
        />
        <StatsCard
          title="Conversion Rate"
          value={`${kpis.conversionRate}%`}
          icon={TrendingUp}
          accentColor="warning"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Revenue Over Time">
          <AreaChart
            data={timeSeries}
            dataKey="revenue"
            formatValue={(v) => formatCurrency(v)}
          />
        </ChartCard>

        <ChartCard title="Orders by Status">
          <BarChart
            data={ordersByStatus.map((s) => ({
              name: s.status,
              value: s.count,
            }))}
          />
        </ChartCard>
      </div>
    </>
  );
}

/* ─── Revenue Tab ─── */
function RevenueTab({ period }: { period: Period }) {
  const { data, isLoading } = trpc.analytics.revenue.useQuery({ period });

  if (isLoading) return <LoadingKPIs count={3} />;
  if (!data) return null;

  const { kpis, byMaterialType, byOrderStatus, timeSeries } = data;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="Total Revenue"
          value={formatCurrency(kpis.totalRevenue)}
          icon={DollarSign}
          accentColor="secondary"
        />
        <StatsCard
          title="Avg Order Value"
          value={formatCurrency(kpis.avgOrderValue)}
          icon={ShoppingCart}
          accentColor="primary"
        />
        <StatsCard
          title="Shipping Margin"
          value={formatCurrency(kpis.shippingMargin)}
          icon={Package}
          accentColor="accent"
        />
      </div>

      <ChartCard title="Revenue Over Time">
        <AreaChart
          data={timeSeries}
          dataKey="revenue"
          formatValue={(v) => formatCurrency(v)}
        />
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Revenue by Material Type">
          <BarChart
            data={byMaterialType.map((m) => ({
              name: formatMaterialType(m.materialType),
              value: m.revenue,
            }))}
            layout="horizontal"
            formatValue={(v) => formatCurrency(v)}
          />
        </ChartCard>

        <ChartCard title="Revenue by Order Status">
          <div className="space-y-3">
            {byOrderStatus.map((s) => (
              <div key={s.status} className="flex items-center justify-between">
                <span className="text-sm capitalize">{s.status}</span>
                <div className="text-right">
                  <span className="text-sm font-medium">
                    {formatCurrency(s.revenue)}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({s.count} orders)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </>
  );
}

/* ─── Inventory Tab ─── */
function InventoryTab({ period }: { period: Period }) {
  const { data, isLoading } = trpc.analytics.inventory.useQuery({ period });

  if (isLoading) return <LoadingKPIs count={3} />;
  if (!data) return null;

  const { kpis, byStatus, topViewed } = data;

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
              name: l.title.length > 25 ? l.title.slice(0, 25) + "..." : l.title,
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
  const { data, isLoading } = trpc.analytics.offers.useQuery({ period });

  if (isLoading) return <LoadingKPIs count={4} />;
  if (!data) return null;

  const { kpis, byStatus, timeSeries, topNegotiated } = data;

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
              <div key={l.listingId} className="flex items-center justify-between py-1.5">
                <a
                  href={`/listings/${l.slug ?? l.listingId}`}
                  className="text-sm font-medium hover:text-primary transition-colors truncate max-w-[250px]"
                >
                  {l.title}
                </a>
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
  const { data, isLoading } = trpc.analytics.reviews.useQuery({ period });

  if (isLoading) return <LoadingKPIs count={3} />;
  if (!data) return null;

  const { kpis, subRatings, ratingDistribution, recentReviews } = data;

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
                    ? { message: r.sellerResponse.message, date: new Date(r.sellerResponse.date) }
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
function LoadingKPIs({ count }: { count: number }) {
  return (
    <div className="space-y-6">
      <div className={`grid gap-4 md:grid-cols-${count > 3 ? "2 lg:grid-cols-4" : count}`}>
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    </div>
  );
}
