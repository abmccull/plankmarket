"use client";
import Link from "next/link";
import { withPurchaseIntent, type PurchaseIntent } from "@/lib/marketplace/purchase-intent";
import { ListingImage as Image } from "@/components/listings/listing-image";
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
  cn,
} from "@/lib/utils";
import { BUYER_MARKETPLACE_FEE_PERCENT } from "@/lib/fees";
import { getDirectPurchaseUnitPrice } from "@/lib/listing-pricing";
import { getPurchaseQuantityPreview, type PublicPurchaseTerms } from "@/lib/marketplace/purchase-quantity-preview";
import { PurchaseQuantityPreview } from "@/components/listings/purchase-quantity-preview";
import { SellerPaymentSetup, type SellerPaymentSetupStatus } from "@/components/listings/seller-payment-setup";
import { Heart, Package } from "lucide-react";
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
    purchaseTerms?: PublicPurchaseTerms;
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
      paymentSetupStatus?: SellerPaymentSetupStatus;
    } | null;
  };
  purchaseIntent?: PurchaseIntent;
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
  purchaseIntent,
  onWatchlistToggle,
  isWatchlisted,
  statusBadge,
}: ListingCardProps) {
  const directPurchaseUnitPrice = getDirectPurchaseUnitPrice(listing);
  const lotValue = directPurchaseUnitPrice * listing.totalSqFt;
  const quantityPreview = getPurchaseQuantityPreview(listing, purchaseIntent?.quantitySqFt);
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
  const listingHref = withPurchaseIntent(`/listings/${listing.slug || listing.id}`, purchaseIntent);

  return (
    <Card className="group overflow-hidden transition-shadow duration-200 hover:shadow-md">
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
              className="object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-muted">
              <Package
                className="mb-2 h-10 w-10 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="text-sm text-muted-foreground">No image</span>
            </div>
          )}
        </Link>
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
          {isPromoted && <PromotionBadge tier={tier} />}
          {evidenceStatusBadge && (
            <Badge
              variant={evidenceStatusBadge.variant}
              className="ml-auto max-w-full whitespace-normal text-xs"
            >
              {evidenceStatusBadge.label}
            </Badge>
          )}
        </div>
        {onWatchlistToggle && (
          <button
            type="button"
            onClick={() => onWatchlistToggle(listing.id)}
            aria-pressed={Boolean(isWatchlisted)}
            aria-label={
              isWatchlisted ? "Remove from watchlist" : "Add to watchlist"
            }
            className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Heart
              className={cn(
                "h-5 w-5",
                isWatchlisted && "fill-red-500 text-red-500",
              )}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            {[
              materialLabels[listing.materialType] || listing.materialType,
              listing.species,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <h2 className="line-clamp-2 text-base font-semibold leading-snug">
            <Link
              href={listingHref}
              className="focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {listing.title}
            </Link>
          </h2>
        </div>
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-2xl font-semibold tabular-nums text-primary">
              {formatCurrency(directPurchaseUnitPrice)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                /sq ft{quantityPreview ? " listed" : ""}
              </span>
            </p>
            <p className="text-sm font-medium tabular-nums">
              {formatSqFt(listing.totalSqFt)}
            </p>
          </div>
          {quantityPreview ? <div className="mt-2"><PurchaseQuantityPreview preview={quantityPreview} /></div> : <p className="mt-1 text-sm tabular-nums">
            Lot {formatCurrency(lotValue)}{" "}
            <span className="text-muted-foreground">
              · +{BUYER_MARKETPLACE_FEE_PERCENT}% buyer fee
            </span>
          </p>}
          {listing.buyNowPrice != null &&
            listing.buyNowPrice !== listing.askPricePerSqFt && (
              <p className="text-xs text-muted-foreground">
                Seller ask: {formatPricePerSqFt(listing.askPricePerSqFt)}
              </p>
            )}
          {!quantityPreview && <p className="mt-1 text-xs text-muted-foreground">
            Freight calculated separately.
          </p>}
        </div>
        <SellerPaymentSetup status={listing.seller?.paymentSetupStatus} />
        <p className="text-sm text-muted-foreground">
          {conditionLabels[listing.condition] || listing.condition}
        </p>
        <ListingEvidence
          variant="compact"
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
        {listing.seller && (
          <p className="border-t pt-3 text-xs text-muted-foreground">
            {listing.seller.displayName}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
