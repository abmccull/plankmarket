import type { Metadata } from "next";
import { Suspense } from "react";
import { createServerCaller } from "@/lib/trpc/server";
import { ListingsBrowseClient } from "@/components/search/listings-browse-client";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  parseListingSearchParams,
  type ListingSearchParams,
} from "@/lib/marketplace/listing-search-params";

interface PageProps {
  searchParams: Promise<ListingSearchParams>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const { materialType, page } = parseListingSearchParams(await searchParams);

  const materialLabels: Record<string, string> = {
    hardwood: "Hardwood",
    engineered: "Engineered",
    laminate: "Laminate",
    vinyl_lvp: "Vinyl/LVP",
    bamboo: "Bamboo",
    tile: "Tile",
  };

  const materialLabel =
    materialType && materialType.length === 1
      ? materialLabels[materialType[0]]
      : undefined;
  const title = materialLabel
    ? `${materialLabel} Flooring for Sale`
    : "Browse Surplus Flooring Listings";
  const description = materialLabel
    ? `Find ${materialLabel.toLowerCase()} flooring deals with seller verification and freight readiness shown on every result. Browse surplus, overstock, and closeout inventory at wholesale prices.`
    : "Browse surplus flooring listings with seller verification and freight readiness shown on every result. Filter by material, condition, price, lot format, and location.";

  return {
    title,
    description,
    alternates: {
      canonical: page > 1 ? `/listings?page=${page}` : "/listings",
    },
  };
}

async function ListingsContent({
  searchParams,
}: {
  searchParams: ListingSearchParams;
}) {
  const parsed = parseListingSearchParams(searchParams);
  const caller = await createServerCaller();
  const [listData, sponsored] = await Promise.all([
    caller.listing.list(parsed),
    // Promotion inventory is an enhancement. A promotion lookup failure should
    // not take down otherwise healthy organic marketplace results.
    caller.promotion.getFeatured({ limit: 5 }).catch(() => [] as never[]),
  ]);

  return (
    <ListingsBrowseClient
      initialData={listData}
      sponsoredListings={sponsored}
      initialParams={{
        page: parsed.page,
        limit: parsed.limit,
        sort: parsed.sort,
        query: parsed.query,
        materialType: parsed.materialType?.[0],
        condition: parsed.condition?.[0],
      }}
    />
  );
}

export default async function ListingsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <Suspense
      fallback={
        <div
          className="container mx-auto px-4 py-8"
          role="status"
          aria-live="polite"
          aria-label="Loading public marketplace listings"
        >
          <div className="mb-6 max-w-2xl space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Loading marketplace
            </p>
            <h1 className="text-2xl font-semibold">Checking current public inventory</h1>
            <p className="text-sm text-muted-foreground">
              We are fetching the latest browse results for your current URL filters.
              Freight and delivered totals are never estimated here before a listing is loaded.
            </p>
          </div>
          <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <Card className="hidden lg:block">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Filter state
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-5/6" />
                <Skeleton className="h-8 w-4/6" />
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Skeleton className="h-10 w-full max-w-xl" />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Card key={index}>
                    <CardContent className="space-y-4 p-4">
                      <Skeleton className="aspect-[4/3] w-full rounded-xl" />
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      }
    >
      <ListingsContent searchParams={params} />
    </Suspense>
  );
}
