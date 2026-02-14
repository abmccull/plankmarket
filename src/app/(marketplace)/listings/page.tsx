import type { Metadata } from "next";
import { Suspense } from "react";
import { createServerCaller } from "@/lib/trpc/server";
import { ListingsBrowseClient } from "@/components/search/listings-browse-client";
import { Loader2 } from "lucide-react";
import type { SortOption, MaterialType, ConditionType } from "@/types";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const materialType =
    typeof params.materialType === "string" ? params.materialType : undefined;
  const page = typeof params.page === "string" ? parseInt(params.page) : 1;

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
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const page =
    typeof searchParams.page === "string" ? parseInt(searchParams.page) : 1;
  const limit =
    typeof searchParams.limit === "string"
      ? parseInt(searchParams.limit)
      : 24;
  const sort =
    typeof searchParams.sort === "string" ? searchParams.sort : "date_newest";
  const query =
    typeof searchParams.query === "string" ? searchParams.query : undefined;
  const materialType =
    typeof searchParams.materialType === "string"
      ? [searchParams.materialType]
      : undefined;
  const condition =
    typeof searchParams.condition === "string"
      ? [searchParams.condition]
      : undefined;

  const defaultData = {
    items: [] as never[],
    total: 0,
    totalPages: 0,
    page: 1,
    limit: 24,
    hasMore: false,
  };

  try {
    const caller = await createServerCaller();
    const [listData, sponsored] = await Promise.all([
      caller.listing.list({
        page,
        limit,
        sort: sort as SortOption,
        query,
        materialType: materialType as MaterialType[] | undefined,
        condition: condition as ConditionType[] | undefined,
      }),
      caller.promotion.getFeatured({ limit: 5 }).catch(() => [] as never[]),
    ]);

    return (
      <ListingsBrowseClient
        initialData={listData}
        sponsoredListings={sponsored}
        initialParams={{
          page,
          limit,
          sort,
          query,
          materialType: materialType?.[0],
          condition: condition?.[0],
        }}
      />
    );
  } catch {
    return (
      <ListingsBrowseClient
        initialData={defaultData}
        sponsoredListings={[]}
        initialParams={{
          page,
          limit,
          sort,
          query,
          materialType: materialType?.[0],
          condition: condition?.[0],
        }}
      />
    );
  }
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
