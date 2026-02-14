"use client";

import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { OrderStatusBadge } from "@/components/dashboard/status-badge";
import { formatCurrency, formatSqFt, formatDate } from "@/lib/utils";
import { Loader2, Package } from "lucide-react";
import type { OrderStatus } from "@/types";
import { getAnonymousDisplayName } from "@/lib/identity/display-name";

export default function BuyerOrdersPage() {
  const { data, isLoading } = trpc.order.getMyOrders.useQuery({
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
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data?.items.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No orders yet</h3>
          <p className="text-muted-foreground mt-1">
            Browse listings and make your first purchase.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.items.map((order) => (
            <Link
              key={order.id}
              href={`/buyer/orders/${order.id}`}
              className="flex items-center gap-4 rounded-lg border p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="h-14 w-14 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {order.listing.media?.[0] ? (
                  <Image
                    src={order.listing.media[0].url}
                    alt={order.listing.title}
                    width={56}
                    height={56}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Package className="h-5 w-5 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-muted-foreground">
                    {order.orderNumber}
                  </span>
                  <OrderStatusBadge status={order.status as OrderStatus} />
                </div>
                <h3 className="font-medium truncate mt-0.5">
                  {order.listing.title}
                </h3>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  <span>{formatSqFt(order.quantitySqFt)}</span>
                  <span>{getAnonymousDisplayName({ role: order.seller.role, businessState: order.seller.businessState })}</span>
                  <span>{formatDate(order.createdAt)}</span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-semibold">
                  {formatCurrency(order.totalPrice)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
