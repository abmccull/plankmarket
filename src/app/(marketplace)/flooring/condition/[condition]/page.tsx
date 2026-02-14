import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerCaller } from "@/lib/trpc/server";
import { ListingCard } from "@/components/search/listing-card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const revalidate = 1800; // 30 minutes

const conditionLabels: Record<string, string> = {
  "new_overstock": "New Overstock",
  "discontinued": "Discontinued",
  "closeout": "Closeout",
  "slight_damage": "Slight Damage",
  "seconds": "Seconds",
  "remnants": "Remnants",
  "returns": "Returns",
};

const conditionDescriptions: Record<string, string> = {
  "new_overstock": "Shop new overstock flooring at below-wholesale prices. These are brand-new, unused materials from overproduction and excess inventory.",
  "discontinued": "Find discontinued flooring lines at liquidation prices. Perfect for matching existing floors or scoring premium materials at deep discounts.",
  "closeout": "Browse closeout flooring deals from manufacturers and distributors clearing inventory. Premium materials at fraction of retail price.",
  "slight_damage": "Discover slightly damaged flooring at steep discounts. Minor cosmetic imperfections that don't affect installation or performance.",
  "seconds": "Shop factory seconds flooring. Minor cosmetic variations from manufacturing — same quality, lower price.",
  "remnants": "Find flooring remnants and partial lots. Ideal for smaller projects, repairs, and accent installations.",
  "returns": "Browse returned flooring inventory at discounted prices. Customer returns and overorders available from verified sellers.",
};

const validConditions = ["new_overstock", "discontinued", "closeout", "slight_damage", "seconds", "remnants", "returns"];

interface ConditionPageProps {
  params: Promise<{ condition: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata(props: ConditionPageProps): Promise<Metadata> {
  const params = await props.params;
  const { condition } = params;

  if (!validConditions.includes(condition)) {
    return {
      title: "Category Not Found",
    };
  }

  const label = conditionLabels[condition];
  const description = conditionDescriptions[condition];

  return {
    title: `${label} Flooring for Sale`,
    description,
    openGraph: {
      title: `${label} Flooring for Sale | PlankMarket`,
      description,
      type: "website",
    },
  };
}

export default async function ConditionPage(props: ConditionPageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { condition } = params;

  // Validate condition type
  if (!validConditions.includes(condition)) {
    notFound();
  }

  const page = parseInt(searchParams.page || "1", 10);
  const limit = 24;

  // Fetch listings server-side
  const trpc = await createServerCaller();
  const result = await trpc.listing.list({
    condition: [condition as "new_overstock" | "discontinued" | "closeout" | "slight_damage" | "seconds" | "remnants" | "returns"],
    page,
    limit,
    sort: "date_newest",
  });

  const label = conditionLabels[condition];
  const description = conditionDescriptions[condition];
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://plankmarket.com";

  return (
    <>
      {/* BreadcrumbList JSON-LD */}
      <script
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
                name: "By Condition",
                item: `${BASE_URL}/flooring/condition`,
              },
              {
                "@type": "ListItem",
                position: 4,
                name: label,
                item: `${BASE_URL}/flooring/condition/${condition}`,
              },
            ],
          }),
        }}
      />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-4xl font-bold tracking-tight mb-4">
            {label} Flooring
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl">
            {description}
          </p>
        </div>

        {/* Results count */}
        {result.total > 0 && (
          <div className="mb-6 text-sm text-muted-foreground">
            Showing {(page - 1) * limit + 1}-{Math.min(page * limit, result.total)} of {result.total} listings
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
              <Link href={`/flooring/condition/${condition}?page=${page - 1}`}>
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
                  <Link key={pageNum} href={`/flooring/condition/${condition}?page=${pageNum}`}>
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
              <Link href={`/flooring/condition/${condition}?page=${page + 1}`}>
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
