import type { Metadata } from "next";
import { Suspense } from "react";
import { createServerCaller } from "@/lib/trpc/server";
import { ListingsBrowseClient } from "@/components/search/listings-browse-client";
import { Loader2 } from "lucide-react";
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

  const materialLabel = materialType ? materialLabels[materialType] : undefined;
  const title = materialLabel
    ? `${materialLabel} Flooring for Sale`
    : "Browse Surplus Flooring Listings";
  const description = materialLabel
    ? `Find ${materialLabel.toLowerCase()} flooring deals from verified sellers. Browse surplus, overstock, and closeout inventory at wholesale prices.`
    : "Browse surplus flooring listings from verified sellers. Filter by material, condition, price, and location. Hardwood, engineered, vinyl, laminate, and more.";

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
    caller.listing.list({
      page: parsed.page,
      limit: parsed.limit,
      sort: parsed.sort,
      query: parsed.query,
      materialType: parsed.materialType ? [parsed.materialType] : undefined,
      condition: parsed.condition ? [parsed.condition] : undefined,
    }),
    // Promotion inventory is an enhancement. A promotion lookup failure should
    // not take down otherwise healthy organic marketplace results.
    caller.promotion.getFeatured({ limit: 5 }).catch(() => [] as never[]),
  ]);

  return (
    <ListingsBrowseClient
      initialData={listData}
      sponsoredListings={sponsored}
      initialParams={{
        ...parsed,
      }}
    />
  );
}

export default async function ListingsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      }
    >
      <ListingsContent searchParams={params} />
    </Suspense>
  );
}
