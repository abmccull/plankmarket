"use client";

import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { OrderStatusBadge } from "@/components/dashboard/status-badge";
import {
  QueryErrorState,
  StatePanel,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { formatCurrency, formatSqFt, formatDate } from "@/lib/utils";
import { Package, Search } from "lucide-react";
import type { OrderStatus } from "@/types";

export default function BuyerOrdersPage() {
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.order.getMyOrders.useQuery({
      page: 1,
      limit: 50,
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Orders</h1>
        <p className="text-muted-foreground mt-1">
          Track and manage your flooring purchases
        </p>
      </div>

      {isLoading ? (
        <StatePanelLoading label="Loading your orders" rows={4} />
      ) : isError || !data ? (
        <QueryErrorState
          title="We couldn't load your orders"
          description="Your order history is still safe. Check your connection and try loading it again."
          onRetry={() => void refetch()}
          isRetrying={isFetching}
          secondaryAction={{ label: "Browse listings", href: "/listings" }}
        />
      ) : data.items.length === 0 ? (
        <StatePanel
          icon={Search}
          title="Ready to find your first lot?"
          description="Browse available flooring, review the lot details and shipping information, then place an order when the fit is right."
          primaryAction={{ label: "Browse listings", href: "/listings" }}
        />
      ) : (
        <ul className="space-y-3" aria-label="Your orders">
          {data.items.map((order) => (
            <li key={order.id}>
              <Link
                href={`/buyer/orders/${order.id}`}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                  {order.listing.media?.[0] ? (
                    <Image
                      src={order.listing.media[0].url}
                      alt=""
                      width={56}
                      height={56}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package
                      className="h-5 w-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-muted-foreground">
                      {order.orderNumber}
                    </span>
                    <OrderStatusBadge status={order.status as OrderStatus} />
                  </div>
                  <h2 className="mt-1 truncate font-medium">
                    {order.listing.title}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatSqFt(order.quantitySqFt)}</span>
                    <span>{order.seller.name}</span>
                    <span>{formatDate(order.createdAt)}</span>
                  </div>
                </div>

                <div className="col-start-2 text-left sm:col-start-auto sm:text-right">
                  <div className="font-semibold">
                    {formatCurrency(order.totalPrice)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Order total
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
