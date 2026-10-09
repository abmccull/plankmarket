"use client";

import { useEffect, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import type { ColumnDef } from "@tanstack/react-table";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { DataTable } from "@/components/admin/data-table";
import { SpecificationReview } from "@/components/admin/specification-review";
import { ListingStatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  QueryErrorState,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatCurrency, formatDate, getErrorMessage } from "@/lib/utils";

type Listing =
  inferRouterOutputs<AppRouter>["admin"]["getListings"]["listings"][number];
type Action = {
  kind: "flag" | "restore" | "tax-verify" | "tax-clear";
  listing: Listing;
};
type ListingFilter = Listing["status"] | "all";
const LIMIT = 25;
const control = "min-h-11 h-auto whitespace-normal px-3 py-2";
const isFilter = (value: string): value is ListingFilter =>
  ["all", "active", "archived", "draft", "sold", "expired"].includes(value);

export default function AdminListingsPage() {
  const user = useAuthStore((state) => state.user);
  return user?.role === "admin" ? (
    <ListingsQueue key={user.id} actorId={user.id} />
  ) : (
    <StatePanelLoading label="Checking administrator access" rows={2} />
  );
}

function ListingsQueue({ actorId }: { actorId: string }) {
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ListingFilter>("all");
  const query = trpc.admin.getListings.useQuery({
    page,
    limit: LIMIT,
    query: search || undefined,
    status: status === "all" ? undefined : status,
  });
  const utils = trpc.useUtils();
  const flag = trpc.admin.flagListing.useMutation({ retry: false });
  const restore = trpc.admin.unflagListing.useMutation({ retry: false });
  const tax = trpc.admin.setListingTaxCode.useMutation({ retry: false });
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<Listing | null>(null);
  const [busy, setBusy] = useState(false);
  const [specReview, setSpecReview] = useState<{
    listingId: string;
    opening: number;
  } | null>(null);
  const specTarget = useRef<typeof specReview>(null);
  const specSequence = useRef(0);
  const mounted = useRef(false);
  const working = useRef(false);
  const reviewRequired = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () =>
    mounted.current &&
    useAuthStore.getState().user?.id === actorId &&
    useAuthStore.getState().user?.role === "admin";
  const unavailable =
    busy || !!reviewTarget || query.isError || query.isFetching;
  const eligible =
    !!action &&
    (action.kind === "flag"
      ? action.listing.status === "active"
      : action.kind === "restore"
        ? action.listing.status === "archived"
        : action.kind === "tax-clear"
          ? action.listing.taxCodeStatus === "verified"
          : true);
  const valid =
    !!action &&
    (action.kind === "tax-verify"
      ? /^txcd_\d+$/.test(taxCode.trim())
      : action.kind === "restore"
        ? true
        : reason.trim().length >= (action.kind === "tax-clear" ? 10 : 1) &&
          reason.length <= 500);

  async function refreshQueue(allInputs = false) {
    if (!current()) return;
    try {
      if (allInputs) {
        await utils.admin.getListings.invalidate(undefined, {
          refetchType: "none",
        });
        if (!current()) return;
      }
      const result = await query.refetch();
      if (current()) setRefreshFailed(result.isError);
    } catch {
      if (current()) setRefreshFailed(true);
    }
  }
  function openAction(kind: Action["kind"], listing: Listing) {
    if (
      !current() ||
      working.current ||
      reviewRequired.current ||
      query.isError ||
      query.isFetching
    )
      return;
    setAction({ kind, listing });
    setReason("");
    setTaxCode(listing.stripeTaxCode ?? "");
    setActionError(null);
  }
  async function reviewListing() {
    if (!reviewTarget || !current() || working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const result = await utils.client.admin.getListings.query({
        query: reviewTarget.title,
        page: 1,
        limit: 100,
      });
      if (!current()) return;
      const latest = result.listings.find(
        (listing) => listing.id === reviewTarget.id,
      );
      if (!latest)
        throw new Error(
          "This listing could not be found. Keep the action on hold.",
        );
      setAction((previous) =>
        previous ? { ...previous, listing: latest } : null,
      );
      reviewRequired.current = false;
      setReviewTarget(null);
      setActionError(null);
      setNotice(
        "Listing status refreshed. Review its current state before another action; this read does not confirm earlier notification or provider outcomes.",
      );
      await refreshQueue(true);
    } catch (error) {
      if (current()) setActionError(getErrorMessage(error));
    } finally {
      working.current = false;
      if (current()) setBusy(false);
    }
  }
  async function submit() {
    if (
      !action ||
      !current() ||
      working.current ||
      reviewRequired.current ||
      query.isError ||
      query.isFetching ||
      !eligible ||
      !valid
    )
      return;
    const selected = action;
    working.current = true;
    setBusy(true);
    setActionError(null);
    try {
      let message: string;
      if (selected.kind === "flag") {
        await flag.mutateAsync({ listingId: selected.listing.id, reason });
        message = "Listing flagged and removed from marketplace.";
      } else if (selected.kind === "restore") {
        const receipt = await restore.mutateAsync({
          listingId: selected.listing.id,
          restorationVersion: selected.listing.restorationVersion,
        });
        message = receipt.replayed
          ? "This earlier restoration was already recorded. Refresh listing status to confirm its current state."
          : receipt.confirmationRequired
            ? "Listing restored. The seller must confirm current availability before buyers can see it."
            : "Listing restored after review.";
        if (receipt.alertsPending)
          message += " Listing alerts are awaiting processing.";
      } else if (selected.kind === "tax-verify") {
        await tax.mutateAsync({
          action: "verify",
          listingId: selected.listing.id,
          taxCode: taxCode.trim(),
        });
        message = "Tax code verified.";
      } else {
        await tax.mutateAsync({
          action: "clear",
          listingId: selected.listing.id,
          reason: reason.trim(),
        });
        message = "Tax code cleared.";
      }
      if (!current()) return;
      setNotice(message);
      setAction(null);
      setReason("");
      setTaxCode("");
      await refreshQueue(true);
      if (current() && selected.kind.startsWith("tax-"))
        await utils.admin.getTaxReadiness
          .invalidate(undefined, { refetchType: "none" })
          .catch(() => undefined);
    } catch (error) {
      if (current()) {
        reviewRequired.current = true;
        setReviewTarget(selected.listing);
        setActionError(
          `${getErrorMessage(error)} The outcome is not confirmed here. Refresh listing status before another attempt.`,
        );
      }
    } finally {
      working.current = false;
      if (current()) setBusy(false);
    }
  }
  function taxState(listing: Listing) {
    return (
      <div className="space-y-1">
        <Badge
          variant={listing.taxCodeStatus === "verified" ? "success" : "outline"}
        >
          {listing.taxCodeStatus === "verified"
            ? "Tax code verified"
            : listing.taxCodeStatus === "pending_review"
              ? "Tax review pending"
              : "Tax code unassigned"}
        </Badge>
        {listing.stripeTaxCode && (
          <p className="break-all font-mono text-xs text-muted-foreground">
            {listing.stripeTaxCode}
          </p>
        )}
      </div>
    );
  }
  function actions(listing: Listing) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={control}
            aria-label={`Actions for ${listing.title}`}
            disabled={unavailable}
          >
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              if (current() && !working.current && !reviewRequired.current) {
                const opening = {
                  listingId: listing.id,
                  opening: ++specSequence.current,
                };
                specTarget.current = opening;
                setSpecReview(opening);
              }
            }}
          >
            Review product specifications
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={`/listings/${listing.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View Listing
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openAction("tax-verify", listing)}>
            Review tax code
          </DropdownMenuItem>
          {listing.taxCodeStatus === "verified" && (
            <DropdownMenuItem onSelect={() => openAction("tax-clear", listing)}>
              Clear tax code
            </DropdownMenuItem>
          )}
          {listing.status === "active" && (
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => openAction("flag", listing)}
            >
              Flag Listing
            </DropdownMenuItem>
          )}
          {listing.status === "archived" && (
            <DropdownMenuItem onSelect={() => openAction("restore", listing)}>
              Unflag / Restore
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  const columns: ColumnDef<Listing>[] = [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <span className="block max-w-xs break-words">{row.original.title}</span>
      ),
    },
    {
      id: "seller",
      header: "Seller",
      cell: ({ row }) =>
        row.original.seller.businessName || row.original.seller.name,
    },
    {
      accessorKey: "askPricePerSqFt",
      header: "Price / sq ft",
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
      cell: ({ row }) => taxState(row.original),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: "actions",
      enableHiding: false,
      header: "Actions",
      cell: ({ row }) => actions(row.original),
    },
  ];
  const title =
    action?.kind === "flag"
      ? "Flag Listing"
      : action?.kind === "restore"
        ? "Restore Listing"
        : action?.kind === "tax-verify"
          ? "Verify listing tax code"
          : "Clear listing tax code";
  const commitLabel =
    action?.kind === "flag"
      ? "Flag Listing"
      : action?.kind === "restore"
        ? "Restore Listing"
        : action?.kind === "tax-verify"
          ? "Verify code"
          : "Clear code";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Listing Management</h1>
        <p className="mt-1 text-muted-foreground">
          Find inventory and review its marketplace status.
        </p>
      </div>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (!current() || working.current) return;
          setSearch(searchDraft.trim());
          setPage(1);
        }}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="listing-search">Search listing title</Label>
          <Input
            id="listing-search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            disabled={busy}
            className="min-h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="listing-status-filter">Status</Label>
          <select
            id="listing-status-filter"
            value={status}
            disabled={busy}
            className="min-h-11 w-full rounded-md border bg-background px-3"
            onChange={(event) => {
              if (isFilter(event.target.value) && !working.current) {
                setStatus(event.target.value);
                setPage(1);
              }
            }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="draft">Draft</option>
            <option value="sold">Sold</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <Button type="submit" disabled={busy} className={control}>
          Search listings
        </Button>
      </form>
      {notice && (
        <div role="status" className="space-y-2 rounded-md border p-3 text-sm">
          <p>{notice}</p>
          {refreshFailed && (
            <p>
              The listing list could not be refreshed. Retry the list without
              repeating an accepted action.
            </p>
          )}
        </div>
      )}
      {reviewTarget && !action && (
        <div role="alert" className="space-y-2 rounded-md border p-4">
          <p>{actionError}</p>
          <Button
            className={control}
            variant="outline"
            onClick={() => void reviewListing()}
            disabled={busy}
          >
            Refresh listing status
          </Button>
        </div>
      )}
      {query.isError ? (
        <QueryErrorState
          title="Listings unavailable"
          description="Listing status could not be checked. Refresh the list before taking action."
          onRetry={() => void refreshQueue()}
          isRetrying={query.isFetching || busy}
        />
      ) : query.isLoading || !query.data ? (
        <StatePanelLoading label="Loading listings" />
      ) : (
        <DataTable
          columns={columns}
          data={query.data.listings}
          serverPagination={{
            page,
            pageSize: LIMIT,
            total: query.data.total,
            totalPages: query.data.totalPages,
            isFetching: query.isFetching || busy,
            onPageChange: (next) => {
              if (current() && !working.current) setPage(next);
            },
          }}
          renderMobileRow={(listing) => (
            <article
              aria-label={`Listing ${listing.title}`}
              className="min-w-0 space-y-3"
            >
              <h2 className="break-words font-semibold">{listing.title}</h2>
              <p className="break-words text-sm">
                {listing.seller.businessName || listing.seller.name}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">
                  {formatCurrency(listing.askPricePerSqFt)} / sq ft
                </span>
                <ListingStatusBadge status={listing.status} />
              </div>
              {taxState(listing)}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">
                  {formatDate(listing.createdAt)}
                </span>
                {actions(listing)}
              </div>
            </article>
          )}
        />
      )}
      <Dialog
        open={specReview !== null}
        onOpenChange={(open) => {
          if (!open) {
            specTarget.current = null;
            setSpecReview(null);
          }
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review product specifications</DialogTitle>
          </DialogHeader>
          {specReview && (
            <SpecificationReview
              key={specReview.opening}
              listingId={specReview.listingId}
              onComplete={() => {
                if (!current() || specTarget.current !== specReview) return;
                specTarget.current = null;
                setSpecReview(null);
                setNotice("Specification evidence review saved.");
                void refreshQueue(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !working.current) setAction(null);
        }}
      >
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="break-words font-medium">
                {action?.listing.title}
              </span>
              <br />
              {action?.kind === "flag"
                ? "Remove this listing from the marketplace and notify the seller. Provide a reason."
                : action?.kind === "restore"
                  ? "Restore the reviewed listing if it still meets publishing requirements and notify the seller. Prices and expiry stay unchanged. The seller must still confirm availability when due before buyers can see it."
                  : action?.kind === "tax-verify"
                    ? "Enter only the Stripe Tax code approved for this flooring inventory. This administrative decision is audited; PlankMarket will not infer or auto-assign a category."
                    : "Clearing the code immediately makes this listing ineligible for tax-enabled checkout. Record why the prior verification is no longer valid."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {action?.kind === "tax-verify" ? (
            <div className="space-y-2">
              <Label htmlFor="listingTaxCode">Stripe Tax code</Label>
              <Input
                id="listingTaxCode"
                value={taxCode}
                onChange={(event) => setTaxCode(event.target.value)}
                disabled={busy || !!reviewTarget}
                autoComplete="off"
                placeholder="txcd_..."
              />
            </div>
          ) : action?.kind !== "restore" ? (
            <div className="space-y-2">
              <Label
                htmlFor={
                  action?.kind === "flag" ? "flagReason" : "taxClearReason"
                }
              >
                Reason
              </Label>
              <Textarea
                id={action?.kind === "flag" ? "flagReason" : "taxClearReason"}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={busy || !!reviewTarget}
                rows={3}
                maxLength={500}
              />
              <p className="text-sm text-muted-foreground">
                {action?.kind === "tax-clear" ? "At least 10 characters. " : ""}
                Up to 500 characters.
              </p>
            </div>
          ) : null}
          {actionError && (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          )}
          {reviewTarget && (
            <Button
              variant="outline"
              className={control}
              onClick={() => void reviewListing()}
              disabled={busy}
            >
              Refresh listing status
            </Button>
          )}
          {!eligible && action && (
            <p role="status" className="text-sm">
              The current listing status does not allow this action.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className={control} disabled={busy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={control}
              disabled={unavailable || !eligible || !valid}
              onClick={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {busy ? "Working…" : commitLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
