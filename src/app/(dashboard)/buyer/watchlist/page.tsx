"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { ListingCard } from "@/components/search/listing-card";
import { Button } from "@/components/ui/button";
import { Loader2, Heart, Grid3X3, List } from "lucide-react";
import { toast } from "sonner";
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.watchlist.getMyWatchlist.useQuery({
    page: 1,
    limit: 50,
  });

  const removeMutation = trpc.watchlist.remove.useMutation({
    onMutate: async ({ listingId }) => {
      await utils.watchlist.getMyWatchlist.cancel();
      const prev = utils.watchlist.getMyWatchlist.getData({ page: 1, limit: 50 });

      utils.watchlist.getMyWatchlist.setData({ page: 1, limit: 50 }, (old) => {
        if (!old) return old;
        const filtered = old.items.filter((i) => i.listingId !== listingId);
        return { ...old, items: filtered, total: filtered.length };
      });

      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        utils.watchlist.getMyWatchlist.setData({ page: 1, limit: 50 }, context.prev);
      }
      toast.error("Failed to remove from watchlist");
    },
    onSuccess: () => {
      toast.success("Removed from watchlist");
    },
    onSettled: () => {
      utils.watchlist.getMyWatchlist.invalidate();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">Watchlist</h1>
          <p className="text-muted-foreground mt-1">
            Listings you are keeping an eye on
          </p>
        </div>
        {data && data.items.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {data.items.length} {data.items.length === 1 ? "item" : "items"}
            </span>
            <div className="flex border rounded-md">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 rounded-r-none",
                  viewMode === "grid" && "bg-accent"
                )}
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                aria-pressed={viewMode === "grid"}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 rounded-l-none",
                  viewMode === "list" && "bg-accent"
                )}
                onClick={() => setViewMode("list")}
                aria-label="List view"
                aria-pressed={viewMode === "list"}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data?.items.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <Heart className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Your watchlist is empty</h3>
          <p className="text-muted-foreground mt-1">
            Browse listings and click the heart icon to save items here.
          </p>
        </div>
      ) : (
        <div className={cn(
          "grid gap-4",
          viewMode === "grid"
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            : "grid-cols-1"
        )}>
          {data?.items.map((item) => (
            <ListingCard
              key={item.id}
              listing={item.listing}
              isWatchlisted
              onWatchlistToggle={(listingId) => removeMutation.mutate({ listingId })}
              statusBadge={statusConfig[item.buyerStatus]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
