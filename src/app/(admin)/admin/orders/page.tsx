"use client";

import { trpc } from "@/lib/trpc/client";
import { DataTable, DataTableColumnHeader } from "@/components/admin/data-table";
import { OrderStatusBadge } from "@/components/dashboard/status-badge";
import { Loader2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { OrderStatus } from "@/types";

interface Order {
  id: string;
  orderNumber: string;
  buyer: {
    name: string;
    businessName: string | null;
  };
  seller: {
    name: string;
    businessName: string | null;
  };
  totalPrice: number;
  status: OrderStatus;
  createdAt: Date | string;
}

export default function AdminOrdersPage() {
  const { data: ordersData, isLoading } = trpc.admin.getOrders.useQuery({ page: 1, limit: 50 });

  const columns: ColumnDef<Order>[] = [
    {
      accessorKey: "orderNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Order #" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.orderNumber}</span>
      ),
    },
    {
      accessorKey: "buyer",
      header: "Buyer",
      cell: ({ row }) =>
        row.original.buyer.businessName || row.original.buyer.name,
    },
    {
      accessorKey: "seller",
      header: "Seller",
      cell: ({ row }) =>
        row.original.seller.businessName || row.original.seller.name,
    },
    {
      accessorKey: "totalPrice",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Amount" />
      ),
      cell: ({ row }) => formatCurrency(row.original.totalPrice),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Order Management</h1>
        <p className="text-muted-foreground mt-1">
          View and monitor all platform orders
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : ordersData ? (
        <DataTable columns={columns} data={ordersData.orders} />
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No orders found</p>
        </div>
      )}
    </div>
  );
}
