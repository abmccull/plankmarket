"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { BuyerOrderWork } from "@/components/dashboard/dashboard-order-work";
import { DashboardReadMetric } from "@/components/dashboard/dashboard-read-metric";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  QueryErrorState,
  StatePanel,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import {
  ShoppingCart,
  Heart,
  Search,
  ArrowRight,
  FileText,
  SlidersHorizontal,
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
        description="Popular lots are temporarily unavailable. Try loading this section again."
        onRetry={() => void refetch()}
        isRetrying={isFetching}
      />
    );
  }

  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card px-[min(1.5rem,24px)] py-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Popular on PlankMarket</h3>
        <Button asChild variant="ghost" size="sm"><Link href="/listings?sort=popularity">
            View all <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
          </Link></Button>
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
  const ordersQuery = trpc.order.getMyOrders.useQuery({ page: 1, limit: 5 });
  const watchlistQuery = trpc.watchlist.getMyWatchlist.useQuery({
    page: 1,
    limit: 5,
  });
  const savedSearchesQuery = trpc.search.getMySavedSearches.useQuery();
  const recommendedQuery = trpc.matching.recommendedListings.useQuery();
  const requestsQuery = trpc.buyerRequest.getMyRequests.useQuery({
    page: 1,
    limit: 50,
  });

  const orders = ordersQuery.data;
  const watchlist = watchlistQuery.data;
  const savedSearches = savedSearchesQuery.data;
  const recommendedData = recommendedQuery.data;
  const myRequestsData = requestsQuery.data;

  const recommendedListings = recommendedData?.items ?? [];
  const prefsIncomplete = recommendedData?.prefsIncomplete ?? false;
  const openRequestsCount = myRequestsData?.openCount ?? 0;

  return (
    <section aria-label="Buyer dashboard" className="min-w-0 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
        <h1 className="text-3xl font-display">Buyer Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Track your orders, watchlist, and saved searches
        </p>
        </div>
        <Button asChild className="min-h-11"><Link href="/listings">Browse listings <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link></Button>
      </div>

      <BuyerOrderWork />

      <OnboardingChecklist variant="buyer" defaultCollapsed />

      <div className="grid gap-4 md:grid-cols-3">
        <DashboardReadMetric title="Total Orders" value={orders?.total} icon={ShoppingCart} isLoading={ordersQuery.isLoading} isError={ordersQuery.isError} isRetrying={ordersQuery.isFetching} onRetry={() => void ordersQuery.refetch()} />
        <DashboardReadMetric title="Watchlist Items" value={watchlist?.total} icon={Heart} isLoading={watchlistQuery.isLoading} isError={watchlistQuery.isError} isRetrying={watchlistQuery.isFetching} onRetry={() => void watchlistQuery.refetch()} />
        <DashboardReadMetric title="Saved Searches" value={savedSearches?.length} icon={Search} isLoading={savedSearchesQuery.isLoading} isError={savedSearchesQuery.isError} isRetrying={savedSearchesQuery.isFetching} onRetry={() => void savedSearchesQuery.refetch()} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-label="Recent Orders" className="rounded-xl border bg-card px-[min(1.5rem,24px)] py-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Recent Orders</h3>
            <Button asChild variant="ghost" size="sm"><Link href="/buyer/orders">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Link></Button>
          </div>
          {ordersQuery.isLoading ? (
            <StatePanelLoading label="Loading recent orders" rows={2} />
          ) : ordersQuery.isError || !orders ? (
            <QueryErrorState title="We couldn't load recent orders" description="Your order history is unchanged. Try loading this section again." onRetry={() => void ordersQuery.refetch()} isRetrying={ordersQuery.isFetching} className="min-h-0 px-[min(1rem,16px)] py-6" />
          ) : orders.items.length === 0 ? (
            <div className="space-y-1 py-6 text-sm"><p className="font-medium">No orders yet</p><p className="text-muted-foreground">Your purchases and their current status will appear here.</p></div>
          ) : (
            <div className="space-y-3">
              {orders.items.map((order) => (
                <Link
                  key={order.id}
                  href={`/buyer/orders/${order.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded px-2 py-2 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-sm font-medium">
                      {order.orderNumber}
                    </p>
                    <p className="line-clamp-2 break-words text-xs text-muted-foreground">
                      {order.listing.title}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium capitalize">
                    {order.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section aria-label="Watchlist" className="rounded-xl border bg-card px-[min(1.5rem,24px)] py-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Watchlist</h3>
            <Button asChild variant="ghost" size="sm"><Link href="/buyer/watchlist">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Link></Button>
          </div>
          {watchlistQuery.isLoading ? (
            <StatePanelLoading label="Loading your watchlist" rows={2} />
          ) : watchlistQuery.isError || !watchlist ? (
            <QueryErrorState title="We couldn't load your watchlist" description="Your saved listings are unchanged. Try loading this section again." onRetry={() => void watchlistQuery.refetch()} isRetrying={watchlistQuery.isFetching} className="min-h-0 px-[min(1rem,16px)] py-6" />
          ) : watchlist.items.length === 0 ? (
            <div className="space-y-1 py-6 text-sm"><p className="font-medium">No watchlist items</p><p className="text-muted-foreground">Save a listing to revisit it here.</p></div>
          ) : (
            <div className="space-y-3">
              {watchlist.items.map((item) => (
                <Link
                  key={item.id}
                  href={`/listings/${item.listing.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded px-2 py-2 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p className="min-w-0 truncate text-sm font-medium">
                    {item.listing.title}
                  </p>
                  <span className="shrink-0 text-sm text-primary">
                    ${item.listing.askPricePerSqFt}/sf
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section aria-label="Your Open Requests" className="rounded-xl border bg-card px-[min(1.5rem,24px)] py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText
              className="h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
            <h3 className="font-semibold">Your Open Requests</h3>
          </div>
          <Button asChild variant="ghost" size="sm"><Link href="/buyer/requests">
              View all{" "}
              <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
            </Link></Button>
        </div>
        {requestsQuery.isLoading ? (
          <StatePanelLoading label="Loading your open requests" rows={1} />
        ) : requestsQuery.isError || !myRequestsData ? (
          <QueryErrorState
            title="We couldn't load your open requests"
            description="Your request history is unchanged. Try loading this section again or open the request board directly."
            onRetry={() => void requestsQuery.refetch()}
            isRetrying={requestsQuery.isFetching}
            secondaryAction={{
              label: "Open request board",
              href: "/buyer/requests",
            }}
          />
        ) : openRequestsCount === 0 ? (
          <div className="space-y-2 py-2 text-sm"><p className="text-muted-foreground">No open requests. Tell sellers what you need.</p><Link href="/buyer/requests/new" className="inline-flex min-h-11 items-center rounded-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Post a request</Link></div>
        ) : (
          <p className="text-sm">
            You have{" "}
            <span className="font-semibold">{openRequestsCount}</span> open{" "}
            {openRequestsCount === 1 ? "request" : "requests"}.
          </p>
        )}
      </section>

      <section aria-label="Recommended Listings" className="rounded-xl border bg-card px-[min(1.5rem,24px)] py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Recommended Listings</h3>

        </div>
        {recommendedQuery.isLoading ? (
          <StatePanelLoading
            label="Loading recommended listings"
            rows={2}
          />
        ) : recommendedQuery.isError || !recommendedData ? (
          <QueryErrorState
            title="We couldn't load recommendations"
            description="Try loading recommendations again. Your orders and other dashboard sections remain available."
            onRetry={() => void recommendedQuery.refetch()}
            isRetrying={recommendedQuery.isFetching}
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
              <Button asChild size="sm" variant="outline"><Link href="/preferences" className="mt-2 inline-block">
                  Complete Preferences
                </Link></Button>
            </div>
          </div>
        ) : recommendedData.limitation === "location_unverified" ? (
          <StatePanel
            icon={Search}
            title="Add a valid ZIP for nearby matches"
            description="We need a recognized ZIP code to match inventory within your preferred distance."
            primaryAction={{
              label: "Update preferences",
              href: "/preferences",
            }}
            className="min-h-0 px-[min(1rem,16px)] py-8"
          />
        ) : recommendedData.limitation === "waterproof_unverified" ? (
          <StatePanel
            icon={Search}
            title="Waterproof performance needs confirmation"
            description="Your waterproof requirement is saved. We cannot yet verify it from listing specifications, so we are not recommending unconfirmed matches. Ask the seller for the manufacturer's specification and warranty before buying."
            primaryAction={{ label: "Browse listings", href: "/listings" }}
            className="min-h-0 px-[min(1rem,16px)] py-8"
          />
        ) : recommendedListings.length === 0 ? (
          <StatePanel
            icon={Search}
            title="No matching listings right now"
            description="Check back soon or update your buying preferences to widen the match."
            primaryAction={{
              label: "Update preferences",
              href: "/preferences",
            }}
            className="min-h-0 px-[min(1rem,16px)] py-8"
          />
        ) : (
          <div className="space-y-3">
            {recommendedListings.slice(0, 5).map((listing) => (
              <Link
                key={listing.id}
                href={`/listings/${listing.id}`}
                className="flex min-h-11 items-center justify-between gap-3 rounded px-2 py-2 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="min-w-0 flex-1">
                  <p className="min-w-0 truncate text-sm font-medium">
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
      </section>

      {!recommendedQuery.isLoading && !recommendedQuery.isError && recommendedData && (recommendedListings.length === 0 || prefsIncomplete) && (
        <TrendingSection />
      )}

      <p className="text-sm text-muted-foreground">Need more saved searches? <Link href="/pro" className="font-medium text-primary underline underline-offset-4">Compare Pro features</Link></p>

    </section>
  );
}
