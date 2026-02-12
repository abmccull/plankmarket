import { Badge } from "@/components/ui/badge";
import type { ListingStatus, OrderStatus } from "@/types";

const listingStatusConfig: Record<
  ListingStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" }
> = {
  draft: { label: "Draft", variant: "secondary" },
  active: { label: "Active", variant: "success" },
  sold: { label: "Sold", variant: "default" },
  expired: { label: "Expired", variant: "warning" },
  archived: { label: "Archived", variant: "outline" },
};

const orderStatusConfig: Record<
  OrderStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" }
> = {
  pending: { label: "Pending", variant: "warning" },
  confirmed: { label: "Confirmed", variant: "default" },
  processing: { label: "Processing", variant: "secondary" },
  shipped: { label: "Shipped", variant: "default" },
  delivered: { label: "Delivered", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  refunded: { label: "Refunded", variant: "outline" },
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  const config = listingStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const config = orderStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
