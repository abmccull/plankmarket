"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { DataTable, DataTableColumnHeader } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2,
  Package,
  TrendingUp,
  DollarSign,
  PiggyBank,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { formatCurrency, getErrorMessage } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";

type ShipmentStatus = "pending" | "dispatched" | "in_transit" | "out_for_delivery" | "delivered" | "exception" | "cancelled";

interface Shipment {
  id: string;
  orderId: string;
  carrierName: string | null;
  status: ShipmentStatus;
  proNumber: string | null;
  bolUrl: string | null;
  createdAt: Date | string;
  order: {
    id: string;
    orderNumber: string;
    carrierRate: number | null;
    shippingPrice: number | null;
    shippingMargin: number | null;
  };
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "success" | "warning" | "outline" }> = {
  pending: {
    label: "Pending Pickup",
    variant: "warning",
  },
  dispatched: {
    label: "Dispatched",
    variant: "default",
  },
  in_transit: {
    label: "In Transit",
    variant: "default",
  },
  out_for_delivery: {
    label: "Out for Delivery",
    variant: "default",
  },
  delivered: {
    label: "Delivered",
    variant: "success",
  },
  exception: {
    label: "Exception",
    variant: "destructive",
  },
  cancelled: {
    label: "Cancelled",
    variant: "secondary",
  },
};

export default function AdminShipmentsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading } = trpc.admin.getShipments.useQuery({
    status: statusFilter !== "all" ? (statusFilter as ShipmentStatus) : undefined,
    page,
    limit,
  });

  const { data: stats } = trpc.admin.getShippingStats.useQuery();

  const utils = trpc.useUtils();

  const repollMutation = trpc.admin.repollShipment.useMutation({
    onSuccess: () => {
      toast.success("Shipment tracking data refreshed");
      utils.admin.getShipments.invalidate();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });

  const columns: ColumnDef<Shipment>[] = [
    {
      accessorKey: "order",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Order #" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.order.orderNumber}</span>
      ),
    },
    {
      accessorKey: "carrierName",
      header: "Carrier",
      cell: ({ row }) => <span>{row.original.carrierName ?? "—"}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const statusConfig = STATUS_CONFIG[row.original.status] ?? STATUS_CONFIG.pending;
        return (
          <Badge variant={statusConfig.variant}>
            {statusConfig.label}
          </Badge>
        );
      },
    },
    {
      id: "carrierRate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Carrier Rate" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.order.carrierRate != null
            ? formatCurrency(row.original.order.carrierRate)
            : "—"}
        </span>
      ),
    },
    {
      id: "shippingPrice",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Shipping Price" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.order.shippingPrice != null
            ? formatCurrency(row.original.order.shippingPrice)
            : "—"}
        </span>
      ),
    },
    {
      id: "margin",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Margin" />
      ),
      cell: ({ row }) => {
        const margin = row.original.order.shippingMargin;
        if (margin === null) return <span className="text-muted-foreground">—</span>;
        return (
          <span className={margin >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
            {formatCurrency(margin)}
          </span>
        );
      },
    },
    {
      accessorKey: "proNumber",
      header: "PRO #",
      cell: ({ row }) => (
        row.original.proNumber ? (
          <span className="font-mono text-sm">{row.original.proNumber}</span>
        ) : (
          <span className="text-muted-foreground">N/A</span>
        )
      ),
    },
    {
      accessorKey: "bolUrl",
      header: "BOL",
      cell: ({ row }) => (
        row.original.bolUrl ? (
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-8 px-2"
          >
            <a
              href={row.original.bolUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View Bill of Lading"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        ) : (
          <span className="text-muted-foreground">N/A</span>
        )
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => repollMutation.mutate({ shipmentId: row.original.id })}
          disabled={repollMutation.isPending}
          aria-label="Re-poll shipment tracking data"
        >
          <RefreshCw
            className={`h-4 w-4 ${repollMutation.isPending ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Shipment Management</h1>
        <p className="text-muted-foreground mt-1">
          Monitor all shipments, carrier rates, and shipping margins
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Package className="h-4 w-4" />
                Total Shipments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.totalShipments}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Active Shipments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.activeShipments}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                Total Shipping Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatCurrency(stats.totalRevenue)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <PiggyBank className="h-4 w-4" />
                Total Margin
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatCurrency(stats.totalMargin)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending Pickup</SelectItem>
              <SelectItem value="dispatched">Dispatched</SelectItem>
              <SelectItem value="in_transit">In Transit</SelectItem>
              <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="exception">Exception</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <DataTable columns={columns} data={data.items} />

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * limit + 1} to{" "}
                {Math.min(page * limit, data.total)} of {data.total} shipments
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-sm">
                  Page {page} of {data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={page === data.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No shipments found</p>
        </div>
      )}
    </div>
  );
}
