import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { createServerCaller } from "@/lib/trpc/server";
import { ListingCard } from "@/components/search/listing-card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildFlooringHubCanonicalPath,
  parseFlooringHubPage,
} from "@/lib/marketplace/flooring-hub-canonical";

export const revalidate = 1800; // 30 minutes

const materialLabels: Record<string, string> = {
  hardwood: "Hardwood",
  engineered: "Engineered Hardwood",
  laminate: "Laminate",
  vinyl_lvp: "Vinyl / LVP",
  bamboo: "Bamboo",
  tile: "Tile",
};

const materialDescriptions: Record<string, string> = {
  hardwood: "Browse surplus hardwood flooring with seller verification shown on every lot. Find new overstock, closeout, and discontinued solid hardwood where seller territories currently allow visibility.",
  engineered: "Shop engineered hardwood flooring deals with seller verification shown on each listing. Surplus and closeout engineered wood appears where seller territories currently allow visibility.",
  laminate: "Discover laminate flooring closeouts and overstock with visible seller verification. Quality laminate planks appear where seller territories currently allow visibility.",
  vinyl_lvp: "Find luxury vinyl plank (LVP) surplus inventory from sellers serving supported markets. Waterproof vinyl flooring appears where seller territories currently allow visibility.",
  bamboo: "Browse bamboo flooring surplus and closeout deals with seller verification shown on each listing. Available lots depend on seller territories and current market coverage.",
  tile: "Shop surplus tile flooring inventory with visible seller verification. Porcelain, ceramic, and stone tile listings depend on seller territories and current market coverage.",
};

const validMaterialTypes = [
  "hardwood",
  "engineered",
  "laminate",
  "vinyl_lvp",
  "bamboo",
  "tile",
] as const;

type ValidMaterialType = (typeof validMaterialTypes)[number];

const FLOORING_HUB_PAGE_SIZE = 24;

function isValidMaterialType(value: string): value is ValidMaterialType {
  return (validMaterialTypes as readonly string[]).includes(value);
}

interface MaterialTypePageProps {
  params: Promise<{ materialType: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata(
  props: MaterialTypePageProps,
): Promise<Metadata> {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { materialType } = params;

  if (!isValidMaterialType(materialType)) {
    return {
      title: "Category Not Found",
    };
  }

  const page = parseFlooringHubPage(searchParams.page);
  const label = materialLabels[materialType];
  const description = materialDescriptions[materialType];

  let hasListingsOnPage = page <= 1;
  if (page >= 2) {
    const trpc = await createServerCaller();
    const result = await trpc.listing.list({
      materialType: [materialType],
      page,
      limit: FLOORING_HUB_PAGE_SIZE,
      sort: "date_newest",
    });
    hasListingsOnPage = result.items.length > 0;
  }

  const canonical = buildFlooringHubCanonicalPath({
    materialType,
    page,
    hasListingsOnPage,
  });

  const titleBase = `Surplus ${label} Flooring for Sale`;
  const title =
    page >= 2 && hasListingsOnPage ? `${titleBase} | Page ${page}` : titleBase;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: `${titleBase} | PlankMarket`,
      description,
      type: "website",
    },
  };
}

export default async function MaterialTypePage(props: MaterialTypePageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { materialType } = params;

  // Validate material type
  if (!isValidMaterialType(materialType)) {
    notFound();
  }

  const page = parseFlooringHubPage(searchParams.page);
  const limit = FLOORING_HUB_PAGE_SIZE;

  // Fetch listings server-side
  const trpc = await createServerCaller();
  const result = await trpc.listing.list({
    materialType: [materialType],
    page,
    limit,
    sort: "date_newest",
  });

  const label = materialLabels[materialType];
  const description = materialDescriptions[materialType];
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.plankmarket.com";

  return (
    <>
      {/* BreadcrumbList JSON-LD */}
      <Script
        id={`material-${materialType}-breadcrumb-json-ld`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: BASE_URL,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Flooring",
                item: `${BASE_URL}/listings`,
              },
              {
                "@type": "ListItem",
                position: 3,
                name: label,
                item: `${BASE_URL}/flooring/${materialType}`,
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-4xl font-bold tracking-tight mb-4">
            Surplus {label} Flooring
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl">
            {description}
          </p>
        </div>

        {/* Results count */}
        {result.total > 0 && (
          <div className="mb-6 text-sm text-muted-foreground">
            Showing {(page - 1) * limit + 1}-{Math.min(page * limit, result.total)} of {result.total}{result.totalIsExact ? "" : "+"} listings
          </div>
        )}

        {/* Listings Grid */}
        {result.items.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
            {result.items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-xl text-muted-foreground mb-4">
              No {label.toLowerCase()} listings available at the moment.
            </p>
            <Link href="/listings">
              <Button variant="outline">Browse All Listings</Button>
            </Link>
          </div>
        )}

        {/* Pagination */}
        {result.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            {page > 1 && (
              <Link href={`/flooring/${materialType}?page=${page - 1}`}>
                <Button variant="outline" size="sm">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
              </Link>
            )}

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, result.totalPages) }, (_, i) => {
                let pageNum: number;
                if (result.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= result.totalPages - 2) {
                  pageNum = result.totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }

                return (
                  <Link key={pageNum} href={`/flooring/${materialType}?page=${pageNum}`}>
                    <Button
                      variant={pageNum === page ? "default" : "outline"}
                      size="sm"
                    >
                      {pageNum}
                    </Button>
                  </Link>
                );
              })}
            </div>

            {page < result.totalPages && (
              <Link href={`/flooring/${materialType}?page=${page + 1}`}>
                <Button variant="outline" size="sm">
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}
