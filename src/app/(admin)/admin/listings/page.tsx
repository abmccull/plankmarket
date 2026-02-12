"use client";

import { trpc } from "@/lib/trpc/client";
import { DataTable, DataTableColumnHeader } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { ListingStatusBadge } from "@/components/dashboard/status-badge";
import { Loader2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { ListingStatus } from "@/types";

interface Listing {
  id: string;
  title: string;
  seller: {
    name: string;
    businessName: string | null;
  };
  askPricePerSqFt: number;
  status: ListingStatus;
  createdAt: Date | string;
  [key: string]: unknown;
}

export default function AdminListingsPage() {
  const { data: listingsData, isLoading } = trpc.admin.getListings.useQuery({ page: 1, limit: 50 });

  const columns: ColumnDef<Listing>[] = [
    {
      accessorKey: "title",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Title" />
      ),
      cell: ({ row }) => (
        <div className="max-w-[300px] truncate">{row.original.title}</div>
      ),
    },
    {
      accessorKey: "seller",
      header: "Seller",
      cell: ({ row }) =>
        row.original.seller.businessName || row.original.seller.name,
    },
    {
      accessorKey: "pricePerSqFt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Price" />
      ),
      cell: ({ row }) => formatCurrency(row.original.askPricePerSqFt),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <ListingStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <a href={`/listings/${row.original.id}`}>View</a>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Listing Management</h1>
        <p className="text-muted-foreground mt-1">
          Manage all listings on the platform
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : listingsData ? (
        <DataTable columns={columns} data={listingsData.listings} />
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No listings found</p>
        </div>
      )}
    </div>
  );
}
