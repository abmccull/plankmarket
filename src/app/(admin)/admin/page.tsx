"use client";

import { trpc } from "@/lib/trpc/client";
import { StatsOverview } from "@/components/admin/stats-overview";
import { MarketplaceHealthPanel } from "@/components/admin/marketplace-health-panel";
import { Loader2 } from "lucide-react";

export default function AdminDashboardPage() {
  const { data: stats, isLoading } = trpc.admin.getStats.useQuery();
  const { data: marketplaceHealth, isLoading: isHealthLoading } =
    trpc.admin.getMarketplaceHealth.useQuery();

  if (isLoading || isHealthLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold">Unable to load stats</h1>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Platform overview and management
        </p>
      </div>

      <StatsOverview
        totalUsers={stats.users.total}
        activeListings={stats.listings.active}
        totalOrders={stats.orders.total}
        grossMerchandiseValue={stats.gmv.total}
        pendingVerifications={stats.users.pendingVerifications}
      />

      {marketplaceHealth ? (
        <MarketplaceHealthPanel health={marketplaceHealth} />
      ) : (
        <section aria-labelledby="marketplace-health-unavailable" className="rounded-lg border p-6">
          <h2 id="marketplace-health-unavailable" className="font-semibold">
            Marketplace health unavailable
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The core admin totals are available, but the 30-day operating cohort could not be loaded.
          </p>
        </section>
      )}
    </div>
  );
}
