"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PromotionBadge } from "@/components/promotions/promotion-badge";
import {
  formatCurrency,
  formatSqFt,
  formatRelativeTime,
} from "@/lib/utils";
import { cn } from "@/lib/utils";
import { MapPin, Eye, Heart, Package } from "lucide-react";
import type { PromotionTier } from "@/types";

interface ListingCardProps {
  listing: {
    id: string;
    title: string;
    materialType: string;
    species: string | null;
    condition: string;
    totalSqFt: number;
    askPricePerSqFt: number;
    buyNowPrice: number | null;
    locationCity: string | null;
    locationState: string | null;
    viewsCount: number;
    watchlistCount: number;
    createdAt: Date | string;
    promotionTier?: PromotionTier | null;
    isPromoted?: boolean;
    media?: { url: string }[];
    seller?: {
      businessName: string | null;
      verified: boolean;
    } | null;
  };
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

/**
 * Render a compact listing card that displays a listing's image, pricing, badges, location, stats, and seller info.
 *
 * The card links to /listings/{id} and visually highlights promotion tiers, buy-now availability, material, condition,
 * species, and seller verification when present.
 *
 * @param listing - The listing object to display (expects fields such as id, title, media, askPricePerSqFt, totalSqFt,
 *   buyNowPrice, materialType, condition, species, locationCity, locationState, viewsCount, watchlistCount,
 *   seller, promotionTier, and isPromoted).
 * @returns The JSX element for the listing card.
 */
export function ListingCard({ listing }: ListingCardProps) {
  const lotValue = listing.askPricePerSqFt * listing.totalSqFt;

  const isPromoted = listing.isPromoted || !!listing.promotionTier;
  const tier = listing.promotionTier;

  return (
    <Link href={`/listings/${listing.id}`}>
      <Card
        className={cn(
          "group overflow-hidden hover:shadow-lg transition-shadow duration-200",
          tier === "premium" && "border-purple-300 dark:border-purple-700",
          tier === "featured" && "border-amber-300 dark:border-amber-700"
        )}
      >
        {/* Image */}
        <div className="aspect-[4/3] bg-muted relative overflow-hidden">
          {listing.media?.[0] ? (
            <img
              src={listing.media[0].url}
              alt={listing.title}
              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <Package className="h-12 w-12 text-muted-foreground/50" />
            </div>
          )}
          <div className="absolute top-2 left-2 flex gap-1">
            <Badge variant="secondary" className="text-xs">
              {materialLabels[listing.materialType] || listing.materialType}
            </Badge>
            {isPromoted && <PromotionBadge tier={tier} />}
          </div>
          {listing.buyNowPrice && (
            <Badge className="absolute top-2 right-2 text-xs bg-primary">
              Buy Now
            </Badge>
          )}
        </div>

        <CardContent className="p-4">
          <h3 className="font-semibold text-sm line-clamp-2 mb-2 group-hover:text-primary transition-colors">
            {listing.title}
          </h3>

          <div className="flex items-center justify-between mb-2">
            <span className="text-lg font-bold text-primary">
              {formatCurrency(listing.askPricePerSqFt)}
              <span className="text-xs font-normal text-muted-foreground">
                /sq ft
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {formatSqFt(listing.totalSqFt)}
            </span>
          </div>

          <div className="text-xs text-muted-foreground mb-2">
            Lot value: {formatCurrency(lotValue)}
          </div>

          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Badge variant="outline" className="text-xs">
              {conditionLabels[listing.condition] || listing.condition}
            </Badge>
            {listing.species && (
              <Badge variant="outline" className="text-xs">
                {listing.species}
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              {listing.locationState && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {listing.locationCity
                    ? `${listing.locationCity}, ${listing.locationState}`
                    : listing.locationState}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {listing.viewsCount}
              </span>
              <span className="flex items-center gap-1">
                <Heart className="h-3 w-3" />
                {listing.watchlistCount}
              </span>
            </div>
          </div>

          {listing.seller?.businessName && (
            <div className="mt-2 pt-2 border-t flex items-center gap-1 text-xs text-muted-foreground">
              <span>{listing.seller.businessName}</span>
              {listing.seller.verified && (
                <svg
                  className="h-3 w-3 text-primary"
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
    </Link>
  );
}