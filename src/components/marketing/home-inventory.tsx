import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { createServerCaller } from "@/lib/trpc/server";
import { ListingCard } from "@/components/search/listing-card";
import { Button } from "@/components/ui/button";
import { InventoryRetryButton } from "@/components/marketing/inventory-retry-button";

export function HomeInventorySkeleton() {
  return (
    <div role="status" aria-label="Loading current flooring lots">
      <p className="mb-4 text-sm text-muted-foreground">
        Loading current flooring lots…
      </p>
      <div
        className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        aria-hidden="true"
      >
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-xl border motion-safe:animate-pulse"
          >
            <div className="aspect-[4/3] bg-muted" />
            <div className="space-y-3 p-4">
              <div className="h-5 w-4/5 rounded bg-muted" />
              <div className="h-7 w-2/5 rounded bg-muted" />
              <div className="h-16 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function HomeInventory() {
  let result;
  try {
    // Use the same public procedure as browse: masking, territories and listing
    // freshness remain server-owned. Do not add a cross-user response cache.
    const caller = await createServerCaller();
    result = await caller.listing.list({
      page: 1,
      limit: 6,
      sort: "date_newest",
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error("[homepage] Inventory read failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return (
      <div
        data-home-inventory="error"
        className="rounded-xl border border-destructive/30 bg-card p-6 sm:p-8"
      >
        <div role="alert">
          <h3 className="font-display text-xl">
            We couldn&apos;t load current lots.
          </h3>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Try again, or open the full marketplace to continue browsing.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <InventoryRetryButton />
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/listings">Browse all flooring</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (result.items.length === 0) {
    return (
      <div
        data-home-inventory="empty"
        className="rounded-xl border bg-card p-6 sm:p-8"
      >
        <PackageSearch
          className="mb-4 h-8 w-8 text-primary"
          aria-hidden="true"
        />
        <h3 className="font-display text-xl">
          No lots are available to show right now.
        </h3>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Looking for a particular material or quantity? Post a buyer request,
          or explore the marketplace as sellers publish new inventory.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild className="min-h-11">
            <Link href="/buyer/requests/new">Post a buyer request</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/listings">Browse all flooring</Link>
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          A buyer account is needed to post a request. Browsing is open to
          everyone.
        </p>
      </div>
    );
  }

  return (
    <div
      data-home-inventory="ready"
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      {result.items.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
