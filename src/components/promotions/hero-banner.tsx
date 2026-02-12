"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatSqFt } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ArrowRight, ChevronLeft, ChevronRight, Package } from "lucide-react";

export function PremiumHeroBanner() {
  const { data: premiumListings } = trpc.promotion.getPremiumHero.useQuery();
  const [activeIndex, setActiveIndex] = useState(0);

  const listingsCount = premiumListings?.length ?? 0;

  const goNext = useCallback(() => {
    if (listingsCount > 0) {
      setActiveIndex((prev) => (prev + 1) % listingsCount);
    }
  }, [listingsCount]);

  const goPrev = useCallback(() => {
    if (listingsCount > 0) {
      setActiveIndex((prev) => (prev - 1 + listingsCount) % listingsCount);
    }
  }, [listingsCount]);

  // Auto-rotate every 5 seconds
  useEffect(() => {
    if (listingsCount <= 1) return;
    const interval = setInterval(goNext, 5000);
    return () => clearInterval(interval);
  }, [goNext, listingsCount]);

  if (!premiumListings || premiumListings.length === 0) {
    return null;
  }

  const listing = premiumListings[activeIndex];
  if (!listing) return null;

  const lotValue = listing.askPricePerSqFt * listing.totalSqFt;
  const imageUrl = listing.media?.[0]?.url;

  return (
    <section className="relative overflow-hidden bg-gradient-to-r from-purple-900/90 to-primary/80 text-white">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="flex flex-col md:flex-row items-center gap-8">
          {/* Image */}
          <div className="w-full md:w-1/2 aspect-[16/9] rounded-lg overflow-hidden bg-black/20">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={listing.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Package className="h-16 w-16 opacity-50" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="w-full md:w-1/2">
            <Badge className="bg-purple-500/30 text-purple-100 border-purple-400/50 mb-3">
              Premium Listing
            </Badge>
            <h2 className="text-2xl md:text-3xl font-bold mb-3 line-clamp-2">
              {listing.title}
            </h2>
            <div className="flex items-center gap-4 mb-4 text-white/80">
              <span className="text-xl font-bold text-white">
                {formatCurrency(listing.askPricePerSqFt)}/sq ft
              </span>
              <span>{formatSqFt(listing.totalSqFt)}</span>
              <span>Lot: {formatCurrency(lotValue)}</span>
            </div>
            {listing.seller?.businessName && (
              <p className="text-sm text-white/70 mb-4">
                by {listing.seller.businessName}
              </p>
            )}
            <Link href={`/listings/${listing.id}`}>
              <Button
                size="lg"
                className="bg-white text-primary hover:bg-white/90"
              >
                View Listing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Navigation */}
        {listingsCount > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button
              variant="ghost"
              size="icon"
              className="text-white/70 hover:text-white hover:bg-white/10 h-8 w-8"
              onClick={goPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex gap-1.5">
              {premiumListings.map((_, idx) => (
                <button
                  key={idx}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    idx === activeIndex
                      ? "w-6 bg-white"
                      : "w-2 bg-white/40 hover:bg-white/60"
                  )}
                  onClick={() => setActiveIndex(idx)}
                />
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-white/70 hover:text-white hover:bg-white/10 h-8 w-8"
              onClick={goNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
