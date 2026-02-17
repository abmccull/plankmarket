"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { StatsCard } from "@/components/dashboard/stats-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart,
  Heart,
  Search,
  ArrowRight,
  Loader2,
  FileText,
  SlidersHorizontal,
} from "lucide-react";

export default function BuyerDashboardPage() {
  const { data: orders, isLoading: ordersLoading } =
    trpc.order.getMyOrders.useQuery({ page: 1, limit: 5 });
  const { data: watchlist, isLoading: watchlistLoading } =
    trpc.watchlist.getMyWatchlist.useQuery({ page: 1, limit: 5 });
  const { data: savedSearches, isLoading: searchesLoading } =
    trpc.search.getMySavedSearches.useQuery();
  const { data: recommendedData } =
    trpc.matching.recommendedListings.useQuery();
  const { data: myRequestsData } =
    trpc.buyerRequest.getMyRequests.useQuery({ page: 1, limit: 50 });

  const isLoading = ordersLoading || watchlistLoading || searchesLoading;

  const recommendedListings = recommendedData?.items ?? [];
  const prefsIncomplete = recommendedData?.prefsIncomplete ?? false;
  const openRequestsCount =
    myRequestsData?.items?.filter(
      (r: { status: string }) => r.status === "open"
    ).length ?? 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-display">Buyer Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Track your orders, watchlist, and saved searches
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="Total Orders"
          value={orders?.total ?? 0}
          icon={ShoppingCart}
        />
        <StatsCard
          title="Watchlist Items"
          value={watchlist?.total ?? 0}
          icon={Heart}
        />
        <StatsCard
          title="Saved Searches"
          value={savedSearches?.length ?? 0}
          icon={Search}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Orders */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Recent Orders</h3>
            <Link href="/buyer/orders">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
          {orders?.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No orders yet. Browse listings to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {orders?.items.map((order) => (
                <Link
                  key={order.id}
                  href={`/buyer/orders/${order.id}`}
                  className="flex items-center justify-between py-2 hover:bg-muted/30 rounded px-2 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {order.orderNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.listing.title}
                    </p>
                  </div>
                  <span className="text-sm font-medium capitalize">
                    {order.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Watchlist */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Watchlist</h3>
            <Link href="/buyer/watchlist">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
          {watchlist?.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No items in your watchlist yet.
            </p>
          ) : (
            <div className="space-y-3">
              {watchlist?.items.map((item) => (
                <Link
                  key={item.id}
                  href={`/listings/${item.listing.id}`}
                  className="flex items-center justify-between py-2 hover:bg-muted/30 rounded px-2 transition-colors"
                >
                  <p className="text-sm font-medium truncate">
                    {item.listing.title}
                  </p>
                  <span className="text-sm text-primary shrink-0">
                    ${item.listing.askPricePerSqFt}/sf
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Open Requests */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <h3 className="font-semibold">Your Open Requests</h3>
          </div>
          <Link href="/buyer/requests">
            <Button variant="ghost" size="sm">
              View all <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
            </Button>
          </Link>
        </div>
        {openRequestsCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open requests.{" "}
            <Link href="/buyer/requests/new" className="text-primary hover:underline">
              Post a request
            </Link>{" "}
            and let sellers come to you.
          </p>
        ) : (
          <p className="text-sm">
            You have{" "}
            <span className="font-semibold">{openRequestsCount}</span> open{" "}
            {openRequestsCount === 1 ? "request" : "requests"} awaiting seller
            responses.
          </p>
        )}
      </div>

      {/* Recommended Listings */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Recommended Listings</h3>
          <Link href="/listings">
            <Button variant="ghost" size="sm">
              Browse all <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
            </Button>
          </Link>
        </div>
        {prefsIncomplete ? (
          <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-4">
            <SlidersHorizontal className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Set up your preferences</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Complete your preferences to see personalized listing
                recommendations.
              </p>
              <Link href="/preferences" className="mt-2 inline-block">
                <Button size="sm" variant="outline">
                  Complete Preferences
                </Button>
              </Link>
            </div>
          </div>
        ) : recommendedListings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No matching listings found right now. Check back soon or{" "}
            <Link href="/preferences" className="text-primary hover:underline">
              update your preferences
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-3">
            {recommendedListings
              .slice(0, 5)
              .map(
                (listing: {
                  id: string;
                  title: string;
                  askPricePerSqFt: number;
                  materialType?: string;
                  totalSqFt?: number;
                }) => (
                  <Link
                    key={listing.id}
                    href={`/listings/${listing.id}`}
                    className="flex items-center justify-between py-2 hover:bg-muted/30 rounded px-2 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {listing.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {listing.materialType && (
                          <Badge variant="outline" className="text-xs">
                            {listing.materialType.replace("_", " ")}
                          </Badge>
                        )}
                        {listing.totalSqFt && (
                          <span className="text-xs text-muted-foreground">
                            {listing.totalSqFt.toLocaleString()} sqft
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-medium text-primary shrink-0 ml-2">
                      ${listing.askPricePerSqFt}/sqft
                    </span>
                  </Link>
                )
              )}
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="rounded-2xl bg-gradient-to-br from-primary to-secondary p-8 text-center text-white relative overflow-hidden">
        <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-white/5 blur-3xl" />
        <h3 className="text-xl font-display font-semibold mb-2">Find Your Next Deal</h3>
        <p className="text-white/80 mb-4">Browse liquidation flooring lots at wholesale prices</p>
        <Link href="/listings">
          <Button size="lg" className="bg-gradient-to-b from-amber-400 to-amber-500 text-amber-950 shadow-md hover:shadow-lg hover:brightness-110">
            Browse Listings <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
