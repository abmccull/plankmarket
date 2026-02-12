"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PromotionBadge } from "./promotion-badge";
import { formatCurrency, formatSqFt } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRef } from "react";
import type { PromotionTier } from "@/types";

interface SponsoredListing {
  id: string;
  title: string;
  askPricePerSqFt: number;
  totalSqFt: number;
  promotionTier?: PromotionTier | null;
  media?: { url: string }[];
  seller?: {
    businessName: string | null;
    verified: boolean;
  } | null;
}

interface SponsoredCarouselProps {
  listings: SponsoredListing[];
}

/**
 * Render a horizontally scrollable carousel of sponsored listing cards with navigation controls.
 *
 * Each card links to its listing page and shows an image (or placeholder), a promotion badge, title,
 * price per square foot, and total square footage. The carousel provides left/right buttons that
 * scroll the list by a fixed amount for navigation.
 *
 * @param listings - Array of sponsored listings to display; each item should include id, title,
 *   pricing and sizing fields, and optional media, promotion tier, and seller info.
 * @returns A React element containing the carousel, or `null` if `listings` is empty.
 */
export function SponsoredCarousel({ listings }: SponsoredCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!listings || listings.length === 0) return null;

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = 300;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Sponsored Listings
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => scroll("left")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => scroll("right")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {listings.map((listing) => (
          <Link
            key={listing.id}
            href={`/listings/${listing.id}`}
            className="shrink-0 w-[220px]"
          >
            <Card className="overflow-hidden hover:shadow-md transition-shadow border-primary/20">
              <div className="aspect-[4/3] bg-muted relative overflow-hidden">
                {listing.media?.[0] ? (
                  <img
                    src={listing.media[0].url}
                    alt={listing.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                )}
                <div className="absolute top-1.5 left-1.5">
                  <PromotionBadge tier={listing.promotionTier} />
                </div>
              </div>
              <CardContent className="p-3">
                <h4 className="text-xs font-medium line-clamp-1 mb-1">
                  {listing.title}
                </h4>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-primary">
                    {formatCurrency(listing.askPricePerSqFt)}/sf
                  </span>
                  <span className="text-muted-foreground">
                    {formatSqFt(listing.totalSqFt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}