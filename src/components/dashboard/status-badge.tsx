import { Badge } from "@/components/ui/badge";
import {
  Clock,
  CheckCircle,
  Package,
  Truck,
  XCircle,
  FileText,
  Archive,
  DollarSign,
  Loader2,
} from "lucide-react";
import type { ListingStatus, OrderStatus } from "@/types";

const listingStatusConfig: Record<
  ListingStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "gold" | "verified";
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  draft: { label: "Draft", variant: "secondary", icon: FileText },
  active: { label: "Active", variant: "verified", icon: CheckCircle },
  sold: { label: "Sold", variant: "gold", icon: DollarSign },
  expired: { label: "Expired", variant: "warning", icon: Clock },
  archived: { label: "Archived", variant: "outline", icon: Archive },
};

const orderStatusConfig: Record<
  OrderStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  pending: { label: "Pending", variant: "warning", icon: Clock },
  confirmed: { label: "Confirmed", variant: "default", icon: CheckCircle },
  processing: { label: "Processing", variant: "secondary", icon: Loader2 },
  shipped: { label: "Shipped", variant: "default", icon: Truck },
  delivered: { label: "Delivered", variant: "success", icon: Package },
  cancelled: { label: "Cancelled", variant: "destructive", icon: XCircle },
  refunded: { label: "Refunded", variant: "outline", icon: DollarSign },
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  const config = listingStatusConfig[status];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="flex items-center gap-1">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {config.label}
    </Badge>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const config = orderStatusConfig[status];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="flex items-center gap-1">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {config.label}
    </Badge>
  );
}
