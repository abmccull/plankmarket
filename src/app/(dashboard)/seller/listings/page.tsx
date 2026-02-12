"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListingStatusBadge } from "@/components/dashboard/status-badge";
import {
  formatCurrency,
  formatSqFt,
  formatRelativeTime,
} from "@/lib/utils";
import { Plus, Loader2, Eye, Heart, ExternalLink, Rocket } from "lucide-react";
import { BoostModal } from "@/components/promotions/boost-modal";
import { PromotionBadge } from "@/components/promotions/promotion-badge";
import type { ListingStatus, PromotionTier } from "@/types";

/**
 * Renders the Seller "My Listings" management page with listing filters, create/edit/view actions, and a boost flow.
 *
 * Displays tabs for listing statuses (All, Active, Draft, Sold, Expired), a paginated list of the user's listings, and contextual actions for each listing including Edit, View, and a Boost action that opens a boost modal for eligible active listings. When no listings exist a placeholder and a Create Listing action are shown; while listings are loading a centered spinner is displayed.
 *
 * @returns The React element for the seller listings management page.
 */
export default function SellerListingsPage() {
  const [activeTab, setActiveTab] = useState<ListingStatus | undefined>(
    undefined
  );
  const [boostListing, setBoostListing] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const { data, isLoading } = trpc.listing.getMyListings.useQuery({
    status: activeTab,
    page: 1,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Listings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your flooring inventory listings
          </p>
        </div>
        <Link href="/seller/listings/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Listing
          </Button>
        </Link>
      </div>

      <Tabs
        value={activeTab || "all"}
        onValueChange={(v) =>
          setActiveTab(v === "all" ? undefined : (v as ListingStatus))
        }
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="sold">Sold</TabsTrigger>
          <TabsTrigger value="expired">Expired</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab || "all"} className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : data?.items.length === 0 ? (
            <div className="text-center py-12 border rounded-lg bg-muted/20">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No listings found</h3>
              <p className="text-muted-foreground mt-1">
                Create your first listing to get started.
              </p>
              <Link href="/seller/listings/new" className="mt-4 inline-block">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Listing
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {data?.items.map((listing) => (
                <div
                  key={listing.id}
                  className="flex items-center gap-4 rounded-lg border p-4 hover:bg-muted/30 transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {listing.media?.[0] ? (
                      <img
                        src={listing.media[0].url}
                        alt={listing.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Package className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">
                        {listing.title}
                      </h3>
                      <ListingStatusBadge status={listing.status as ListingStatus} />
                      {listing.promotionTier && (
                        <PromotionBadge tier={listing.promotionTier as PromotionTier} />
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span>{formatSqFt(listing.totalSqFt)}</span>
                      <span>
                        {formatCurrency(listing.askPricePerSqFt)}/sq ft
                      </span>
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

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(listing.createdAt)}
                    </span>
                    {listing.status === "active" && !listing.promotionTier && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          setBoostListing({
                            id: listing.id,
                            title: listing.title,
                          });
                        }}
                        className="text-primary"
                      >
                        <Rocket className="mr-1 h-3 w-3" />
                        Boost
                      </Button>
                    )}
                    <Link href={`/seller/listings/${listing.id}/edit`}>
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    </Link>
                    <Link href={`/listings/${listing.id}`}>
                      <Button variant="ghost" size="icon">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {boostListing && (
        <BoostModal
          listingId={boostListing.id}
          listingTitle={boostListing.title}
          open={!!boostListing}
          onOpenChange={(open) => {
            if (!open) setBoostListing(null);
          }}
        />
      )}
    </div>
  );
}

function Package({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}