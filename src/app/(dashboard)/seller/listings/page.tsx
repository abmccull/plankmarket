"use client";

import { Suspense, useState } from "react";
import { ListingImage as Image } from "@/components/listings/listing-image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ListingStatusBadge } from "@/components/dashboard/status-badge";
import {
  QueryErrorState,
  StatePanel,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { formatCurrency, formatSqFt } from "@/lib/utils";
import { getListingFreshnessStatus } from "@/lib/listing-freshness";
import {
  Plus,
  Package,
  Eye,
  Heart,
  ExternalLink,
  Rocket,
  FileSpreadsheet,
  Search,
  Loader2,
} from "lucide-react";
import { BoostModal } from "@/components/promotions/boost-modal";
import { PromotionBadge } from "@/components/promotions/promotion-badge";
import { FEATURES } from "@/lib/feature-flags";
import { toast } from "sonner";
import type { ListingStatus, PromotionTier } from "@/types";

const FILTERS = [
  ["all", "All listings"],
  ["active", "Active"],
  ["needs_confirmation", "Needs confirmation"],
  ["draft", "Drafts"],
  ["sold", "Sold"],
  ["expired", "Expired"],
  ["archived", "Archived"],
] as const;
type ListingAction = {
  kind: "publish" | "reconfirm";
  id: string;
  title: string;
  quantity: number;
  condition: string;
  updatedAt: Date;
};

function SellerInventoryContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requestedFilter = params.get("status") ?? "all";
  const filter = FILTERS.some(([value]) => value === requestedFilter)
    ? requestedFilter
    : "all";
  const queryText = (params.get("q") ?? "").slice(0, 120);
  const requestedPage = Number(params.get("page"));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const [action, setAction] = useState<ListingAction | null>(null);
  const [boostListing, setBoostListing] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const utils = trpc.useUtils();
  const query = trpc.listing.getMyListings.useQuery({
    status:
      filter === "all"
        ? undefined
        : filter === "needs_confirmation"
          ? "active"
          : (filter as ListingStatus),
    needsConfirmation: filter === "needs_confirmation",
    query: queryText || undefined,
    page,
    limit: 20,
  });
  const updateParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const search = next.toString();
    router.push(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };
  const refresh = async () => {
    await Promise.all([
      utils.listing.getMyListings.invalidate(),
      utils.listing.getSellerStats.invalidate(),
    ]);
    setAction(null);
  };
  const publish = trpc.listing.publishBulk.useMutation({
    onSuccess: async (result) => {
      if (result.publishedCount > 0) toast.success("Listing published");
      else if (result.alreadyPublishedIds.length)
        toast.success("Listing is already published");
      else {
        toast.error(
          result.skippedDetails[0]?.message ??
            "Finish this draft before publishing.",
        );
        return;
      }
      if (result.alertsPending)
        toast.info("Your listing is live. Buyer alerts are queued for retry.");
      await refresh();
    },
    onError: async (error) => {
      toast.error(error.message);
      if (error.data?.code === "CONFLICT") {
        await utils.listing.getMyListings.invalidate();
        setAction(null);
      }
    },
  });
  const reconfirm = trpc.listing.reconfirm.useMutation({
    onSuccess: async () => {
      toast.success("Availability confirmed");
      await refresh();
    },
    onError: async (error) => {
      toast.error(error.message);
      await utils.listing.getMyListings.invalidate();
      if (error.data?.code === "CONFLICT") setAction(null);
    },
  });
  const acting = publish.isPending || reconfirm.isPending;
  const totalPages = Math.max(1, query.data?.totalPages ?? 1);
  const hasFilters = filter !== "all" || !!queryText;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Listings</h1>
          <p className="mt-1 text-muted-foreground">
            Keep inventory accurate, finish drafts, and get ready for the next
            sale.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/seller/listings/bulk-upload">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Bulk Upload
            </Link>
          </Button>
          <Button asChild>
            <Link href="/seller/listings/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Listing
            </Link>
          </Button>
        </div>
      </header>

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          updateParams({ q: String(data.get("q") ?? "").trim(), page: null });
        }}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="listing-search">Search your inventory</Label>
          <Input
            key={queryText}
            id="listing-search"
            name="q"
            defaultValue={queryText}
            maxLength={120}
            placeholder="Listing title, brand, or model"
            type="search"
          />
        </div>
        <Button type="submit" variant="outline">
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>
        <div className="space-y-2">
          <Label htmlFor="listing-status">Show</Label>
          <select
            id="listing-status"
            className="min-h-11 w-full rounded-md border border-input bg-background px-3 sm:min-w-48"
            value={filter}
            onChange={(event) =>
              updateParams({
                status:
                  event.target.value === "all" ? null : event.target.value,
                page: null,
              })
            }
          >
            {FILTERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </form>

      {filter === "needs_confirmation" && (
        <p className="rounded-md border bg-muted/30 p-3 text-sm">
          Confirm stock that is still available. Overdue listings stay hidden
          from buyers until you confirm. Quantity and active order reservations
          are unchanged.
        </p>
      )}

      {query.isLoading ? (
        <StatePanelLoading label="Loading your listings" rows={4} />
      ) : query.isError || !query.data ? (
        <QueryErrorState
          title="Your listings could not load"
          description="Your inventory has not changed. Try again to see the latest availability."
          onRetry={() => void query.refetch()}
          isRetrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <StatePanel
          icon={Package}
          title={
            page > 1
              ? "No listings on this page"
              : hasFilters
                ? "No listings match"
                : "Start with your first listing"
          }
          description={
            page > 1
              ? "Inventory may have changed. Return to the first page."
              : hasFilters
                ? "Try another search or clear your filters."
                : "Add flooring inventory, clear photos, and pickup details so buyers can order with confidence."
          }
          primaryAction={
            hasFilters || page > 1
              ? {
                  label: page > 1 ? "First page" : "Clear filters",
                  onClick: () =>
                    updateParams(
                      page > 1
                        ? { page: null }
                        : { q: null, status: null, page: null },
                    ),
                }
              : { label: "Create listing", href: "/seller/listings/new" }
          }
        />
      ) : (
        <>
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground"
          >
            {query.data.total} listing{query.data.total === 1 ? "" : "s"}
            {query.isFetching ? " · Updating…" : ""}
          </p>
          <ul
            className="divide-y rounded-lg border bg-card"
            aria-label="Your inventory"
          >
            {query.data.items.map((listing) => {
              const freshness = getListingFreshnessStatus(listing);
              const needsConfirmation =
                listing.status === "active" && freshness !== "fresh";
              const hidden =
                listing.status === "active" &&
                (freshness === "overdue" || freshness === "unconfirmed");
              const isDraft = listing.status === "draft";
              const hasPhoto = listing.media.length > 0;
              return (
                <li key={listing.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                      {listing.media[0] ? (
                        <Image
                          src={listing.media[0].url}
                          alt=""
                          width={64}
                          height={64}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package
                          className="h-6 w-6 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <ListingStatusBadge
                          status={listing.status as ListingStatus}
                        />
                        {needsConfirmation && (
                          <Badge variant={hidden ? "destructive" : "outline"}>
                            {hidden ? "Hidden · confirm stock" : "Confirm soon"}
                          </Badge>
                        )}
                        {listing.promotionTier && (
                          <PromotionBadge
                            tier={listing.promotionTier as PromotionTier}
                          />
                        )}
                      </div>
                      <h2 className="break-words font-semibold leading-snug">
                        {listing.title}
                      </h2>
                      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <div>
                          <dt className="sr-only">Available quantity</dt>
                          <dd>{formatSqFt(listing.totalSqFt)}</dd>
                        </div>
                        <div>
                          <dt className="sr-only">Asking price</dt>
                          <dd>
                            {formatCurrency(listing.askPricePerSqFt)}/sq ft
                          </dd>
                        </div>
                        <div className="flex items-center gap-1">
                          <dt>
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="sr-only">Views</span>
                          </dt>
                          <dd>{listing.viewsCount}</dd>
                        </div>
                        <div className="flex items-center gap-1">
                          <dt>
                            <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="sr-only">Watchlists</span>
                          </dt>
                          <dd>{listing.watchlistCount}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  {isDraft && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {hasPhoto
                        ? "Review your details, then publish when this inventory is ready to sell."
                        : "Add at least one clear product photo to finish this draft."}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                    <Button
                      asChild
                      variant={isDraft && !hasPhoto ? "default" : "outline"}
                      className="min-h-11"
                    >
                      <Link href={`/seller/listings/${listing.id}/edit`}>
                        {isDraft ? "Finish listing" : "Edit listing"}
                      </Link>
                    </Button>
                    {isDraft && hasPhoto && (
                      <Button
                        disabled={acting}
                        className="min-h-11"
                        onClick={() => {
                          publish.reset();
                          reconfirm.reset();
                          setAction({
                            kind: "publish",
                            id: listing.id,
                            title: listing.title,
                            quantity: listing.totalSqFt,
                            condition: listing.condition,
                            updatedAt: listing.updatedAt,
                          });
                        }}
                      >
                        Publish listing
                      </Button>
                    )}
                    {needsConfirmation && (
                      <Button
                        disabled={acting}
                        className="min-h-11"
                        onClick={() => {
                          publish.reset();
                          reconfirm.reset();
                          setAction({
                            kind: "reconfirm",
                            id: listing.id,
                            title: listing.title,
                            quantity: listing.totalSqFt,
                            condition: listing.condition,
                            updatedAt: listing.updatedAt,
                          });
                        }}
                      >
                        Confirm availability
                      </Button>
                    )}
                    {listing.status === "active" && !hidden && (
                      <Button asChild variant="ghost" className="min-h-11">
                        <Link href={`/listings/${listing.id}`}>
                          <ExternalLink
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                          />
                          View listing
                          <span className="sr-only">: {listing.title}</span>
                        </Link>
                      </Button>
                    )}
                    {FEATURES.PROMOTIONS_ENABLED &&
                      listing.status === "active" &&
                      !listing.promotionTier && (
                        <Button
                          variant="ghost"
                          className="min-h-11"
                          onClick={() =>
                            setBoostListing({
                              id: listing.id,
                              title: listing.title,
                            })
                          }
                        >
                          <Rocket className="mr-2 h-4 w-4" aria-hidden="true" />
                          Boost
                        </Button>
                      )}
                  </div>
                </li>
              );
            })}
          </ul>
          <nav
            aria-label="Listing pages"
            className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
          >
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1 || query.isFetching}
                onClick={() =>
                  updateParams({ page: page > 2 ? String(page - 1) : null })
                }
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={!query.data.hasMore || query.isFetching}
                onClick={() => updateParams({ page: String(page + 1) })}
              >
                Next
              </Button>
            </div>
          </nav>
        </>
      )}

      <Dialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !acting) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.kind === "publish"
                ? "Ready to publish?"
                : "Confirm this inventory is available"}
            </DialogTitle>
            <DialogDescription>{action?.title}</DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            {action?.kind === "publish"
              ? "Confirm that the quantity, condition, price, photos, and pickup information are accurate. Buyers will be able to find this listing."
              : "Confirm the remaining quantity and product condition are still accurate. This does not change quantities or inventory reserved by orders."}
          </p>
          {action && (
            <p className="text-sm font-medium">
              {formatSqFt(action.quantity)} remaining ·{" "}
              {action.condition.replaceAll("_", " ")}
            </p>
          )}
          {(publish.error || reconfirm.error) && (
            <p role="alert" className="text-sm text-destructive">
              {(publish.error ?? reconfirm.error)?.message}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={acting}
              onClick={() => setAction(null)}
            >
              Keep reviewing
            </Button>
            <Button
              disabled={acting}
              onClick={() => {
                if (!action) return;
                if (action.kind === "publish")
                  publish.mutate({
                    listingIds: [action.id],
                    expectedUpdatedAt: { [action.id]: action.updatedAt },
                  });
                else
                  reconfirm.mutate({
                    id: action.id,
                    expectedUpdatedAt: action.updatedAt,
                  });
              }}
            >
              {acting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {action?.kind === "publish"
                ? "Publish listing"
                : "Yes, still available"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {boostListing && (
        <BoostModal
          listingId={boostListing.id}
          listingTitle={boostListing.title}
          open
          onOpenChange={(open) => {
            if (!open) setBoostListing(null);
          }}
        />
      )}
    </div>
  );
}

export default function SellerListingsPage() {
  return <Suspense fallback={<StatePanelLoading label="Loading your inventory" rows={4} />}><SellerInventoryContent /></Suspense>;
}
