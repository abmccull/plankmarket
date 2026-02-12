"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { ListingCard } from "@/components/search/listing-card";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FeaturedCarousel() {
  const { data: featuredListings, isLoading } =
    trpc.promotion.getFeatured.useQuery({ limit: 6 });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!featuredListings || featuredListings.length === 0) {
    return null;
  }

  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold">Featured Inventory</h2>
            <p className="text-muted-foreground mt-1">
              Premium listings from verified sellers
            </p>
          </div>
          <Link href="/listings">
            <Button variant="outline">
              View All Inventory
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {featuredListings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={{
                ...listing,
                isPromoted: true,
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
