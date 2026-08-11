"use client";

import { useState } from "react";
import Link from "next/link";
import { StatsCard } from "@/components/dashboard/stats-card";
import { StripeOnboardingBanner } from "@/components/dashboard/stripe-onboarding-banner";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { trpc } from "@/lib/trpc/client";
import { useProStatus } from "@/hooks/use-pro-status";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProBadge } from "@/components/pro-badge";
import { AreaChart } from "@/components/analytics/area-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  QueryErrorState,
  StatePanel,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import {
  Package,
  Eye,
  DollarSign,
  ShoppingCart,
  ClipboardList,
  ArrowRight,
  MapPin,
  SlidersHorizontal,
  BarChart3,
  X,
  Sparkles,
} from "lucide-react";

function calcTrend(
  current: number,
  previous: number,
): { value: number; label: string } {
  if (previous === 0) {
    return { value: current > 0 ? 100 : 0, label: "vs prev 30d" };
  }

  return {
    value: Math.round(((current - previous) / previous) * 100),
    label: "vs prev 30d",
  };
}

export default function SellerDashboardPage() {
  const listingStatsQuery = trpc.listing.getSellerStats.useQuery();
  const orderStatsQuery = trpc.order.getSellerOrderStats.useQuery();
  const analyticsQuery = trpc.analytics.overview.useQuery({ period: "30d" });
  const recommendedRequestsQuery =
    trpc.matching.recommendedRequests.useQuery();

  const { isPro } = useProStatus();
  const [proBannerDismissed, setProBannerDismissed] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return localStorage.getItem("plankmarket_pro_banner_dismissed") === "true";
  });

  const handleDismissProBanner = () => {
    localStorage.setItem("plankmarket_pro_banner_dismissed", "true");
    setProBannerDismissed(true);
  };

  const isPrimaryLoading =
    listingStatsQuery.isLoading || orderStatsQuery.isLoading;
  const hasPrimaryError =
    !isPrimaryLoading &&
    (listingStatsQuery.isError ||
      !listingStatsQuery.data ||
      orderStatsQuery.isError ||
      !orderStatsQuery.data);

  const listingStats = listingStatsQuery.data ?? [];
  const orderStats = orderStatsQuery.data ?? [];
  const analyticsData = analyticsQuery.data;
  const recommendedRequestsData = recommendedRequestsQuery.data;
  const recommendedRequests = recommendedRequestsData?.items ?? [];
  const sellerPrefsIncomplete =
    recommendedRequestsData?.prefsIncomplete ?? false;

  const activeListings =
    listingStats.find((s) => s.status === "active")?.count ?? 0;
  const totalViews =
    listingStats.reduce((sum, s) => sum + s.totalViews, 0) ?? 0;
  const totalRevenue =
    orderStats.reduce((sum, s) => sum + s.totalRevenue, 0) ?? 0;
  const pendingOrders =
    orderStats.find((s) => s.status === "pending")?.count ?? 0;

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
        <p className="mt-1 text-muted-foreground">
          Overview of your listings, orders, and performance
        </p>
      </div>

      <StripeOnboardingBanner />

      <OnboardingChecklist variant="seller" />

      {isPrimaryLoading ? (
        <StatePanelLoading label="Loading your seller dashboard" rows={4} />
      ) : hasPrimaryError ? (
        <QueryErrorState
          title="We couldn't load your seller dashboard"
          description="Listing and order totals are unchanged. Check your connection and try loading the dashboard again."
          onRetry={() =>
            void Promise.all([
              listingStatsQuery.refetch(),
              orderStatsQuery.refetch(),
            ])
          }
          isRetrying={listingStatsQuery.isFetching || orderStatsQuery.isFetching}
          secondaryAction={{ label: "Manage listings", href: "/seller/listings" }}
        />
      ) : (
        <>
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

          {!isPro && !proBannerDismissed ? (
            <div className="relative flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/30 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <Sparkles
                  className="h-5 w-5 shrink-0 text-amber-600"
                  aria-hidden="true"
                />
                <p className="text-sm">
                  Unlock AI Agent, Market Intelligence, and unlimited listings
                  with <span className="font-semibold">PlankMarket Pro</span>{" "}
                  <ProBadge className="align-middle" /> - $29/mo
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href="/pro">
                  <Button size="sm" variant="gold">
                    Learn More
                  </Button>
                </Link>
                <button
                  onClick={handleDismissProBanner}
                  className="rounded-md p-1 text-amber-700 transition-colors hover:bg-amber-200/60"
                  aria-label="Dismiss Pro upgrade banner"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <BarChart3 className="h-4 w-4" />
                  30-Day Revenue
                </CardTitle>
                <Link href="/seller/analytics">
                  <Button variant="ghost" size="sm">
                    View detailed analytics{" "}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {analyticsQuery.isLoading ? (
                <StatePanelLoading label="Loading revenue analytics" rows={2} />
              ) : analyticsQuery.isError || !analyticsData ? (
                <QueryErrorState
                  title="We couldn't load analytics"
                  description="Your listing and order queues are still available. Open the analytics page directly or try loading this summary again."
                  onRetry={() => void analyticsQuery.refetch()}
                  isRetrying={analyticsQuery.isFetching}
                  secondaryAction={{
                    label: "Open analytics",
                    href: "/seller/analytics",
                  }}
                />
              ) : analyticsData.timeSeries.length === 0 ? (
                <StatePanel
                  icon={BarChart3}
                  title="No revenue data yet"
                  description="Once orders move through the marketplace, revenue trends will appear here."
                  tone="info"
                  primaryAction={{
                    label: "Manage listings",
                    href: "/seller/listings",
                  }}
                  className="min-h-0 px-4 py-8"
                />
              ) : (
                <AreaChart
                  data={analyticsData.timeSeries}
                  dataKey="revenue"
                  height={200}
                  formatValue={(v) => formatCurrency(v)}
                />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border bg-card p-6">
              <h3 className="mb-4 font-semibold">Listing Summary</h3>
              {listingStats.length === 0 ? (
                <StatePanel
                  icon={Package}
                  title="No listings yet"
                  description="Create your first listing to start selling."
                  primaryAction={{
                    label: "Create listing",
                    href: "/seller/listings/new",
                  }}
                  secondaryAction={{
                    label: "Manage listings",
                    href: "/seller/listings",
                  }}
                  className="min-h-0 px-4 py-8"
                />
              ) : (
                <div className="space-y-3">
                  {listingStats.map((stat) => (
                    <div
                      key={stat.status}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm capitalize text-muted-foreground">
                        {stat.status}
                      </span>
                      <span className="font-medium">{stat.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-card p-6">
              <h3 className="mb-4 font-semibold">Order Summary</h3>
              {orderStats.length === 0 ? (
                <StatePanel
                  icon={ShoppingCart}
                  title="No orders yet"
                  description="Orders will appear here once buyers purchase your inventory."
                  primaryAction={{
                    label: "Create listing",
                    href: "/seller/listings/new",
                  }}
                  className="min-h-0 px-4 py-8"
                />
              ) : (
                <div className="space-y-3">
                  {orderStats.map((stat) => (
                    <div
                      key={stat.status}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm capitalize text-muted-foreground">
                        {stat.status}
                      </span>
                      <div className="text-right">
                        <span className="font-medium">{stat.count}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({formatCurrency(stat.totalRevenue)})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
                <h3 className="font-semibold">Matching Buyer Requests</h3>
              </div>
              <Link href="/seller/request-board">
                <Button variant="ghost" size="sm">
                  View all{" "}
                  <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
                </Button>
              </Link>
            </div>

            {recommendedRequestsQuery.isLoading ? (
              <StatePanelLoading
                label="Loading matching buyer requests"
                rows={2}
              />
            ) : recommendedRequestsQuery.isError || !recommendedRequestsData ? (
              <QueryErrorState
                title="We couldn't load matching buyer requests"
                description="Your listing and order data is still available. Try loading buyer matches again or open the request board directly."
                onRetry={() => void recommendedRequestsQuery.refetch()}
                isRetrying={recommendedRequestsQuery.isFetching}
                secondaryAction={{
                  label: "Open request board",
                  href: "/seller/request-board",
                }}
              />
            ) : sellerPrefsIncomplete ? (
              <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-4">
                <SlidersHorizontal
                  className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium">Set up your preferences</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
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
              <StatePanel
                icon={ClipboardList}
                title="No matching buyer requests right now"
                description="Check back soon or expand your listing and preference coverage to catch more demand."
                primaryAction={{
                  label: "Open request board",
                  href: "/seller/request-board",
                }}
                secondaryAction={{
                  label: "Update preferences",
                  href: "/preferences",
                }}
                className="min-h-0 px-4 py-8"
              />
            ) : (
              <div className="space-y-3">
                {recommendedRequests.slice(0, 5).map((req) => (
                  <Link
                    key={req.id}
                    href="/seller/request-board"
                    className="flex items-center justify-between rounded px-2 py-2 transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium">
                        {req.title || "Untitled Request"}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {req.materialTypes?.slice(0, 2).map((m) => (
                          <Badge key={m} variant="outline" className="text-xs">
                            {m.replace("_", " ")}
                          </Badge>
                        ))}
                        {req.destinationZip ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {req.destinationZip}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {req.priceMaxPerSqFt ? (
                      <span className="ml-2 shrink-0 text-sm font-medium text-primary">
                        Up to ${req.priceMaxPerSqFt}/sqft
                      </span>
                    ) : null}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
