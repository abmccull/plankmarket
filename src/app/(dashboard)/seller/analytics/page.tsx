"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { StatsCard } from "@/components/dashboard/stats-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PromotionBadge } from "@/components/promotions/promotion-badge";
import { BoostModal } from "@/components/promotions/boost-modal";
import { formatCurrency, formatNumber, formatRelativeTime } from "@/lib/utils";
import { BarChart3, Eye, Package, DollarSign, Loader2, Rocket, Clock, XCircle } from "lucide-react";
import type { PromotionTier } from "@/types";

export default function SellerAnalyticsPage() {
  const { data: listingStats, isLoading: listingsLoading } =
    trpc.listing.getSellerStats.useQuery();
  const { data: orderStats, isLoading: ordersLoading } =
    trpc.order.getSellerOrderStats.useQuery();
  const { data: promotions, isLoading: promotionsLoading } =
    trpc.promotion.getMyPromotions.useQuery({ page: 1, limit: 10 });

  const utils = trpc.useUtils();
  const cancelMutation = trpc.promotion.cancel.useMutation({
    onSuccess: () => {
      utils.promotion.getMyPromotions.invalidate();
    },
  });

  const now = Date.now();
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

      {/* Promotions Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Active Promotions
            </CardTitle>
            {promotions && (
              <span className="text-sm text-muted-foreground">
                {promotions.items.filter(
                  (p) =>
                    p.isActive && new Date(p.expiresAt) > new Date()
                ).length}{" "}
                active
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {promotionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !promotions || promotions.items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Rocket className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No promotions yet</p>
              <p className="text-xs mt-1">
                Boost your active listings to get more views
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {promotions.items.map((promo) => {
                const isActive =
                  promo.isActive &&
                  new Date(promo.expiresAt) > new Date();
                const remainingMs =
                  new Date(promo.expiresAt).getTime() - now;
                const remainingDays = Math.max(
                  0,
                  Math.ceil(remainingMs / (1000 * 60 * 60 * 24))
                );

                return (
                  <div
                    key={promo.id}
                    className="flex items-center gap-4 rounded-lg border p-3"
                  >
                    {/* Thumbnail */}
                    <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
                      {promo.listing.media?.[0] ? (
                        <img
                          src={promo.listing.media[0].url}
                          alt={promo.listing.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {promo.listing.title}
                        </span>
                        <PromotionBadge
                          tier={promo.tier as PromotionTier}
                        />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{formatCurrency(promo.pricePaid)} paid</span>
                        <span>
                          {promo.durationDays} day
                          {promo.durationDays !== 1 ? "s" : ""}
                        </span>
                        {isActive && (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <Clock className="h-3 w-3" />
                            {remainingDays}d remaining
                          </span>
                        )}
                        {!isActive && promo.cancelledAt && (
                          <span className="text-red-500">Cancelled</span>
                        )}
                        {!isActive && !promo.cancelledAt && (
                          <span className="text-muted-foreground">
                            Expired
                          </span>
                        )}
                        <span>
                          <Eye className="inline h-3 w-3 mr-0.5" />
                          {promo.listing.viewsCount}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    {isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive shrink-0"
                        onClick={() =>
                          cancelMutation.mutate({
                            promotionId: promo.id,
                          })
                        }
                        disabled={cancelMutation.isPending}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
