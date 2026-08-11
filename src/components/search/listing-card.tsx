"use client";

import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PromotionBadge } from "@/components/promotions/promotion-badge";
import {
  ListingEvidence,
  getListingEvidenceStatusBadge,
  type FreightEstimateStatus,
} from "@/components/listings/listing-evidence";
import type { ListingFreshnessStatus } from "@/lib/listing-freshness";
import {
  formatCurrency,
  formatSqFt,
  formatPricePerSqFt,
} from "@/lib/utils";
import { BUYER_MARKETPLACE_FEE_PERCENT } from "@/lib/fees";
import { getDirectPurchaseUnitPrice } from "@/lib/listing-pricing";
import { cn } from "@/lib/utils";
import { Eye, Heart, Package } from "lucide-react";
import type { PromotionTier } from "@/types";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

interface ListingCardProps {
  listing: {
    id: string;
    slug?: string | null;
    title: string;
    materialType: string;
    species: string | null;
    condition: string;
    totalSqFt: number;
    askPricePerSqFt: number;
    buyNowPrice: number | null;
    moq?: number | null;
    moqUnit?: "pallets" | "sqft" | null;
    freightEstimateStatus?: FreightEstimateStatus;
    freshnessStatus?: ListingFreshnessStatus;
    lastConfirmedAt?: Date | string | null;
    locationCity: string | null;
    locationState: string | null;
    viewsCount: number;
    watchlistCount: number;
    createdAt: Date | string;
    promotionTier?: PromotionTier | null;
    isPromoted?: boolean;
    media?: { url: string }[];
    seller?: {
      displayName: string;
      verified: boolean;
      role: string;
    } | null;
  };
  onWatchlistToggle?: (listingId: string) => void;
  isWatchlisted?: boolean;
  statusBadge?: { label: string; variant: BadgeVariant };
}

