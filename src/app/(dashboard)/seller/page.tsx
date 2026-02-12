"use client";

import { StatsCard } from "@/components/dashboard/stats-card";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  Package,
  Eye,
  DollarSign,
  ShoppingCart,
  Loader2,
} from "lucide-react";

export default function SellerDashboardPage() {
  const { data: listingStats, isLoading: listingsLoading } =
    trpc.listing.getSellerStats.useQuery();
  const { data: orderStats, isLoading: ordersLoading } =
    trpc.order.getSellerOrderStats.useQuery();

  const isLoading = listingsLoading || ordersLoading;

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
        <h1 className="text-3xl font-bold">Seller Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your listings, orders, and performance
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Listings"
          value={formatNumber(activeListings)}
          icon={Package}
        />
        <StatsCard
          title="Total Views"
          value={formatNumber(totalViews)}
          icon={Eye}
        />
        <StatsCard
          title="Total Revenue"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
        />
        <StatsCard
          title="Pending Orders"
          value={formatNumber(pendingOrders)}
          icon={ShoppingCart}
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
    </div>
  );
}
