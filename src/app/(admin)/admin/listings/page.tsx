"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { DataTable, DataTableColumnHeader } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { ListingStatusBadge } from "@/components/dashboard/status-badge";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  MoreHorizontal,
  Flag,
  FlagOff,
  ExternalLink,
  ReceiptText,
} from "lucide-react";
import { formatCurrency, formatDate, getErrorMessage } from "@/lib/utils";
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
  stripeTaxCode: string | null;
  taxCodeStatus: "unassigned" | "pending_review" | "verified";
  createdAt: Date | string;
  [key: string]: unknown;
}

export default function AdminListingsPage() {
  const { data: listingsData, isLoading } = trpc.admin.getListings.useQuery({ page: 1, limit: 50 });
  const utils = trpc.useUtils();

  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [unflagDialogOpen, setUnflagDialogOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [taxDialogOpen, setTaxDialogOpen] = useState(false);
  const [taxReviewAction, setTaxReviewAction] = useState<
    "verify" | "clear"
  >("verify");
  const [taxCode, setTaxCode] = useState("");
  const [taxClearReason, setTaxClearReason] = useState("");

  const flagMutation = trpc.admin.flagListing.useMutation({
    onSuccess: () => {
      toast.success("Listing flagged and removed from marketplace");
      utils.admin.getListings.invalidate();
      setFlagDialogOpen(false);
      setFlagReason("");
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });

  const unflagMutation = trpc.admin.unflagListing.useMutation({
    onSuccess: () => {
      toast.success("Listing restored to marketplace");
      utils.admin.getListings.invalidate();
      setUnflagDialogOpen(false);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });

  const taxCodeMutation = trpc.admin.setListingTaxCode.useMutation({
    onSuccess: () => {
      toast.success(
        taxReviewAction === "verify"
          ? "Tax code verified"
          : "Tax code cleared",
      );
      utils.admin.getListings.invalidate();
      utils.admin.getTaxReadiness.invalidate();
      setTaxDialogOpen(false);
      setTaxCode("");
      setTaxClearReason("");
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });

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
      accessorKey: "taxCodeStatus",
      header: "Tax code",
      cell: ({ row }) => (
        <div className="space-y-1">
          <Badge
            variant={
              row.original.taxCodeStatus === "verified"
                ? "success"
                : "outline"
            }
          >
            {row.original.taxCodeStatus === "verified"
              ? "Verified"
              : "Not ready"}
          </Badge>
          {row.original.stripeTaxCode && (
            <p className="font-mono text-xs text-muted-foreground">
              {row.original.stripeTaxCode}
            </p>
          )}
        </div>
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
            <DropdownMenuItem asChild>
              <a href={`/listings/${row.original.id}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                View Listing
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setSelectedListing(row.original);
                setTaxReviewAction("verify");
                setTaxCode(row.original.stripeTaxCode ?? "");
                setTaxDialogOpen(true);
              }}
            >
              <ReceiptText className="mr-2 h-4 w-4" />
              Review tax code
            </DropdownMenuItem>
            {row.original.taxCodeStatus === "verified" && (
              <DropdownMenuItem
                onClick={() => {
                  setSelectedListing(row.original);
                  setTaxReviewAction("clear");
                  setTaxClearReason("");
                  setTaxDialogOpen(true);
                }}
              >
                <ReceiptText className="mr-2 h-4 w-4" />
                Clear tax code
              </DropdownMenuItem>
            )}
            {row.original.status === "active" && (
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  setSelectedListing(row.original);
                  setFlagDialogOpen(true);
                }}
              >
                <Flag className="mr-2 h-4 w-4" />
                Flag Listing
              </DropdownMenuItem>
            )}
            {row.original.status === "archived" && (
              <DropdownMenuItem
                onClick={() => {
                  setSelectedListing(row.original);
                  setUnflagDialogOpen(true);
                }}
              >
                <FlagOff className="mr-2 h-4 w-4" />
                Unflag / Restore
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
          <h1 className="text-3xl font-bold">Listing Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage all listings on the platform
          </p>
        </div>
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

      {/* Flag Listing Dialog */}
      <AlertDialog open={taxDialogOpen} onOpenChange={setTaxDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {taxReviewAction === "verify"
                ? "Verify listing tax code"
                : "Clear listing tax code"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {taxReviewAction === "verify"
                ? "Enter only the Stripe Tax code approved for this flooring inventory. This administrative decision is audited; PlankMarket will not infer or auto-assign a category."
                : "Clearing the code immediately makes this listing ineligible for tax-enabled checkout. Record why the prior verification is no longer valid."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            {taxReviewAction === "verify" ? (
              <>
                <Label htmlFor="listingTaxCode">Stripe Tax code</Label>
                <Input
                  id="listingTaxCode"
                  value={taxCode}
                  onChange={(event) => setTaxCode(event.target.value)}
                  placeholder="txcd_..."
                  autoComplete="off"
                />
              </>
            ) : (
              <>
                <Label htmlFor="taxClearReason">Reason</Label>
                <Textarea
                  id="taxClearReason"
                  value={taxClearReason}
                  onChange={(event) =>
                    setTaxClearReason(event.target.value)
                  }
                  rows={3}
                  placeholder="Why is this tax code no longer approved?"
                />
              </>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                taxCodeMutation.isPending ||
                (taxReviewAction === "verify"
                  ? !/^txcd_\d+$/.test(taxCode.trim())
                  : taxClearReason.trim().length < 10)
              }
              onClick={(event) => {
                event.preventDefault();
                if (!selectedListing) return;
                if (taxReviewAction === "verify") {
                  taxCodeMutation.mutate({
                    action: "verify",
                    listingId: selectedListing.id,
                    taxCode: taxCode.trim(),
                  });
                } else {
                  taxCodeMutation.mutate({
                    action: "clear",
                    listingId: selectedListing.id,
                    reason: taxClearReason.trim(),
                  });
                }
              }}
            >
              {taxCodeMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {taxReviewAction === "verify"
                ? "Verify code"
                : "Clear code"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Flag Listing Dialog */}
      <AlertDialog open={flagDialogOpen} onOpenChange={setFlagDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Flag Listing</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove &quot;{selectedListing?.title}&quot; from the
              marketplace and notify the seller. Please provide a reason.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="flagReason">Reason</Label>
            <Textarea
              id="flagReason"
              placeholder="Why is this listing being flagged?"
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setFlagReason("")}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!flagReason.trim() || flagMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (selectedListing) {
                  flagMutation.mutate({
                    listingId: selectedListing.id,
                    reason: flagReason,
                  });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {flagMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Flag Listing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unflag Listing Dialog */}
      <AlertDialog open={unflagDialogOpen} onOpenChange={setUnflagDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Listing</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore &quot;{selectedListing?.title}&quot; to the
              marketplace and notify the seller.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={unflagMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (selectedListing) {
                  unflagMutation.mutate({
                    listingId: selectedListing.id,
                  });
                }
              }}
            >
              {unflagMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Restore Listing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
