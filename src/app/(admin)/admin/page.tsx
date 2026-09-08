"use client";
import { trpc } from "@/lib/trpc/client";
import { StatsOverview } from "@/components/admin/stats-overview";
import { MarketplaceHealthPanel } from "@/components/admin/marketplace-health-panel";
import { QueryErrorState, StatePanelLoading } from "@/components/ui/state-panel";
export default function AdminDashboardPage() {
  const stats = trpc.admin.getStats.useQuery();
  const health = trpc.admin.getMarketplaceHealth.useQuery();
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold">Admin Dashboard</h1><p className="text-muted-foreground mt-1">Platform overview and management</p></div>
    {stats.isLoading ? <StatePanelLoading label="Loading platform totals" /> : stats.isError || !stats.data ?
      <QueryErrorState title="Platform totals unavailable" description="Other sections remain available. Retry to load the current totals." onRetry={() => void stats.refetch()} isRetrying={stats.isFetching} /> :
      <StatsOverview totalUsers={stats.data.users.total} activeListings={stats.data.listings.active} totalOrders={stats.data.orders.total} grossMerchandiseValue={stats.data.gmv.total} pendingVerifications={stats.data.users.pendingVerifications} />}
    {health.isLoading ? <StatePanelLoading label="Loading marketplace health" /> : health.isError || !health.data ?
      <QueryErrorState title="Marketplace health unavailable" description="Platform totals remain available. Retry to load the operating cohort." onRetry={() => void health.refetch()} isRetrying={health.isFetching} /> :
      <MarketplaceHealthPanel health={health.data} />}
  </div>;
}
