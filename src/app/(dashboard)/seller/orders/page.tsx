"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useOrderHistoryFilters, OrderHistoryFilter, OrderHistoryPager, OrderHistoryFilteredEmpty } from "@/components/dashboard/order-history-controls";
import { trpc } from "@/lib/trpc/client";
import { OrderStatusBadge } from "@/components/dashboard/status-badge";
import {
  QueryErrorState,
  StatePanel,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { formatCurrency, formatSqFt, formatDate } from "@/lib/utils";
import { Package } from "lucide-react";
import type { OrderStatus } from "@/types";

function SellerOrdersContent() {
  const filters = useOrderHistoryFilters();
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.order.getSellerOrders.useQuery(filters.input);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Orders</h1>
        <p className="text-muted-foreground mt-1">
          Manage orders from your listings
        </p>
      </div>

      <OrderHistoryFilter status={filters.status} onChange={filters.setStatus} />
      <p className="text-sm text-muted-foreground">Seller proceeds reflect recorded refunds. Open an order for payment and transfer status; this amount does not confirm a bank payout.</p>

      {isLoading ? (
        <StatePanelLoading label="Loading seller orders" rows={4} />
      ) : isError || !data ? (
        <QueryErrorState
          title="We couldn't load your orders"
          description="No order status was changed. Check your connection and try loading the order queue again."
          onRetry={() => void refetch()}
          isRetrying={isFetching}
          secondaryAction={{ label: "View listings", href: "/seller/listings" }}
        />
      ) : data.items.length === 0 && (filters.status || filters.page > 1) ? (
        <OrderHistoryFilteredEmpty page={filters.page} status={filters.status} onFirstPage={() => filters.setPage(1)} onClear={() => filters.setStatus("")} />
      ) : data.items.length === 0 ? (
        <StatePanel
          icon={Package}
          title="No buyer orders yet"
          description="Orders will appear here as soon as buyers purchase your inventory. Keep listings accurate and ship-ready so buyers can move with confidence."
          primaryAction={{
            label: "Create a listing",
            href: "/seller/listings/new",
          }}
          secondaryAction={{
            label: "Manage listings",
            href: "/seller/listings",
          }}
        />
      ) : (
        <ul className="space-y-3" aria-label="Orders from buyers">
          {data.items.map((order) => (
            <li key={order.id}>
              <Link
                href={`/seller/orders/${order.id}`}
                className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-all font-mono text-sm text-muted-foreground">
                      {order.orderNumber}
                    </span>
                    <OrderStatusBadge status={order.status as OrderStatus} />
                  </div>
                  <h2 className="mt-1 line-clamp-2 break-words font-medium">
                    {order.listing.title}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatSqFt(order.quantitySqFt)}</span>
                    <span>Buyer: {order.buyer.name}</span>
                    <span>{formatDate(order.createdAt)}</span>
                  </div>
                </div>

                <div className="shrink-0 text-left sm:text-right">
                  <div className="font-semibold">
                    {formatCurrency(order.sellerPayout)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Seller proceeds
                  </div>
                  {order.sellerFreightContribution > 0 ? (
                    <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      {formatCurrency(order.sellerFreightContribution)} seller
                      shipping
                    </div>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!isLoading && !isError && data ? <OrderHistoryPager data={data} isFetching={isFetching} onPage={filters.setPage} /> : null}
    </div>
  );
}

export default function SellerOrdersPage() {
  return <Suspense fallback={<StatePanelLoading label="Loading order history" rows={4} />}><SellerOrdersContent /></Suspense>;
}