const materialLabels: Record<string, string> = {
  hardwood: "Hardwood",
  engineered: "Engineered",
  laminate: "Laminate",
  vinyl_lvp: "Vinyl/LVP",
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

export function ListingCard({
  listing,
  onWatchlistToggle,
  isWatchlisted,
  statusBadge,
}: ListingCardProps) {
  const directPurchaseUnitPrice = getDirectPurchaseUnitPrice(listing);
  const lotValue = directPurchaseUnitPrice * listing.totalSqFt;
  const evidenceStatusBadge =
    statusBadge ??
    getListingEvidenceStatusBadge({
      totalSqFt: listing.totalSqFt,
      moq: listing.moq ?? null,
      moqUnit: listing.moqUnit ?? null,
      condition: listing.condition,
      locationCity: listing.locationCity,
      locationState: listing.locationState,
      freightEstimateStatus:
        listing.freightEstimateStatus ?? "seller_setup_required",
      freshnessStatus: listing.freshnessStatus,
      lastConfirmedAt: listing.lastConfirmedAt,
      media: listing.media,
      seller: listing.seller,
    });

  const isPromoted = listing.isPromoted || !!listing.promotionTier;
  const tier = listing.promotionTier;
  const listingHref = `/listings/${listing.slug || listing.id}`;

  return (
    <Card
      className={cn(
        "group overflow-hidden card-hover-lift transition-shadow duration-200 hover:shadow-lg",
        tier === "premium" &&
          "border-purple-400 shadow-md shadow-purple-100 dark:border-purple-600 dark:shadow-purple-950/30",
        tier === "featured" &&
          "border-amber-400 shadow-md shadow-amber-100 dark:border-amber-600 dark:shadow-amber-950/30",
      )}
    >
        {tier === "premium" && (
          <div className="h-1 bg-gradient-to-r from-purple-500 via-purple-400 to-purple-600" />
        )}
        {tier === "featured" && (
          <div className="h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600" />
        )}

        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <Link
            href={listingHref}
            aria-label={`View ${listing.title}`}
            className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {listing.media?.[0] ? (
              <Image
                src={listing.media[0].url}
                alt={listing.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                <Package className="mb-2 h-12 w-12 text-muted-foreground/30" />
                <span className="text-xs text-muted-foreground/50">No image</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent" />
          </Link>
          <div className="pointer-events-none absolute left-2 top-2 flex gap-1">
            <Badge variant="secondary" className="text-xs">
              {materialLabels[listing.materialType] || listing.materialType}
            </Badge>
            {isPromoted && <PromotionBadge tier={tier} />}
          </div>
          <div className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1">
            {listing.buyNowPrice && (
              <Badge className="bg-secondary text-xs text-secondary-foreground">
                Buy now
              </Badge>
            )}
            {evidenceStatusBadge && (
              <Badge variant={evidenceStatusBadge.variant} className="text-xs">
                {evidenceStatusBadge.label}
              </Badge>
            )}
          </div>
          {onWatchlistToggle && (
            <button
              type="button"
              onClick={() => onWatchlistToggle(listing.id)}
              className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label={
                isWatchlisted ? "Remove from watchlist" : "Add to watchlist"
              }
            >
              <Heart
                className={cn(
                  "h-5 w-5 text-white",
                  isWatchlisted && "fill-red-500 text-red-500",
                )}
              />
            </button>
          )}
        </div>

        <CardContent className="p-4">
          <h2 className="mb-2 line-clamp-2 text-sm font-semibold">
            <Link
              href={listingHref}
              className="transition-colors hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {listing.title}
            </Link>
          </h2>

          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-xl font-bold tabular-nums text-primary">
              {formatCurrency(directPurchaseUnitPrice)}
              <span className="text-sm font-normal text-muted-foreground">
                /sq ft
              </span>
            </span>
            <span className="text-sm text-muted-foreground">
              {formatSqFt(listing.totalSqFt)}
            </span>
          </div>

          <div className="mb-2 text-sm text-muted-foreground tabular-nums">
            Direct purchase lot: {formatCurrency(lotValue)}
            {listing.buyNowPrice != null &&
              listing.buyNowPrice !== listing.askPricePerSqFt && (
                <span className="block text-xs">
                  Seller ask: {formatPricePerSqFt(listing.askPricePerSqFt)}
                </span>
              )}
            <span className="block text-xs">
              Known now: unit price and +{BUYER_MARKETPLACE_FEE_PERCENT}% buyer fee
            </span>
            <span className="block text-xs">
              Calculated later: destination freight quote
            </span>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-sm">
              {conditionLabels[listing.condition] || listing.condition}
            </Badge>
            {listing.species && (
              <Badge variant="outline" className="text-sm">
                {listing.species}
              </Badge>
            )}
          </div>

          <ListingEvidence
            variant="compact"
            className="mb-3"
            listing={{
              totalSqFt: listing.totalSqFt,
              moq: listing.moq ?? null,
              moqUnit: listing.moqUnit ?? null,
              condition: listing.condition,
              locationCity: listing.locationCity,
              locationState: listing.locationState,
              freightEstimateStatus:
                listing.freightEstimateStatus ?? "seller_setup_required",
              freshnessStatus: listing.freshnessStatus,
              lastConfirmedAt: listing.lastConfirmedAt,
              media: listing.media,
              seller: listing.seller,
            }}
          />

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div />
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {listing.viewsCount}
              </span>
              <span className="flex items-center gap-1">
                <Heart
                  className={cn(
                    "h-3 w-3",
                    isWatchlisted && "fill-red-500 text-red-500",
                  )}
                  aria-hidden="true"
                />
                <span className="sr-only">Watchlist saves:</span>
                {listing.watchlistCount}
              </span>
            </div>
          </div>

          {listing.seller && (
            <div className="mt-2 flex items-center gap-1 border-t pt-2 text-sm text-muted-foreground">
              <span>{listing.seller.displayName}</span>
              {listing.seller.verified && (
                <svg
                  className="h-3 w-3 text-secondary"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
          )}
        </CardContent>
    </Card>
  );
}
