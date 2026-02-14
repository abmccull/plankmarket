import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerCaller } from "@/lib/trpc/server";
import { ListingCard } from "@/components/search/listing-card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
  hardwood: "Browse surplus hardwood flooring from verified sellers nationwide. Find new overstock, closeout, and discontinued solid hardwood at wholesale prices.",
  engineered: "Shop engineered hardwood flooring deals. Surplus and closeout engineered wood from top manufacturers at discounted prices.",
  laminate: "Discover laminate flooring closeouts and overstock. Quality laminate planks from verified sellers at below-wholesale pricing.",
  vinyl_lvp: "Find luxury vinyl plank (LVP) surplus inventory. Waterproof vinyl flooring from manufacturers and distributors at liquidation prices.",
  bamboo: "Browse bamboo flooring surplus and closeout deals. Sustainable bamboo planks from verified wholesale sellers.",
  tile: "Shop surplus tile flooring inventory. Porcelain, ceramic, and stone tile from wholesalers and manufacturers at closeout prices.",
};

const validMaterialTypes = ["hardwood", "engineered", "laminate", "vinyl_lvp", "bamboo", "tile"];

interface MaterialTypePageProps {
  params: Promise<{ materialType: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata(props: MaterialTypePageProps): Promise<Metadata> {
  const params = await props.params;
  const { materialType } = params;

  if (!validMaterialTypes.includes(materialType)) {
    return {
      title: "Category Not Found",
    };
  }

  const label = materialLabels[materialType];
  const description = materialDescriptions[materialType];

  return {
    title: `Surplus ${label} Flooring for Sale`,
    description,
    openGraph: {
      title: `Surplus ${label} Flooring for Sale | PlankMarket`,
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
  if (!validMaterialTypes.includes(materialType)) {
    notFound();
  }

  const page = parseInt(searchParams.page || "1", 10);
  const limit = 24;

  // Fetch listings server-side
  const trpc = await createServerCaller();
  const result = await trpc.listing.list({
    materialType: [materialType as "hardwood" | "engineered" | "laminate" | "vinyl_lvp" | "bamboo" | "tile"],
    page,
    limit,
    sort: "date_newest",
  });

  const label = materialLabels[materialType];
  const description = materialDescriptions[materialType];
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
                name: label,
                item: `${BASE_URL}/flooring/${materialType}`,
              },
            ],
          }),
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
