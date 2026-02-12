"use client";

import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OrderStatusBadge } from "@/components/dashboard/status-badge";
import { formatCurrency, formatSqFt, formatDate } from "@/lib/utils";
import { Loader2, Package, MapPin, Truck, Store } from "lucide-react";
import type { OrderStatus } from "@/types";

export default function BuyerOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const { data: order, isLoading } = trpc.order.getById.useQuery({
    id: orderId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold">Order Not Found</h1>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Order {order.orderNumber}</h1>
          <p className="text-muted-foreground text-sm">
            Placed on {formatDate(order.createdAt)}
          </p>
        </div>
        <OrderStatusBadge status={order.status as OrderStatus} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Order Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Order Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Listing</span>
              <span className="font-medium text-right max-w-[200px] truncate">
                {order.listing.title}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quantity</span>
              <span>{formatSqFt(order.quantitySqFt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price / Sq Ft</span>
              <span>{formatCurrency(order.pricePerSqFt)}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Buyer Fee (3%)</span>
              <span>{formatCurrency(order.buyerFee)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="text-primary">
                {formatCurrency(order.totalPrice)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Shipping & Tracking */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Shipping
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h4 className="font-medium mb-1">Delivery Address</h4>
              <p>{order.shippingName}</p>
              <p className="text-muted-foreground">{order.shippingAddress}</p>
              <p className="text-muted-foreground">
                {order.shippingCity}, {order.shippingState}{" "}
                {order.shippingZip}
              </p>
            </div>

            {order.trackingNumber && (
              <>
                <Separator />
                <div>
                  <h4 className="font-medium flex items-center gap-1 mb-1">
                    <Truck className="h-3 w-3" />
                    Tracking Information
                  </h4>
                  <p className="font-mono">{order.trackingNumber}</p>
                  {order.carrier && (
                    <p className="text-muted-foreground">{order.carrier}</p>
                  )}
                </div>
              </>
            )}

            <Separator />
            <div>
              <h4 className="font-medium flex items-center gap-1 mb-1">
                <Store className="h-3 w-3" />
                Seller
              </h4>
              <p>{order.seller.name}</p>
              <p className="text-muted-foreground">
                {order.seller.businessName}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Order Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Order Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <TimelineItem
              label="Order Placed"
              date={order.createdAt}
              active
            />
            <TimelineItem
              label="Order Confirmed"
              date={order.confirmedAt}
              active={!!order.confirmedAt}
            />
            <TimelineItem
              label="Shipped"
              date={order.shippedAt}
              active={!!order.shippedAt}
            />
            <TimelineItem
              label="Delivered"
              date={order.deliveredAt}
              active={!!order.deliveredAt}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineItem({
  label,
  date,
  active,
}: {
  label: string;
  date: Date | string | null;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`h-3 w-3 rounded-full ${
          active ? "bg-primary" : "bg-muted"
        }`}
      />
      <div className="flex-1">
        <span
          className={`text-sm ${
            active ? "font-medium" : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
      </div>
      {date && (
        <span className="text-xs text-muted-foreground">
          {formatDate(date)}
        </span>
      )}
    </div>
  );
}
