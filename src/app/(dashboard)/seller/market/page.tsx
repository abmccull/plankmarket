"use client";

import { trpc } from "@/lib/trpc/client";
import { ProGate } from "@/components/pro-gate";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Bell, FileText, ShoppingCart, Flame } from "lucide-react";

function formatMaterialType(mt: string) {
  return mt
    .replace(/_/g, " ")
    .replace(/\blvp\b/i, "LVP")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function SectionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[180px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function ReadFailure({
  title,
  retrying,
  onRetry,
}: {
  title: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="space-y-3 rounded-xl border bg-card p-5">
      <p className="font-medium">{title} unavailable</p>
      <p className="text-sm text-muted-foreground">
        We could not load current figures. Try this section again.
      </p>
      <Button
        variant="outline"
        className="h-auto min-h-11 whitespace-normal"
        disabled={retrying}
        onClick={onRetry}
        aria-label={`Retry ${title.toLowerCase()}`}
      >
        {retrying ? "Retrying…" : "Try again"}
      </Button>
    </div>
  );
}

export default function MarketIntelligencePage() {
  return (
    <ProGate feature="Market Intelligence">
      <div className="min-w-0 space-y-8 [overflow-wrap:anywhere]">
        <div>
          <h1 className="text-3xl font-bold">Market Intelligence</h1>
          <p className="text-muted-foreground mt-1">
            Platform asking prices and activity across material categories
          </p>
        </div>

        <PriceBenchmarks />
        <DemandSignals />
        <TrendingCategories />
      </div>
    </ProGate>
  );
}

/* ─── Section 1: Price Benchmarks ─── */
function PriceBenchmarks() {
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.marketIntelligence.getOverview.useQuery();

  if (isLoading) return <SectionSkeleton />;
  if (isError || !data)
    return (
      <section aria-label="Asking-price comparisons">
        <h2 className="text-xl font-semibold mb-4">Asking-price comparisons</h2>
        <ReadFailure
          title="Asking-price comparisons"
          retrying={isFetching}
          onRetry={() => {
            void refetch();
          }}
        />
      </section>
    );
  if (data.materials.length === 0) {
    return (
      <section aria-label="Asking-price comparisons">
        <h2 className="text-xl font-semibold mb-4">Asking-price comparisons</h2>
        <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
          No active listings yet. Create listings to compare asking prices in
          your material categories.
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Asking-price comparisons">
      <h2 className="text-xl font-semibold mb-4">Asking-price comparisons</h2>
      <p className="mb-2 text-sm text-muted-foreground">
        Active platform asking prices, not completed-sale prices. Comparisons
        are not matched by location, condition or lot size.
      </p>
      <details className="mb-4 text-sm text-muted-foreground">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-foreground">
          How asking-price comparisons work
        </summary>
        <p className="mb-4 text-sm text-muted-foreground">
          Current asking prices per square foot for active PlankMarket listings
          in your material categories. Each listing has equal weight; the
          platform average includes your listings. These are not completed-sale
          prices or comparisons matched by location, condition or lot size.
        </p>
      </details>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.materials.map((m) => (
          <div
            key={m.materialType}
            className="rounded-xl border bg-card p-5 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-sm">
                {formatMaterialType(m.materialType)}
              </h3>
              <span className="text-xs text-muted-foreground">
                {formatNumber(m.activeListings)} platform listings
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">
                  Platform average ask
                </p>
                <p className="text-lg font-bold">
                  {formatCurrency(m.marketAvgPrice)}
                  <span className="text-xs font-normal text-muted-foreground">
                    /sqft
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Your average ask
                </p>
                <p className="text-lg font-bold">
                  {formatCurrency(m.sellerAvgPrice)}
                  <span className="text-xs font-normal text-muted-foreground">
                    /sqft
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
              <span
                className={`text-sm font-medium ${
                  m.priceDiffPercent <= 0
                    ? "text-green-600"
                    : m.priceDiffPercent <= 10
                      ? "text-yellow-600"
                      : "text-red-600"
                }`}
              >
                {m.priceDiffPercent > 0 ? "+" : ""}
                {m.priceDiffPercent}% vs platform ask
              </span>
              <span className="text-xs text-muted-foreground">
                {formatNumber(m.sellerListings)} of yours ·{" "}
                {formatNumber(m.newLast30d)} added in 30 days
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Section 2: Demand Signals ─── */
function DemandSignals() {
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.marketIntelligence.getDemandSignals.useQuery();

  if (isLoading) return <SectionSkeleton />;
  if (isError || !data)
    return (
      <section aria-label="Demand signals">
        <h2 className="text-xl font-semibold mb-4">Demand Signals</h2>
        <ReadFailure
          title="Demand signals"
          retrying={isFetching}
          onRetry={() => {
            void refetch();
          }}
        />
      </section>
    );
  if (data.signals.length === 0) {
    return (
      <section aria-label="Demand signals">
        <h2 className="text-xl font-semibold mb-4">Demand Signals</h2>
        <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
          No active listings yet. Create listings to see demand signals.
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Demand signals">
      <h2 className="text-xl font-semibold mb-4">Demand Signals</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Activity in your material categories; offers include all statuses, not
        completed sales.
      </p>
      <details className="mb-4 text-sm text-muted-foreground">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-foreground">
          How demand levels are calculated
        </summary>
        <p className="mb-4 text-sm text-muted-foreground">
          Platform activity in your active material categories: alert-enabled
          buyer saved searches with overlapping material filters, open buyer
          requests, and offers created in the last 30 days across all offer
          statuses. Broad saved searches can count in several categories; their
          other filters are not checked here.
        </p>
        <p>
          Score = 2 × open buyer requests + offers in 30 days. High: 10 or more;
          Medium: 3–9; Low: below 3. Saved-search counts do not affect the
          score. Offer-to-ask compares submitted offer prices with each
          listing’s current asking price; it does not measure completed sales.
        </p>
      </details>
      {(data.matchingAlertedSearches ?? 0) > 0 && (
        <p className="text-sm text-muted-foreground mb-4">
          {formatNumber(data.matchingAlertedSearches ?? 0)} distinct
          alert-enabled buyer saved{" "}
          {data.matchingAlertedSearches === 1
            ? "search overlaps"
            : "searches overlap"}{" "}
          your current material categories
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.signals.map((s) => (
          <div
            key={s.materialType}
            className="rounded-xl border bg-card p-5 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-sm">
                {formatMaterialType(s.materialType)}
              </h3>
              <DemandBadge level={s.demandLevel} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <Bell
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-xs text-muted-foreground">
                    Saved searches
                  </p>
                  <p className="text-sm font-semibold">
                    {s.matchingSavedSearches}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <FileText
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-xs text-muted-foreground">Open requests</p>
                  <p className="text-sm font-semibold">{s.buyerRequests}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ShoppingCart
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-xs text-muted-foreground">Offers (30d)</p>
                  <p className="text-sm font-semibold">{s.recentOffers}</p>
                </div>
              </div>
            </div>

            {s.avgOfferToAskPercent > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Avg offer-to-current-ask ratio
                </p>
                <p className="text-sm font-semibold">
                  {s.avgOfferToAskPercent}%
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function DemandBadge({ level }: { level: "Low" | "Medium" | "High" }) {
  const colors = {
    Low: "bg-gray-100 text-gray-700",
    Medium: "bg-yellow-100 text-yellow-800",
    High: "bg-green-100 text-green-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[level]}`}
    >
      {level}
    </span>
  );
}

/* ─── Section 3: Trending Categories ─── */
function TrendingCategories() {
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.marketIntelligence.getTrending.useQuery();

  if (isLoading) return <SectionSkeleton />;
  if (isError || !data)
    return (
      <section aria-label="Trending categories">
        <h2 className="text-xl font-semibold mb-4">Trending Categories</h2>
        <ReadFailure
          title="Trending categories"
          retrying={isFetching}
          onRetry={() => {
            void refetch();
          }}
        />
      </section>
    );
  if (data.trending.length === 0) {
    return (
      <section aria-label="Trending categories">
        <h2 className="text-xl font-semibold mb-4">Trending Categories</h2>
        <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
          No active listings added in the last 30 days to rank yet.
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Trending categories">
      <h2 className="text-xl font-semibold mb-4">Trending Categories</h2>
      <p id="trending-cohort" className="mb-2 text-sm text-muted-foreground">
        Categories with new active listings in the last 30 days.
      </p>
      <details className="mb-4 text-sm text-muted-foreground">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-foreground">
          How category ranking works
        </summary>
        <p className="mb-4 text-sm text-muted-foreground">
          Up to 10 platform categories with active listings added in the last 30
          days. Views are the cumulative views of those new active listings.
          Offers include all statuses created in the last 30 days in each
          category, including offers on older listings. Ranking score = new
          active listings + offers + one point per 100 views.
        </p>
      </details>
      <p className="mb-2 text-xs text-muted-foreground">
        Scroll the table horizontally to see every metric on small screens.
      </p>
      <div
        role="region"
        aria-label="Trending category metrics"
        aria-describedby="trending-cohort"
        tabIndex={0}
        className="max-w-full overflow-x-auto rounded-xl border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <table className="w-full min-w-[36rem]">
          <thead>
            <tr className="border-b bg-muted/50">
              <th
                scope="col"
                className="text-left text-xs font-medium text-muted-foreground px-4 py-3"
              >
                Material Type
              </th>
              <th
                scope="col"
                className="text-right text-xs font-medium text-muted-foreground px-4 py-3"
              >
                New active listings (30d)
              </th>
              <th
                scope="col"
                className="text-right text-xs font-medium text-muted-foreground px-4 py-3"
              >
                Offers (30d)
              </th>
              <th
                scope="col"
                className="text-right text-xs font-medium text-muted-foreground px-4 py-3"
              >
                Views of new active listings
              </th>
            </tr>
          </thead>
          <tbody>
            {data.trending.map((t, idx) => (
              <tr key={t.materialType} className="border-b last:border-b-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {idx < 3 && (
                      <Flame
                        className="h-4 w-4 shrink-0 text-orange-500"
                        aria-hidden="true"
                      />
                    )}
                    <span className="text-sm font-medium">
                      {formatMaterialType(t.materialType)}
                    </span>
                  </div>
                </td>
                <td className="text-right px-4 py-3 text-sm">
                  {formatNumber(t.newListings)}
                </td>
                <td className="text-right px-4 py-3 text-sm">
                  {formatNumber(t.offers)}
                </td>
                <td className="text-right px-4 py-3 text-sm">
                  {formatNumber(t.views)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
