import { cache, Suspense } from "react";
import {
  notFound,
  redirect,
  RedirectType,
  unstable_rethrow,
} from "next/navigation";
import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import { TRPCError } from "@trpc/server";
import {
  formatCurrency,
  formatSqFt,
} from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Truck } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ListingDetailClient } from "@/components/listings/listing-detail-client";
import { ListingEvidence } from "@/components/listings/listing-evidence";
import { ImageGallery } from "@/components/listings/image-gallery";
import { TransactionTimelineExplainer } from "@/components/marketplace/transaction-timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { getDirectPurchaseUnitPrice } from "@/lib/listing-pricing";
import {
  getPublicListingByRouteParam,
  recordPublicListingView,
} from "@/server/public/listing-reads";

const materialLabels: Record<string, string> = {
  hardwood: "Hardwood",
  engineered: "Engineered Hardwood",
  laminate: "Laminate",
  vinyl_lvp: "Vinyl / LVP",
  bamboo: "Bamboo",
  tile: "Tile",
  other: "Other",
};

const conditionLabels: Record<string, string> = {
  new_overstock: "New Overstock",
  discontinued: "Discontinued",
  slight_damage: "Slight Damage",
  returns: "Returns",
  seconds: "Seconds",
  remnants: "Remnants",
  closeout: "Closeout",
  other: "Other",
};

const certificationLabels: Record<string, string> = {
  floorscore: "FloorScore",
  greenguard: "GreenGuard",
  greenguard_gold: "GreenGuard Gold",
  fsc: "FSC",
  carb2: "CARB2",
  leed: "LEED",
  nauf: "NAUF",
};

const finishLabels: Record<string, string> = {
  matte: "Matte",
  semi_gloss: "Semi-Gloss",
  gloss: "Gloss",
  wire_brushed: "Wire Brushed",
  hand_scraped: "Hand Scraped",
  distressed: "Distressed",
  smooth: "Smooth",
  textured: "Textured",
  oiled: "Oiled",
  unfinished: "Unfinished",
  other: "Other",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof TRPCError && error.code === "NOT_FOUND";
}

const getListingViewModel = cache(async (id: string) => {
  const requestHeaders = new Headers(await headers());
  return getPublicListingByRouteParam(id, requestHeaders);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const canonicalUrl = `/listings/${id}`;

  try {
    const { listing } = await getListingViewModel(id);

    const materialLabel = materialLabels[listing.materialType] || listing.materialType;
    const conditionLabel = conditionLabels[listing.condition] || listing.condition;
    const directPurchaseUnitPrice = getDirectPurchaseUnitPrice(listing);

    return {
      title: listing.title,
      description: `${listing.title} - ${materialLabel} flooring, ${formatSqFt(listing.totalSqFt)}, ${formatCurrency(directPurchaseUnitPrice)}/sq ft direct purchase. ${conditionLabel} condition.`,
      openGraph: {
        title: listing.title,
        description: `${materialLabel} flooring - ${formatSqFt(listing.totalSqFt)} available at ${formatCurrency(directPurchaseUnitPrice)}/sq ft direct purchase`,
        images: listing.media?.[0]?.url ? [listing.media[0].url] : [],
      },
      alternates: {
        canonical: canonicalUrl,
      },
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        title: "Listing Not Found",
        description: "This PlankMarket listing is unavailable or no longer public.",
        alternates: {
          canonical: canonicalUrl,
        },
      };
    }

    return {
      title: "Listing details unavailable",
      description:
        "Review public listing evidence, seller verification, and freight readiness on PlankMarket.",
      alternates: {
        canonical: canonicalUrl,
      },
    };
  }
}

