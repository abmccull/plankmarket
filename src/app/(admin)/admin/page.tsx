"use client";

import { trpc } from "@/lib/trpc/client";
import { StatsOverview } from "@/components/admin/stats-overview";
import { Loader2 } from "lucide-react";

export default function AdminDashboardPage() {
  const { data: stats, isLoading } = trpc.admin.getStats.useQuery();

  if (isLoading) {
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
        revenue={stats.revenue.total}
        pendingVerifications={0}
      />
    </div>
  );
}
