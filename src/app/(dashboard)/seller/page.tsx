"use client";

import Link from "next/link";
import { StatsCard } from "@/components/dashboard/stats-card";
import { StripeOnboardingBanner } from "@/components/dashboard/stripe-onboarding-banner";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { EmptyState } from "@/components/ui/empty-state";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AreaChart } from "@/components/analytics/area-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Package,
  Eye,
  DollarSign,
  ShoppingCart,
  Loader2,
  ClipboardList,
  ArrowRight,
  MapPin,
  SlidersHorizontal,
  BarChart3,
} from "lucide-react";

function calcTrend(current: number, previous: number): { value: number; label: string } {
  if (previous === 0) return { value: current > 0 ? 100 : 0, label: "vs prev 30d" };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { value: pct, label: "vs prev 30d" };
}

export default function SellerDashboardPage() {
  const { data: listingStats, isLoading: listingsLoading } =
    trpc.listing.getSellerStats.useQuery();
  const { data: orderStats, isLoading: ordersLoading } =
    trpc.order.getSellerOrderStats.useQuery();
  const { data: analyticsData } =
    trpc.analytics.overview.useQuery({ period: "30d" });
  const { data: recommendedRequestsData } =
    trpc.matching.recommendedRequests.useQuery();

  const isLoading = listingsLoading || ordersLoading;
  const recommendedRequests = recommendedRequestsData?.items ?? [];
  const sellerPrefsIncomplete = recommendedRequestsData?.prefsIncomplete ?? false;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeListings =
    listingStats?.find((s) => s.status === "active")?.count ?? 0;
  const totalViews =
    listingStats?.reduce((sum, s) => sum + s.totalViews, 0) ?? 0;
  const totalRevenue =
    orderStats?.reduce((sum, s) => sum + s.totalRevenue, 0) ?? 0;
  const pendingOrders =
    orderStats?.find((s) => s.status === "pending")?.count ?? 0;

  // Trend calculations from analytics data
  const revenueTrend = analyticsData
    ? calcTrend(analyticsData.kpis.revenue, analyticsData.kpis.prevRevenue)
    : undefined;
  const ordersTrend = analyticsData
    ? calcTrend(analyticsData.kpis.orders, analyticsData.kpis.prevOrders)
    : undefined;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display">Seller Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your listings, orders, and performance
        </p>
      </div>

      <StripeOnboardingBanner />

      <OnboardingChecklist variant="seller" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Listings"
          value={formatNumber(activeListings)}
          icon={Package}
          accentColor="primary"
        />
        <StatsCard
          title="Total Views"
          value={formatNumber(totalViews)}
          icon={Eye}
          accentColor="accent"
        />
        <StatsCard
          title="Total Revenue"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
          accentColor="secondary"
          trend={revenueTrend}
        />
        <StatsCard
          title="Pending Orders"
          value={formatNumber(pendingOrders)}
          icon={ShoppingCart}
          accentColor="warning"
          trend={ordersTrend}
        />
      </div>

      {/* Mini Revenue Chart + Analytics Link */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              30-Day Revenue
            </CardTitle>
            <Link href="/seller/analytics">
              <Button variant="ghost" size="sm">
                View detailed analytics <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {analyticsData?.timeSeries ? (
            <AreaChart
              data={analyticsData.timeSeries}
              dataKey="revenue"
              height={200}
              formatValue={(v) => formatCurrency(v)}
            />
          ) : (
            <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
              No revenue data yet
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-6">
          <h3 className="font-semibold mb-4">Listing Summary</h3>
          <div className="space-y-3">
            {listingStats?.map((stat) => (
              <div
                key={stat.status}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-muted-foreground capitalize">
                  {stat.status}
                </span>
                <span className="font-medium">{stat.count}</span>
              </div>
            )) ?? (
              <EmptyState
                icon={Package}
                title="No listings yet"
                description="Create your first listing to start selling"
                action={{ label: "Create Listing", href: "/seller/listings/new" }}
              />
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6">
          <h3 className="font-semibold mb-4">Order Summary</h3>
          <div className="space-y-3">
            {orderStats?.map((stat) => (
              <div
                key={stat.status}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-muted-foreground capitalize">
                  {stat.status}
                </span>
                <div className="text-right">
                  <span className="font-medium">{stat.count}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({formatCurrency(stat.totalRevenue)})
                  </span>
                </div>
              </div>
            )) ?? (
              <EmptyState
                icon={ShoppingCart}
                title="No orders yet"
                description="Orders will appear here once buyers purchase your listings"
              />
            )}
          </div>
        </div>
      </div>

      {/* Matching Buyer Requests */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <h3 className="font-semibold">Matching Buyer Requests</h3>
          </div>
          <Link href="/seller/request-board">
            <Button variant="ghost" size="sm">
              View all <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
            </Button>
          </Link>
        </div>

        {sellerPrefsIncomplete ? (
          <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-4">
            <SlidersHorizontal
              className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium">Set up your preferences</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Complete your seller preferences to see buyer requests that
                match your inventory.
              </p>
              <Link href="/preferences" className="mt-2 inline-block">
                <Button size="sm" variant="outline">
                  Complete Preferences
                </Button>
              </Link>
            </div>
          </div>
        ) : recommendedRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No matching buyer requests right now. Check back soon.
          </p>
        ) : (
          <div className="space-y-3">
            {recommendedRequests
              .slice(0, 5)
              .map(
                (req: {
                  id: string;
                  title?: string | null;
                  materialTypes?: string[];
                  minSqFt?: number | null;
                  maxSqFt?: number | null;
                  maxPricePerSqFt?: number | null;
                  destinationZip?: string | null;
                  urgency?: string | null;
                }) => (
                  <Link
                    key={req.id}
                    href="/seller/request-board"
                    className="flex items-center justify-between py-2 hover:bg-muted/30 rounded px-2 transition-colors"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium truncate">
                        {req.title || "Untitled Request"}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {req.materialTypes?.slice(0, 2).map((m) => (
                          <Badge
                            key={m}
                            variant="outline"
                            className="text-xs"
                          >
                            {m.replace("_", " ")}
                          </Badge>
                        ))}
                        {req.destinationZip && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {req.destinationZip}
                          </span>
                        )}
                      </div>
                    </div>
                    {req.maxPricePerSqFt && (
                      <span className="text-sm font-medium text-primary shrink-0 ml-2">
                        Up to ${req.maxPricePerSqFt}/sqft
                      </span>
                    )}
                  </Link>
                )
              )}
          </div>
        )}
      </div>
    </div>
  );
}
