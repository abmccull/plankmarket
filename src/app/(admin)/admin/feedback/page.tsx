"use client";

import { trpc } from "@/lib/trpc/client";
import { DataTable, DataTableColumnHeader } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";

interface Feedback {
  id: string;
  type: string;
  page: string | null;
  message: string;
  rating: number | null;
  user: {
    name: string;
    email: string;
  } | null;
  createdAt: Date | string;
  [key: string]: unknown;
}

export default function AdminFeedbackPage() {
  const { data: feedbackData, isLoading } = trpc.feedback.getAll.useQuery({ page: 1, limit: 50 });

  const columns: ColumnDef<Feedback>[] = [
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {row.original.type}
        </Badge>
      ),
    },
    {
      accessorKey: "page",
      header: "Page",
      cell: ({ row }) => (
        <span className="text-sm font-mono">{row.original.page}</span>
      ),
    },
    {
      accessorKey: "message",
      header: "Message",
      cell: ({ row }) => (
        <div className="max-w-[400px] truncate">{row.original.message}</div>
      ),
    },
    {
      accessorKey: "rating",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Rating" />
      ),
      cell: ({ row }) =>
        row.original.rating ? (
          <span>{row.original.rating} / 5</span>
        ) : (
          <span className="text-muted-foreground">N/A</span>
        ),
    },
    {
      accessorKey: "user",
      header: "User",
      cell: ({ row }) =>
        row.original.user ? (
          <div>
            <div className="text-sm">{row.original.user.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.user.email}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">Anonymous</span>
        ),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Feedback Review</h1>
        <p className="text-muted-foreground mt-1">
          Review user feedback and suggestions
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : feedbackData ? (
        <DataTable columns={columns} data={feedbackData.feedback} />
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No feedback found</p>
        </div>
      )}
    </div>
  );
}