async function ListingContent({ id }: { id: string }) {
  let listingView;
  try {
    listingView = await getListingViewModel(id);
  } catch (error) {
    // redirect() is implemented as an internal exception. Preserve it before
    // applying ordinary application error handling.
    unstable_rethrow(error);
    if (isNotFoundError(error)) {
      notFound();
    }
    throw error;
  }

  if (!listingView) {
    notFound();
  }

  const { listing, requestedById, viewerIdentifier } = listingView;
  if (requestedById && listing.slug) {
    redirect(`/listings/${listing.slug}`, RedirectType.replace);
  }

  // View tracking is intentionally separate from the pure listing read so
  // metadata generation and page rendering can share the same cached payload.
  void recordPublicListingView(listing.id, viewerIdentifier).catch(() => {
    // Non-fatal: view tracking must never break the listing page.
  });

  const materialLabel = materialLabels[listing.materialType] || listing.materialType;
  const conditionLabel = conditionLabels[listing.condition] || listing.condition;
  const directPurchaseUnitPrice = getDirectPurchaseUnitPrice(listing);

  // Product JSON-LD
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: listing.description || `${materialLabel} flooring - ${conditionLabel} condition`,
    image: listing.media?.map(m => m.url) || [],
    sku: listing.id,
    brand: listing.brand ? { "@type": "Brand", name: listing.brand } : undefined,
    category: `Flooring > ${materialLabel}`,
    offers: {
      "@type": "Offer",
      price: directPurchaseUnitPrice * listing.totalSqFt,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      itemCondition: listing.condition === "new_overstock"
        ? "https://schema.org/NewCondition"
        : "https://schema.org/UsedCondition",
      seller: listing.seller ? {
        "@type": "Organization",
        name: listing.seller.displayName,
      } : undefined,
    },
  };

  return (
    <>
      <Script
        id={`listing-${listing.id}-product-json-ld`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <div className="container mx-auto px-4 pt-8 pb-28 lg:pb-8">
        {/* Breadcrumbs */}
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Listings", href: "/listings" },
            { label: listing.title },
          ]}
        />

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content - 2 columns (SERVER RENDERED) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image Gallery */}
            <ImageGallery media={listing.media} title={listing.title} />

            {/* Title and badges */}
            <div>
              <h1 className="text-3xl font-bold">{listing.title}</h1>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Badge>{materialLabel}</Badge>
                <Badge variant="outline">{conditionLabel}</Badge>
                {listing.species && (
                  <Badge variant="secondary">{listing.species}</Badge>
                )}
              </div>
              <ListingEvidence
                variant="compact"
                className="mt-4"
                listing={listing}
              />
            </div>

            {/* Description */}
            {listing.description && (
              <div>
                <h2 className="text-xl font-semibold mb-2">Description</h2>
                <p className="text-muted-foreground whitespace-pre-wrap max-w-prose leading-relaxed">
                  {listing.description}
                </p>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Listing evidence</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Public evidence from this listing and seller account, separated
                  into what is known now and what must be calculated later.
                </p>
              </CardHeader>
              <CardContent>
                <ListingEvidence listing={listing} />
              </CardContent>
            </Card>

            {/* Product Specifications */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Product Specifications</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  <SpecItem label="Material" value={materialLabel} />
                  {listing.species && <SpecItem label="Species" value={listing.species} />}
                  {listing.finish && (
                    <SpecItem
                      label="Finish"
                      value={finishLabels[listing.finish] || listing.finish}
                    />
                  )}
                  {listing.grade && <SpecItem label="Grade" value={listing.grade} />}
                  {listing.thickness && (
                    <SpecItem label="Thickness" value={`${listing.thickness}"`} />
                  )}
                  {listing.width && <SpecItem label="Width" value={`${listing.width}"`} />}
                  {listing.length && <SpecItem label="Length" value={`${listing.length}"`} />}
                  {listing.color && <SpecItem label="Color" value={listing.color} />}
                  {listing.brand && <SpecItem label="Brand" value={listing.brand} />}
                </dl>
              </CardContent>
            </Card>

            {/* Lot Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Lot Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  <SpecItem label="Total Sq Ft" value={formatSqFt(listing.totalSqFt)} />
                  {listing.totalPallets && (
                    <SpecItem label="Pallets" value={listing.totalPallets.toString()} />
                  )}
                  {listing.sqFtPerBox && (
                    <SpecItem label="Sq Ft / Box" value={listing.sqFtPerBox.toString()} />
                  )}
                  {listing.boxesPerPallet && (
                    <SpecItem
                      label="Boxes / Pallet"
                      value={listing.boxesPerPallet.toString()}
                    />
                  )}
                  {listing.moq && (
                    <SpecItem
                      label="Min Order"
                      value={
                        listing.moqUnit === "pallets"
                          ? `${listing.moq} pallet${listing.moq !== 1 ? "s" : ""}`
                          : formatSqFt(listing.moq)
                      }
                    />
                  )}
                  <SpecItem label="Condition" value={conditionLabel} />
                  {listing.palletWeight && (
                    <SpecItem
                      label="Pallet Weight"
                      value={`${listing.palletWeight.toLocaleString()} lbs`}
                    />
                  )}
                </dl>
                {listing.freightEstimateStatus === "quote_request_ready" && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <Truck className="h-4 w-4" />
                    <span>Freight quote request ready at checkout</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Certifications */}
            {listing.certifications && (listing.certifications as string[]).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Certifications</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(listing.certifications as string[]).map((cert) => (
                      <Badge key={cert} variant="secondary">
                        <Shield className="mr-1 h-3 w-3" />
                        {certificationLabels[cert] || cert.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <section aria-labelledby="transaction-process-title">
              <h2 id="transaction-process-title" className="mb-3 text-xl font-semibold">
                How this transaction moves
              </h2>
              <TransactionTimelineExplainer />
            </section>
          </div>

          {/* Sidebar - CLIENT ISLAND for interactive purchase actions */}
          <ListingDetailClient listing={listing} />
        </div>
      </div>
    </>
  );
}

function ListingDetailSkeleton() {
  return (
    <div
      className="container mx-auto px-4 py-8"
      role="status"
      aria-live="polite"
      aria-label="Loading public listing details"
    >
      <div className="mb-6 max-w-2xl space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Loading listing details
        </p>
        <h1 className="text-2xl font-semibold">Checking current public evidence</h1>
        <p className="text-sm text-muted-foreground">
          Pricing, seller verification, photos, and freight readiness are still
          being fetched. Final delivered cost is not shown until freight details
          are available.
        </p>
      </div>
      <Skeleton className="h-4 w-48 mb-4" />
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="aspect-[16/9] w-full rounded-xl" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}

function SpecItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-4 border-l-primary/20 pl-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium mt-0.5">{value}</dd>
    </div>
  );
}

export default async function ListingDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<ListingDetailSkeleton />}>
      <ListingContent id={id} />
    </Suspense>
  );
}
