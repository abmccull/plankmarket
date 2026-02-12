"use client";

import { trpc } from "@/lib/trpc/client";
import { DataTable, DataTableColumnHeader } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import type { UserRole } from "@/types";

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isVerified?: boolean;
  verificationStatus?: string;
  stripeAccountId: string | null;
  createdAt: Date | string;
  [key: string]: unknown;
}

export default function AdminUsersPage() {
  const { data: usersData, isLoading, refetch } = trpc.admin.getUsers.useQuery({ page: 1, limit: 50 });
  const updateRole = trpc.admin.updateUser.useMutation();

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await updateRole.mutateAsync({ userId, role: newRole });
      toast.success("User role updated successfully");
      refetch();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to update role";
      toast.error(message);
    }
  };

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
    },
    {
      accessorKey: "email",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Email" />
      ),
    },
    {
      accessorKey: "role",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Role" />
      ),
      cell: ({ row }) => (
        <Select
          value={row.original.role}
          onValueChange={(value) =>
            handleRoleChange(row.original.id, value as UserRole)
          }
        >
          <SelectTrigger className="w-32 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="buyer">Buyer</SelectItem>
            <SelectItem value="seller">Seller</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      accessorKey: "isVerified",
      header: "Verified",
      cell: ({ row }) =>
        row.original.isVerified ? (
          <CheckCircle className="h-4 w-4 text-green-600" aria-label="Verified" />
        ) : (
          <XCircle className="h-4 w-4 text-muted-foreground" aria-label="Not verified" />
        ),
    },
    {
      accessorKey: "stripeAccountId",
      header: "Stripe",
      cell: ({ row }) =>
        row.original.stripeAccountId ? (
          <Badge variant="success">Connected</Badge>
        ) : (
          <Badge variant="outline">Not connected</Badge>
        ),
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
          <a href={`/admin/users/${row.original.id}`}>View</a>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground mt-1">
          Manage registered users and their roles
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : usersData ? (
        <DataTable columns={columns} data={usersData.users} />
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No users found</p>
        </div>
      )}
    </div>
  );
}
