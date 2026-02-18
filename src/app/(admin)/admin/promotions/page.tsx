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
import { toast } from "sonner";
import {
  Loader2,
  MoreHorizontal,
  XCircle,
  TrendingUp,
  Zap,
  Star,
  Crown,
  DollarSign,
} from "lucide-react";
import { formatCurrency, formatDate, getErrorMessage } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Promotion {
  id: string;
  tier: "spotlight" | "featured" | "premium";
  durationDays: number;
  pricePaid: number;
  startsAt: Date | string;
  expiresAt: Date | string;
  isActive: boolean;
  paymentStatus: string;
  createdAt: Date | string;
  cancelledAt: Date | string | null;
  listing: {
    id: string;
    title: string;
    status: string;
  };
  seller: {
    id: string;
    name: string;
    businessName: string | null;
  };
}

const TIER_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  spotlight: { label: "Spotlight", variant: "outline" },
  featured: { label: "Featured", variant: "secondary" },
  premium: { label: "Premium", variant: "default" },
};

export default function AdminPromotionsPage() {
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [activeOnly, setActiveOnly] = useState(false);

  const { data, isLoading } = trpc.promotion.adminGetAll.useQuery({
    tier: tierFilter !== "all" ? (tierFilter as "spotlight" | "featured" | "premium") : undefined,
    activeOnly,
    page: 1,
    limit: 50,
  });
  const utils = trpc.useUtils();

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);

  const cancelMutation = trpc.promotion.adminCancel.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.refundAmountDollars > 0
          ? `Promotion cancelled. Refund: ${formatCurrency(result.refundAmountDollars)}`
          : "Promotion cancelled"
      );
      utils.promotion.adminGetAll.invalidate();
      setCancelDialogOpen(false);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });

  const stats = data?.stats;

  const columns: ColumnDef<Promotion>[] = [
    {
      accessorKey: "listing",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Listing" />
      ),
      cell: ({ row }) => (
        <div className="max-w-[200px] truncate">
          {row.original.listing.title}
        </div>
      ),
    },
    {
      accessorKey: "seller",
      header: "Seller",
      cell: ({ row }) =>
        row.original.seller.businessName || row.original.seller.name,
    },
    {
      accessorKey: "tier",
      header: "Tier",
      cell: ({ row }) => {
        const tierInfo = TIER_BADGES[row.original.tier];
        return (
          <Badge variant={tierInfo?.variant ?? "outline"}>
            {tierInfo?.label ?? row.original.tier}
          </Badge>
        );
      },
    },
    {
      accessorKey: "durationDays",
      header: "Duration",
      cell: ({ row }) => `${row.original.durationDays} days`,
    },
    {
      accessorKey: "pricePaid",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Price" />
      ),
      cell: ({ row }) => formatCurrency(row.original.pricePaid),
    },
    {
      accessorKey: "startsAt",
      header: "Start",
      cell: ({ row }) => formatDate(row.original.startsAt),
    },
    {
      accessorKey: "expiresAt",
      header: "Expires",
      cell: ({ row }) => formatDate(row.original.expiresAt),
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => {
        if (row.original.cancelledAt) {
          return <Badge variant="destructive">Cancelled</Badge>;
        }
        if (!row.original.isActive) {
          return <Badge variant="outline">Expired</Badge>;
        }
        const now = new Date();
        const expires = new Date(row.original.expiresAt);
        if (expires > now) {
          return <Badge variant="success">Active</Badge>;
        }
        return <Badge variant="outline">Expired</Badge>;
      },
    },
    {
      accessorKey: "paymentStatus",
      header: "Payment",
      cell: ({ row }) => {
        const status = row.original.paymentStatus;
        if (status === "succeeded") return <Badge variant="success">Paid</Badge>;
        if (status === "refunded") return <Badge variant="secondary">Refunded</Badge>;
        if (status === "pending") return <Badge variant="outline">Pending</Badge>;
        return <Badge variant="outline">{status}</Badge>;
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        if (!row.original.isActive) return null;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  setSelectedPromotion(row.original);
                  setCancelDialogOpen(true);
                }}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel Promotion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Promotion Management</h1>
        <p className="text-muted-foreground mt-1">
          View and manage listing promotions and boost revenue
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Active Promotions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.activeCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                Total Revenue
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
                <Zap className="h-4 w-4" />
                Spotlight
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatCurrency(stats.spotlightRevenue)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Star className="h-4 w-4" />
                Featured
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatCurrency(stats.featuredRevenue)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Crown className="h-4 w-4" />
                Premium
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatCurrency(stats.premiumRevenue)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Tier:</span>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="spotlight">Spotlight</SelectItem>
              <SelectItem value="featured">Featured</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant={activeOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveOnly(!activeOnly)}
        >
          {activeOnly ? "Showing Active" : "Show Active Only"}
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <DataTable columns={columns} data={data.items} />
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No promotions found</p>
        </div>
      )}

      {/* Cancel Promotion Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Promotion</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the {selectedPromotion?.tier} promotion for
              &quot;{selectedPromotion?.listing.title}&quot; and issue a pro-rata
              refund to the seller. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Active</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (selectedPromotion) {
                  cancelMutation.mutate({
                    promotionId: selectedPromotion.id,
                  });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Cancel Promotion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
