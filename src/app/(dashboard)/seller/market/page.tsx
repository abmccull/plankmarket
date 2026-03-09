"use client";

import { trpc } from "@/lib/trpc/client";
import { ProGate } from "@/components/pro-gate";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { FileText, ShoppingCart, Flame } from "lucide-react";

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

export default function MarketIntelligencePage() {
  return (
    <ProGate feature="Market Intelligence">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Market Intelligence</h1>
          <p className="text-muted-foreground mt-1">
            Insights across your material categories
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
  const { data, isLoading } = trpc.marketIntelligence.getOverview.useQuery();

  if (isLoading) return <SectionSkeleton />;
  if (!data || data.materials.length === 0) {
    return (
      <section>
        <h2 className="text-xl font-semibold mb-4">Price Benchmarks</h2>
        <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
          No active listings yet. Create listings to see pricing benchmarks.
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xl font-semibold mb-4">Price Benchmarks</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.materials.map((m) => (
          <div
            key={m.materialType}
            className="rounded-xl border bg-card p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">
                {formatMaterialType(m.materialType)}
              </h3>
              <span className="text-xs text-muted-foreground">
                {m.activeListings} active
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Market Avg</p>
                <p className="text-lg font-bold">
                  {formatCurrency(m.marketAvgPrice)}
                  <span className="text-xs font-normal text-muted-foreground">
                    /sqft
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Your Avg</p>
                <p className="text-lg font-bold">
                  {formatCurrency(m.sellerAvgPrice)}
                  <span className="text-xs font-normal text-muted-foreground">
                    /sqft
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
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
                {m.priceDiffPercent}% vs market
              </span>
              <span className="text-xs text-muted-foreground">
                +{m.newLast30d} new (30d)
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
  const { data, isLoading } =
    trpc.marketIntelligence.getDemandSignals.useQuery();

  if (isLoading) return <SectionSkeleton />;
  if (!data || data.signals.length === 0) {
    return (
      <section>
        <h2 className="text-xl font-semibold mb-4">Demand Signals</h2>
        <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
          No active listings yet. Create listings to see demand signals.
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xl font-semibold mb-4">Demand Signals</h2>
      {(data.totalAlertedSearches ?? 0) > 0 && (
        <p className="text-sm text-muted-foreground mb-4">
          {formatNumber(data.totalAlertedSearches ?? 0)} buyers have active
          search alerts across the platform
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.signals.map((s) => (
          <div
            key={s.materialType}
            className="rounded-xl border bg-card p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">
                {formatMaterialType(s.materialType)}
              </h3>
              <DemandBadge level={s.demandLevel} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Buyer Requests</p>
                  <p className="text-sm font-semibold">{s.buyerRequests}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    Offers (30d)
                  </p>
                  <p className="text-sm font-semibold">{s.recentOffers}</p>
                </div>
              </div>
            </div>

            {s.avgOfferToAskPercent > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Avg offer-to-ask ratio
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
  const { data, isLoading } = trpc.marketIntelligence.getTrending.useQuery();

  if (isLoading) return <SectionSkeleton />;
  if (!data || data.trending.length === 0) {
    return (
      <section>
        <h2 className="text-xl font-semibold mb-4">Trending Categories</h2>
        <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
          Not enough data to show trending categories yet.
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xl font-semibold mb-4">Trending Categories</h2>
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                Material Type
              </th>
              <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">
                New Listings (30d)
              </th>
              <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">
                Offers (30d)
              </th>
              <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">
                Views (30d)
              </th>
            </tr>
          </thead>
          <tbody>
            {data.trending.map((t, idx) => (
              <tr key={t.materialType} className="border-b last:border-b-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {idx < 3 && (
                      <Flame className="h-4 w-4 text-orange-500" />
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
