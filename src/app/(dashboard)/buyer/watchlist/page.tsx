"use client";

import { trpc } from "@/lib/trpc/client";
import { ListingCard } from "@/components/search/listing-card";
import { Loader2, Heart } from "lucide-react";

export default function BuyerWatchlistPage() {
  const { data, isLoading } = trpc.watchlist.getMyWatchlist.useQuery({
    page: 1,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Watchlist</h1>
        <p className="text-muted-foreground mt-1">
          Listings you are keeping an eye on
        </p>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.items.map((item) => (
            <ListingCard key={item.id} listing={item.listing} />
          ))}
        </div>
      )}
    </div>
  );
}
