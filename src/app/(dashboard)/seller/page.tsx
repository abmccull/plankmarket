"use client";

import Link from "next/link";
import { StatsCard } from "@/components/dashboard/stats-card";
import { StripeOnboardingBanner } from "@/components/dashboard/stripe-onboarding-banner";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

export default function SellerDashboardPage() {
  const { data: listingStats, isLoading: listingsLoading } =
    trpc.listing.getSellerStats.useQuery();
  const { data: orderStats, isLoading: ordersLoading } =
    trpc.order.getSellerOrderStats.useQuery();
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-display">Seller Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your listings, orders, and performance
        </p>
      </div>

      <StripeOnboardingBanner />

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
        />
        <StatsCard
          title="Pending Orders"
          value={formatNumber(pendingOrders)}
          icon={ShoppingCart}
          accentColor="warning"
        />
      </div>

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
              <p className="text-sm text-muted-foreground">
                No listings yet. Create your first listing to get started.
              </p>
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
              <p className="text-sm text-muted-foreground">
                No orders yet.
              </p>
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
