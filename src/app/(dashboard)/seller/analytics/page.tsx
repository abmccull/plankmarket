"use client";

import { trpc } from "@/lib/trpc/client";
import { StatsCard } from "@/components/dashboard/stats-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { BarChart3, Eye, Package, DollarSign, Loader2 } from "lucide-react";

export default function SellerAnalyticsPage() {
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

  const totalListings =
    listingStats?.reduce((sum, s) => sum + s.count, 0) ?? 0;
  const totalViews =
    listingStats?.reduce((sum, s) => sum + s.totalViews, 0) ?? 0;
  const totalOrders =
    orderStats?.reduce((sum, s) => sum + s.count, 0) ?? 0;
  const totalRevenue =
    orderStats?.reduce((sum, s) => sum + s.totalRevenue, 0) ?? 0;
  const deliveredRevenue =
    orderStats?.find((s) => s.status === "delivered")?.totalRevenue ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Track your performance and revenue
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Listings"
          value={formatNumber(totalListings)}
          icon={Package}
        />
        <StatsCard
          title="Total Views"
          value={formatNumber(totalViews)}
          icon={Eye}
        />
        <StatsCard
          title="Total Orders"
          value={formatNumber(totalOrders)}
          icon={BarChart3}
        />
        <StatsCard
          title="Total Revenue"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Listings by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {listingStats?.map((stat) => (
                <div
                  key={stat.status}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        stat.status === "active"
                          ? "bg-emerald-500"
                          : stat.status === "sold"
                            ? "bg-primary"
                            : stat.status === "expired"
                              ? "bg-amber-500"
                              : "bg-muted-foreground"
                      }`}
                    />
                    <span className="text-sm capitalize">{stat.status}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium">{stat.count}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({formatNumber(stat.totalViews)} views)
                    </span>
                  </div>
                </div>
              )) ?? (
                <p className="text-sm text-muted-foreground">No data yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {orderStats?.map((stat) => (
                <div
                  key={stat.status}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        stat.status === "delivered"
                          ? "bg-emerald-500"
                          : stat.status === "shipped"
                            ? "bg-blue-500"
                            : stat.status === "cancelled"
                              ? "bg-red-500"
                              : "bg-amber-500"
                      }`}
                    />
                    <span className="text-sm capitalize">{stat.status}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium">
                      {formatCurrency(stat.totalRevenue)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({stat.count} orders)
                    </span>
                  </div>
                </div>
              )) ?? (
                <p className="text-sm text-muted-foreground">No data yet</p>
              )}
            </div>

            {totalRevenue > 0 && (
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Completed Revenue</span>
                  <span className="font-bold text-primary">
                    {formatCurrency(deliveredRevenue)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
