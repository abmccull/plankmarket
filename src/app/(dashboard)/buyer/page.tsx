"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { StatsCard } from "@/components/dashboard/stats-card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { OnboardingTip } from "@/components/ui/onboarding-tip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  QueryErrorState,
  StatePanel,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { ProBadge } from "@/components/pro-badge";
import { useProStatus } from "@/hooks/use-pro-status";
import {
  ShoppingCart,
  Heart,
  Search,
  ArrowRight,
  FileText,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

function TrendingSection() {
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.listing.getTrending.useQuery();

  if (isLoading) {
    return <StatePanelLoading label="Loading trending listings" rows={2} />;
  }

  if (isError || !data) {
    return (
      <QueryErrorState
        title="We couldn't load trending listings"
        description="Popular lots are temporarily unavailable. Browse the full marketplace or try loading this section again."
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        secondaryAction={{ label: "Browse listings", href: "/listings" }}
      />
    );
  }

  if (data.length === 0) {
    return (
      <StatePanel
        icon={Search}
        title="No trending lots yet"
        description="Fresh marketplace activity will appear here as more lots attract buyer attention."
        tone="info"
        primaryAction={{ label: "Browse listings", href: "/listings" }}
      />
    );
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Popular on PlankMarket</h3>
        <Link href="/listings?sort=popularity">
          <Button variant="ghost" size="sm">
            View all <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
          </Button>
        </Link>
      </div>
      <div className="space-y-3">
        {data.map((listing) => (
          <Link
            key={listing.id}
            href={`/listings/${listing.id}`}
            className="flex items-center justify-between py-2 hover:bg-muted/30 rounded px-2 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{listing.title}</p>
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
        ))}
      </div>
    </div>
  );
}

export default function BuyerDashboardPage() {
  const { isPro } = useProStatus();
  const ordersQuery =
    trpc.order.getMyOrders.useQuery({ page: 1, limit: 5 });
  const watchlistQuery =
    trpc.watchlist.getMyWatchlist.useQuery({ page: 1, limit: 5 });
  const savedSearchesQuery =
    trpc.search.getMySavedSearches.useQuery();
  const recommendedQuery =
    trpc.matching.recommendedListings.useQuery();
  const requestsQuery =
    trpc.buyerRequest.getMyRequests.useQuery({ page: 1, limit: 50 });

  const isPrimaryLoading =
    ordersQuery.isLoading ||
    watchlistQuery.isLoading ||
    savedSearchesQuery.isLoading;
  const hasPrimaryError =
    !isPrimaryLoading &&
    (ordersQuery.isError ||
      !ordersQuery.data ||
      watchlistQuery.isError ||
      !watchlistQuery.data ||
      savedSearchesQuery.isError ||
      !savedSearchesQuery.data);

  const orders = ordersQuery.data;
  const watchlist = watchlistQuery.data;
  const savedSearches = savedSearchesQuery.data;
  const recommendedData = recommendedQuery.data;
  const myRequestsData = requestsQuery.data;

  const recommendedListings = recommendedData?.items ?? [];
  const prefsIncomplete = recommendedData?.prefsIncomplete ?? false;
  const openRequestsCount =
    myRequestsData?.items?.filter(
      (r: { status: string }) => r.status === "open"
    ).length ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display">Buyer Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Track your orders, watchlist, and saved searches
        </p>
      </div>

      <OnboardingTip id="buyer-welcome">
        Welcome to PlankMarket! Start by browsing listings or setting your preferences to see personalized deals.
      </OnboardingTip>

      <OnboardingChecklist variant="buyer" />

      {!isPro && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/30 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Sparkles className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <p className="text-sm">
              Unlock unlimited saved searches, AI monitoring, and automated buyer workflows with{" "}
              <span className="font-semibold">PlankMarket Pro</span>{" "}
              <ProBadge className="align-middle" />
            </p>
          </div>
          <Link href="/pro" className="shrink-0">
            <Button size="sm" variant="gold">
              Explore Pro
            </Button>
          </Link>
        </div>
      )}

      {isPrimaryLoading ? (
        <StatePanelLoading label="Loading your dashboard" rows={4} />
      ) : hasPrimaryError ? (
        <QueryErrorState
          title="We couldn't load your dashboard"
          description="Orders, watchlist items, and saved searches are unchanged. Check your connection and try loading the dashboard again."
          onRetry={() =>
            void Promise.all([
              ordersQuery.refetch(),
              watchlistQuery.refetch(),
              savedSearchesQuery.refetch(),
            ])
          }
          isRetrying={
            ordersQuery.isFetching ||
            watchlistQuery.isFetching ||
            savedSearchesQuery.isFetching
          }
          secondaryAction={{ label: "Browse listings", href: "/listings" }}
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatsCard
              title="Total Orders"
              value={orders!.total}
              icon={ShoppingCart}
            />
            <StatsCard
              title="Watchlist Items"
              value={watchlist!.total}
              icon={Heart}
            />
            <StatsCard
              title="Saved Searches"
              value={savedSearches!.length}
              icon={Search}
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border bg-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">Recent Orders</h3>
                <Link href="/buyer/orders">
                  <Button variant="ghost" size="sm">
                    View all <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </div>
              {orders!.items.length === 0 ? (
                <StatePanel
                  icon={ShoppingCart}
                  title="No orders yet"
                  description="Browse listings to find your next deal."
                  primaryAction={{ label: "Browse listings", href: "/listings" }}
                  className="min-h-0 px-4 py-8"
                />
              ) : (
                <div className="space-y-3">
                  {orders!.items.map((order) => (
                    <Link
                      key={order.id}
                      href={`/buyer/orders/${order.id}`}
                      className="flex items-center justify-between rounded px-2 py-2 transition-colors hover:bg-muted/30"
                    >
                      <div>
                        <p className="text-sm font-medium">{order.orderNumber}</p>
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

            <div className="rounded-xl border bg-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">Watchlist</h3>
                <Link href="/buyer/watchlist">
                  <Button variant="ghost" size="sm">
                    View all <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </div>
              {watchlist!.items.length === 0 ? (
                <StatePanel
                  icon={Heart}
                  title="No watchlist items"
                  description="Save listings you want to revisit and compare."
                  primaryAction={{ label: "Browse listings", href: "/listings" }}
                  className="min-h-0 px-4 py-8"
                />
              ) : (
                <div className="space-y-3">
                  {watchlist!.items.map((item) => (
                    <Link
                      key={item.id}
                      href={`/listings/${item.listing.id}`}
                      className="flex items-center justify-between rounded px-2 py-2 transition-colors hover:bg-muted/30"
                    >
                      <p className="truncate text-sm font-medium">
                        {item.listing.title}
                      </p>
                      <span className="shrink-0 text-sm text-primary">
                        ${item.listing.askPricePerSqFt}/sf
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
                <h3 className="font-semibold">Your Open Requests</h3>
              </div>
              <Link href="/buyer/requests">
                <Button variant="ghost" size="sm">
                  View all{" "}
                  <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
                </Button>
              </Link>
            </div>
            {requestsQuery.isLoading ? (
              <StatePanelLoading label="Loading your open requests" rows={1} />
            ) : requestsQuery.isError || !myRequestsData ? (
              <QueryErrorState
                title="We couldn't load your open requests"
                description="Your request history is unchanged. Try loading this section again or open the request board directly."
                onRetry={() => void requestsQuery.refetch()}
                isRetrying={requestsQuery.isFetching}
                secondaryAction={{ label: "Open request board", href: "/buyer/requests" }}
              />
            ) : openRequestsCount === 0 ? (
              <StatePanel
                icon={FileText}
                title="No open requests"
                description="Post a request to let sellers bring matching inventory to you."
                primaryAction={{ label: "Post a request", href: "/buyer/requests/new" }}
                secondaryAction={{ label: "Browse requests", href: "/buyer/requests" }}
                className="min-h-0 px-4 py-8"
              />
            ) : (
              <p className="text-sm">
                You have <span className="font-semibold">{openRequestsCount}</span>{" "}
                open {openRequestsCount === 1 ? "request" : "requests"} awaiting
                seller responses.
              </p>
            )}
          </div>

          <div className="rounded-xl border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Recommended Listings</h3>
              <Link href="/listings">
                <Button variant="ghost" size="sm">
                  Browse all{" "}
                  <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
                </Button>
              </Link>
            </div>
            {recommendedQuery.isLoading ? (
              <StatePanelLoading label="Loading recommended listings" rows={2} />
            ) : recommendedQuery.isError || !recommendedData ? (
              <QueryErrorState
                title="We couldn't load recommendations"
                description="Your dashboard is still available. Browse the marketplace directly or try loading recommendations again."
                onRetry={() => void recommendedQuery.refetch()}
                isRetrying={recommendedQuery.isFetching}
                secondaryAction={{ label: "Browse listings", href: "/listings" }}
              />
            ) : prefsIncomplete ? (
              <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-4">
                <SlidersHorizontal
                  className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium">Set up your preferences</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
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
              <StatePanel
                icon={Search}
                title="No matching listings right now"
                description="Check back soon or update your buying preferences to widen the match."
                primaryAction={{ label: "Update preferences", href: "/preferences" }}
                secondaryAction={{ label: "Browse listings", href: "/listings" }}
                className="min-h-0 px-4 py-8"
              />
            ) : (
              <div className="space-y-3">
                {recommendedListings.slice(0, 5).map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/listings/${listing.id}`}
                    className="flex items-center justify-between rounded px-2 py-2 transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {listing.title}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        {listing.materialType ? (
                          <Badge variant="outline" className="text-xs">
                            {listing.materialType.replace("_", " ")}
                          </Badge>
                        ) : null}
                        {listing.totalSqFt ? (
                          <span className="text-xs text-muted-foreground">
                            {listing.totalSqFt.toLocaleString()} sqft
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className="ml-2 shrink-0 text-sm font-medium text-primary">
                      ${listing.askPricePerSqFt}/sqft
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {(recommendedListings.length === 0 || prefsIncomplete) && (
            <TrendingSection />
          )}
        </>
      )}

      {/* CTA */}
      <div className="rounded-2xl bg-gradient-to-br from-primary to-secondary p-8 text-center text-white relative overflow-hidden">
        <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-white/5 blur-3xl" />
        <h3 className="text-xl font-display font-semibold mb-2">Find Your Next Deal</h3>
        <p className="text-white/80 mb-4">Browse liquidation flooring lots at wholesale prices</p>
        <Link href="/listings">
          <Button size="lg" variant="gold">
            Browse Listings <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
