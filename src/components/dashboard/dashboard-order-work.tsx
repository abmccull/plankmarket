"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/dashboard/status-badge";
import { formatSqFt } from "@/lib/utils";
import type { OrderStatus } from "@/types";

type QueueItem = {
  id: string;
  orderNumber: string;
  quantitySqFt: number;
  status: string;
  listing: { title: string };
};

type QueueQuery = {
  data?: { items: QueueItem[]; total: number };
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
};

function OrderQueue({ role, status, title, description, query }: {
  role: "buyer" | "seller";
  status: OrderStatus;
  title: string;
  description: string;
  query: QueueQuery;
}) {
  const failed = query.isError || (!query.isLoading && !query.data);
  return (
    <section aria-label={title} className="min-w-0 space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-sm text-muted-foreground">
          {query.isLoading ? "Loading…" : failed ? "Unavailable" : `${query.data!.total} total`}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      {query.isLoading ? (
        <p role="status" className="py-3 text-sm text-muted-foreground">Loading orders…</p>
      ) : failed ? (
        <div role="alert" className="space-y-2 rounded-md border border-destructive/30 p-3">
          <p className="text-sm">We couldn&apos;t refresh this queue.</p>
          <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={query.isFetching} onClick={() => void query.refetch()}>
            {query.isFetching ? "Trying again…" : `Retry ${title.toLowerCase()}`}
          </Button>
        </div>
      ) : query.data!.items.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">No orders in this queue.</p>
      ) : (
        <ul className="divide-y">
          {query.data!.items.map((order) => (
            <li key={order.id}>
              <Link href={`/${role}/orders/${order.id}`} className="block min-h-11 rounded-sm py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-muted/30">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-mono text-xs text-muted-foreground">{order.orderNumber}</span>
                  <OrderStatusBadge status={order.status as OrderStatus} />
                </div>
                <p className="mt-1 line-clamp-2 break-words text-sm font-medium">{order.listing.title}</p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{formatSqFt(order.quantitySqFt)}</span>
                  <span className="font-medium text-primary">{role === "buyer" && status === "shipped" ? "Track delivery" : "Review order"}<span aria-hidden="true"> →</span></span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/${role}/orders?status=${status}`} className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        View all {title.toLowerCase()}<span aria-hidden="true"> →</span>
      </Link>
    </section>
  );
}

export function BuyerOrderWork() {
  const pending = trpc.order.getMyOrders.useQuery({ status: "pending", page: 1, limit: 3 });
  const shipped = trpc.order.getMyOrders.useQuery({ status: "shipped", page: 1, limit: 3 });
  return (
    <section aria-labelledby="buyer-order-work-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="buyer-order-work-title" className="text-xl font-semibold">Continue your orders</h2>
        <Button asChild variant="outline" className="min-h-11"><Link href="/buyer/orders">All orders</Link></Button>
      </div>
      <div className="grid divide-y rounded-lg border bg-card md:grid-cols-2 md:divide-x md:divide-y-0">
        <OrderQueue role="buyer" status="pending" title="Pending orders" description="Review current payment and order details." query={pending} />
        <OrderQueue role="buyer" status="shipped" title="Deliveries in transit" description="Follow shipment updates and delivery details." query={shipped} />
      </div>
    </section>
  );
}

export function SellerOrderWork() {
  const confirmed = trpc.order.getSellerOrders.useQuery({ status: "confirmed", page: 1, limit: 3 });
  const processing = trpc.order.getSellerOrders.useQuery({ status: "processing", page: 1, limit: 3 });
  const pending = trpc.order.getSellerOrders.useQuery({ status: "pending", page: 1, limit: 3 });
  return (
    <section aria-labelledby="seller-order-work-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="seller-order-work-title" className="text-xl font-semibold">Orders to review</h2>
        <Button asChild variant="outline" className="min-h-11"><Link href="/seller/orders">All orders</Link></Button>
      </div>
      <div className="grid divide-y rounded-lg border bg-card lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <OrderQueue role="seller" status="confirmed" title="Confirmed orders" description="Review the order and its fulfillment instructions." query={confirmed} />
        <OrderQueue role="seller" status="processing" title="Orders in preparation" description="Continue orders already being prepared." query={processing} />
        <OrderQueue role="seller" status="pending" title="Pending orders" description="Check current payment and order details." query={pending} />
      </div>
    </section>
  );
}
