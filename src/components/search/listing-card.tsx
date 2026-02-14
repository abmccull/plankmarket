"use client";

import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PromotionBadge } from "@/components/promotions/promotion-badge";
import {
  formatCurrency,
  formatSqFt,
} from "@/lib/utils";
import { cn } from "@/lib/utils";
import { MapPin, Eye, Heart, Package } from "lucide-react";
import type { PromotionTier } from "@/types";
import { getAnonymousDisplayName } from "@/lib/identity/display-name";

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
      verified: boolean;
      role: string;
      businessState: string | null;
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

export function ListingCard({ listing }: ListingCardProps) {
  const lotValue = listing.askPricePerSqFt * listing.totalSqFt;

  const isPromoted = listing.isPromoted || !!listing.promotionTier;
  const tier = listing.promotionTier;

  return (
    <Link href={`/listings/${listing.id}`}>
      <Card
        className={cn(
          "group overflow-hidden card-hover-lift hover:shadow-lg transition-shadow duration-200",
          tier === "premium" && "border-purple-300 dark:border-purple-700",
          tier === "featured" && "border-amber-300 dark:border-amber-700"
        )}
      >
        {/* Image */}
        <div className="aspect-[4/3] bg-muted relative overflow-hidden">
          {listing.media?.[0] ? (
            <>
              <Image
                src={listing.media[0].url}
                alt={listing.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover group-hover:scale-105 transition-transform duration-200"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent" />
            </>
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-muted to-muted/50">
              <Package className="h-12 w-12 text-muted-foreground/30 mb-2" />
              <span className="text-xs text-muted-foreground/50">No image</span>
            </div>
          )}
          <div className="absolute top-2 left-2 flex gap-1">
            <Badge variant="secondary" className="text-xs">
              {materialLabels[listing.materialType] || listing.materialType}
            </Badge>
            {isPromoted && <PromotionBadge tier={tier} />}
          </div>
          {listing.buyNowPrice && (
            <Badge className="absolute top-2 right-2 text-xs bg-secondary text-secondary-foreground">
              Buy Now
            </Badge>
          )}
        </div>

        <CardContent className="p-4">
          <h3 className="font-semibold text-sm line-clamp-2 mb-2 group-hover:text-primary transition-colors">
            {listing.title}
          </h3>

          <div className="flex items-center justify-between mb-2">
            <span className="text-xl font-mono font-bold text-primary tabular-nums">
              {formatCurrency(listing.askPricePerSqFt)}
              <span className="text-sm font-normal text-muted-foreground">
                /sq ft
              </span>
            </span>
            <span className="text-sm text-muted-foreground">
              {formatSqFt(listing.totalSqFt)}
            </span>
          </div>

          <div className="text-sm text-muted-foreground mb-2 tabular-nums">
            Lot value: {formatCurrency(lotValue)}
          </div>

          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Badge variant="outline" className="text-sm">
              {conditionLabels[listing.condition] || listing.condition}
            </Badge>
            {listing.species && (
              <Badge variant="outline" className="text-sm">
                {listing.species}
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
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

          {listing.seller && (
            <div className="mt-2 pt-2 border-t flex items-center gap-1 text-sm text-muted-foreground">
              <span>{getAnonymousDisplayName({ role: listing.seller.role, businessState: listing.seller.businessState })}</span>
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
    </Link>
  );
}
