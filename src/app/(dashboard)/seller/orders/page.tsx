"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { OrderStatusBadge } from "@/components/dashboard/status-badge";
import { formatCurrency, formatSqFt, formatDate } from "@/lib/utils";
import { Loader2, Package } from "lucide-react";
import type { OrderStatus } from "@/types";
import { getAnonymousDisplayName } from "@/lib/identity/display-name";

export default function SellerOrdersPage() {
  const { data, isLoading } = trpc.order.getSellerOrders.useQuery({
    page: 1,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Orders</h1>
        <p className="text-muted-foreground mt-1">
          Manage orders from your listings
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
            Orders will appear here when buyers purchase your listings.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.items.map((order) => (
            <Link
              key={order.id}
              href={`/seller/orders/${order.id}`}
              className="flex items-center gap-4 rounded-lg border p-4 hover:bg-muted/30 transition-colors"
            >
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
                  <span>Buyer: {getAnonymousDisplayName({ role: order.buyer.role, businessState: order.buyer.businessState, name: order.buyer.name, businessCity: order.buyer.businessCity })}</span>
                  <span>{formatDate(order.createdAt)}</span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-semibold">
                  {formatCurrency(order.sellerPayout)}
                </div>
                <div className="text-xs text-muted-foreground">Payout</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
