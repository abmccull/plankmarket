"use client";

import { useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle, XCircle, MoreHorizontal, Ban, ShieldCheck } from "lucide-react";
import { formatDate, getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import type { UserRole } from "@/types";

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active?: boolean;
  isVerified?: boolean;
  verificationStatus?: string;
  stripeAccountId: string | null;
  createdAt: Date | string;
  [key: string]: unknown;
}

export default function AdminUsersPage() {
  const { data: usersData, isLoading } = trpc.admin.getUsers.useQuery({ page: 1, limit: 50 });
  const utils = trpc.useUtils();
  const updateRole = trpc.admin.updateUser.useMutation();

  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [unsuspendDialogOpen, setUnsuspendDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  const suspendMutation = trpc.admin.suspendUser.useMutation({
    onSuccess: () => {
      toast.success("User suspended successfully");
      utils.admin.getUsers.invalidate();
      setSuspendDialogOpen(false);
      setSuspendReason("");
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });

  const unsuspendMutation = trpc.admin.unsuspendUser.useMutation({
    onSuccess: () => {
      toast.success("User reinstated successfully");
      utils.admin.getUsers.invalidate();
      setUnsuspendDialogOpen(false);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await updateRole.mutateAsync({ userId, role: newRole });
      toast.success("User role updated successfully");
      utils.admin.getUsers.invalidate();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update role"));
    }
  };

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.name}
          {row.original.active === false && (
            <Badge variant="destructive" className="text-[10px]">Suspended</Badge>
          )}
        </div>
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
          <SelectTrigger className="w-full sm:w-32 h-8">
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {row.original.active !== false && row.original.role !== "admin" && (
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  setSelectedUser(row.original);
                  setSuspendDialogOpen(true);
                }}
              >
                <Ban className="mr-2 h-4 w-4" />
                Suspend User
              </DropdownMenuItem>
            )}
            {row.original.active === false && (
              <DropdownMenuItem
                onClick={() => {
                  setSelectedUser(row.original);
                  setUnsuspendDialogOpen(true);
                }}
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                Unsuspend User
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage registered users and their roles
          </p>
        </div>
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

      {/* Suspend User Dialog */}
      <AlertDialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend User</AlertDialogTitle>
            <AlertDialogDescription>
              This will suspend {selectedUser?.name} ({selectedUser?.email}).
              They will no longer be able to access the platform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="suspendReason">Reason</Label>
            <Textarea
              id="suspendReason"
              placeholder="Why is this user being suspended?"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSuspendReason("")}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!suspendReason.trim() || suspendMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (selectedUser) {
                  suspendMutation.mutate({
                    userId: selectedUser.id,
                    reason: suspendReason,
                  });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {suspendMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Suspend User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsuspend User Dialog */}
      <AlertDialog open={unsuspendDialogOpen} onOpenChange={setUnsuspendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reinstate User</AlertDialogTitle>
            <AlertDialogDescription>
              This will reinstate {selectedUser?.name} ({selectedUser?.email}).
              They will regain access to the platform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={unsuspendMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (selectedUser) {
                  unsuspendMutation.mutate({
                    userId: selectedUser.id,
                  });
                }
              }}
            >
              {unsuspendMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reinstate User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
