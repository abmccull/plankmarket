"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { ListingCard } from "@/components/search/listing-card";
import { Button } from "@/components/ui/button";
import {
  QueryErrorState,
  StatePanel,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { Heart, Grid3X3, List } from "lucide-react";
import { cn } from "@/lib/utils";

const statusConfig = {
  delivered: { label: "Delivered", variant: "success" as const },
  shipped: { label: "Shipped", variant: "default" as const },
  order_pending: { label: "Order Pending", variant: "warning" as const },
  offer_accepted: { label: "Offer Accepted", variant: "success" as const },
  offer_pending: { label: "Offer Pending", variant: "warning" as const },
  sold: { label: "Sold", variant: "destructive" as const },
  available: { label: "Available", variant: "secondary" as const },
} as const;

export default function BuyerWatchlistPage() {
  const { user } = useAuthStore();
  return (
    <WatchlistWorkspace
      key={user?.id ?? "anonymous"}
      actorId={user?.id ?? null}
    />
  );
}

function WatchlistWorkspace({ actorId }: { actorId: string | null }) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [notice, setNotice] = useState("");
  const pendingRef = useRef(false),
    mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const isCurrent = () =>
    mountedRef.current && useAuthStore.getState().user?.id === actorId;
  const utils = trpc.useUtils();
  const input = { page, limit: 50 };
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.watchlist.getMyWatchlist.useQuery(input, { enabled: !!actorId });
  const removeMutation = trpc.watchlist.remove.useMutation();
  if (data && !isError && page > Math.max(1, data.totalPages))
    setPage(Math.max(1, data.totalPages));
  const actionsDisabled = pending || isFetching || isError || actionError;

  const refresh = async () => {
    const result = await refetch();
    if (isCurrent() && !result.error) setActionError(false);
  };
  const remove = async (listingId: string) => {
    if (pendingRef.current || actionsDisabled || !isCurrent()) return;
    pendingRef.current = true;
    setPending(true);
    setNotice("");
    let accepted = false;
    try {
      await utils.watchlist.getMyWatchlist.cancel();
      if (!isCurrent()) return;
      await removeMutation.mutateAsync({ listingId });
      if (!isCurrent()) return;
      accepted = true;
      setNotice("Removed from watchlist.");
      await utils.watchlist.getMyWatchlist.cancel();
      if (!isCurrent()) return;
      // Other visited pages must not retain fresh totals or shifted rows.
      await utils.watchlist.getMyWatchlist.invalidate(undefined, {
        refetchType: "none",
      });
      if (!isCurrent()) return;
      utils.watchlist.getMyWatchlist.setData(input, (old) => {
        if (!old) return old;
        const items = old.items.filter((item) => item.listingId !== listingId);
        const total = Math.max(
          0,
          old.total - (old.items.length - items.length),
        );
        return {
          ...old,
          items,
          total,
          totalPages: Math.ceil(total / input.limit),
          hasMore: input.page * input.limit < total,
        };
      });
      await refresh();
    } catch {
      if (isCurrent()) {
        setActionError(true);
        // The server may have accepted an uncertain removal. Pause mutations
        // and mark every page stale without automatically resending or reading.
        void utils.watchlist.getMyWatchlist
          .invalidate(undefined, { refetchType: "none" })
          .catch(() => {});
        if (accepted)
          setNotice(
            "Removed from watchlist. Refresh to check the remaining saved lots.",
          );
      }
    } finally {
      pendingRef.current = false;
      if (isCurrent()) setPending(false);
    }
  };

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Watchlist</h1>
          <p className="mt-1 text-muted-foreground">
            Listings you are keeping an eye on
          </p>
        </div>
        {data && data.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
            <span className="text-sm text-muted-foreground">
              {data.total} {data.total === 1 ? "item" : "items"}
              {isError ? " last loaded" : ""}
            </span>
            <div
              className="flex rounded-md border"
              role="group"
              aria-label="Watchlist layout"
            >
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-11 w-11 rounded-r-none",
                  viewMode === "grid" && "bg-accent",
                )}
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                aria-pressed={viewMode === "grid"}
              >
                <Grid3X3 className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-11 w-11 rounded-l-none",
                  viewMode === "list" && "bg-accent",
                )}
                onClick={() => setViewMode("list")}
                aria-label="List view"
                aria-pressed={viewMode === "list"}
              >
                <List className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </div>
      {notice && <p role="status">{notice}</p>}
      {actionError && (
        <div role="alert" className="space-y-2 rounded-md border p-3">
          <p>
            {notice
              ? "The remaining watchlist could not be refreshed."
              : "Removal is not confirmed. Refresh your watchlist before trying again."}
          </p>
          <Button
            variant="outline"
            className="h-auto min-h-11 whitespace-normal"
            disabled={pending || isFetching}
            onClick={() => void refresh()}
          >
            Check watchlist status
          </Button>
        </div>
      )}
      {isError && (
        <QueryErrorState
          title="We couldn't load your watchlist"
          description="Previously loaded saved lots may appear below. Refresh before removing another lot."
          onRetry={() => void refresh()}
          isRetrying={isFetching}
          secondaryAction={{ label: "Browse listings", href: "/listings" }}
        />
      )}
      {isLoading ? (
        <StatePanelLoading label="Loading your watchlist" rows={6} />
      ) : !data ? null : data.total === 0 && !isError ? (
        <StatePanel
          icon={Heart}
          title="Save promising lots for later"
          description="Use the heart on any listing to build a shortlist and return when you are ready to contact a seller or buy."
          primaryAction={{ label: "Browse listings", href: "/listings" }}
        />
      ) : (
        <div
          className={cn(
            "grid gap-4",
            viewMode === "grid"
              ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              : "grid-cols-1",
          )}
          aria-label="Saved listings"
        >
          {data.items.map((item) => (
            <fieldset
              key={item.id}
              disabled={actionsDisabled}
              className="min-w-0"
            >
              <legend className="sr-only">
                Saved lot: {item.listing.title}
              </legend>
              <ListingCard
                listing={item.listing}
                isWatchlisted
                onWatchlistToggle={(listingId) => void remove(listingId)}
                statusBadge={statusConfig[item.buyerStatus]}
              />
            </fieldset>
          ))}
        </div>
      )}
      {data && data.total > 0 && (
        <nav
          aria-label="Watchlist pages"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <Button
            variant="outline"
            className="h-auto min-h-11 whitespace-normal"
            disabled={page <= 1 || pending || isFetching}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous saved lots
          </Button>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Page {page} of {Math.max(1, data.totalPages)} · {data.total} saved
            lots
          </p>
          <Button
            variant="outline"
            className="h-auto min-h-11 whitespace-normal"
            disabled={page >= data.totalPages || pending || isFetching}
            onClick={() => setPage((value) => value + 1)}
          >
            Next saved lots
          </Button>
        </nav>
      )}
    </div>
  );
}
