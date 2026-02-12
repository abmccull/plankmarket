"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCurrency,
  formatSqFt,
  formatDate,
  formatPricePerSqFt,
  calculateBuyerFee,
} from "@/lib/utils";
import {
  ArrowLeft,
  Heart,
  Share2,
  MapPin,
  Package,
  Shield,
  Clock,
  Eye,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

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

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const listingId = params.id as string;

  const { data: listing, isLoading } = trpc.listing.getById.useQuery({
    id: listingId,
  });

  const { data: watchlistStatus } = trpc.watchlist.isWatchlisted.useQuery(
    { listingId },
    { enabled: isAuthenticated }
  );

  const utils = trpc.useUtils();
  const addToWatchlist = trpc.watchlist.add.useMutation();
  const removeFromWatchlist = trpc.watchlist.remove.useMutation();

  const handleWatchlist = async () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/listings/${listingId}`);
      return;
    }

    try {
      if (watchlistStatus?.isWatchlisted) {
        await removeFromWatchlist.mutateAsync({ listingId });
        toast.success("Removed from watchlist");
      } else {
        await addToWatchlist.mutateAsync({ listingId });
        toast.success("Added to watchlist");
      }
      // Invalidate watchlist query so UI updates immediately
      utils.watchlist.isWatchlisted.invalidate({ listingId });
    } catch {
      toast.error("Failed to update watchlist");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Listing Not Found</h1>
        <p className="text-muted-foreground mt-2">
          This listing may have been removed or is no longer available.
        </p>
        <Link href="/listings" className="mt-4 inline-block">
          <Button>Browse Listings</Button>
        </Link>
      </div>
    );
  }

  const lotValue = listing.askPricePerSqFt * listing.totalSqFt;
  const buyerFee = calculateBuyerFee(lotValue);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Image Gallery */}
          <div className="aspect-[16/9] bg-muted rounded-xl overflow-hidden">
            {listing.media?.[0] ? (
              <img
                src={listing.media[0].url}
                alt={listing.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Package className="h-16 w-16 text-muted-foreground/50" />
              </div>
            )}
          </div>

          {/* Image thumbnails */}
          {listing.media && listing.media.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {listing.media.map((img, i) => (
                <div
                  key={img.id}
                  className="h-20 w-20 rounded-md bg-muted overflow-hidden shrink-0"
                >
                  <img
                    src={img.url}
                    alt={`${listing.title} ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Title and badges */}
          <div>
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl font-bold">{listing.title}</h1>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleWatchlist}
                >
                  <Heart
                    className={`h-4 w-4 ${
                      watchlistStatus?.isWatchlisted
                        ? "fill-red-500 text-red-500"
                        : ""
                    }`}
                  />
                </Button>
                <Button variant="outline" size="icon">
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Badge>
                {materialLabels[listing.materialType] ||
                  listing.materialType}
              </Badge>
              <Badge variant="outline">
                {conditionLabels[listing.condition] || listing.condition}
              </Badge>
              {listing.species && (
                <Badge variant="secondary">{listing.species}</Badge>
              )}
            </div>
          </div>

          {/* Description */}
          {listing.description && (
            <div>
              <h2 className="font-semibold mb-2">Description</h2>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {listing.description}
              </p>
            </div>
          )}

          {/* Product Specifications */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Product Specifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <SpecItem
                  label="Material"
                  value={
                    materialLabels[listing.materialType] ||
                    listing.materialType
                  }
                />
                {listing.species && (
                  <SpecItem label="Species" value={listing.species} />
                )}
                {listing.finish && (
                  <SpecItem
                    label="Finish"
                    value={finishLabels[listing.finish] || listing.finish}
                  />
                )}
                {listing.grade && (
                  <SpecItem label="Grade" value={listing.grade} />
                )}
                {listing.thickness && (
                  <SpecItem
                    label="Thickness"
                    value={`${listing.thickness}"`}
                  />
                )}
                {listing.width && (
                  <SpecItem label="Width" value={`${listing.width}"`} />
                )}
                {listing.length && (
                  <SpecItem label="Length" value={`${listing.length}"`} />
                )}
                {listing.color && (
                  <SpecItem label="Color" value={listing.color} />
                )}
                {listing.brand && (
                  <SpecItem label="Brand" value={listing.brand} />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Lot Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lot Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <SpecItem
                  label="Total Sq Ft"
                  value={formatSqFt(listing.totalSqFt)}
                />
                {listing.totalPallets && (
                  <SpecItem
                    label="Pallets"
                    value={listing.totalPallets.toString()}
                  />
                )}
                {listing.sqFtPerBox && (
                  <SpecItem
                    label="Sq Ft / Box"
                    value={listing.sqFtPerBox.toString()}
                  />
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
                    value={formatSqFt(listing.moq)}
                  />
                )}
                <SpecItem
                  label="Condition"
                  value={
                    conditionLabels[listing.condition] || listing.condition
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Certifications */}
          {listing.certifications &&
            (listing.certifications as string[]).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Certifications</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(listing.certifications as string[]).map((cert) => (
                      <Badge key={cert} variant="secondary">
                        <Shield className="mr-1 h-3 w-3" />
                        {cert.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
        </div>

        {/* Sidebar - Purchase */}
        <div className="space-y-4">
          <Card className="sticky top-20">
            <CardContent className="p-6 space-y-4">
              {/* Price */}
              <div>
                <div className="text-3xl font-bold text-primary">
                  {formatPricePerSqFt(listing.askPricePerSqFt)}
                </div>
                <p className="text-sm text-muted-foreground">
                  Lot value: {formatCurrency(lotValue)}
                </p>
              </div>

              <Separator />

              {/* Quick specs */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Available</span>
                  <span className="font-medium">
                    {formatSqFt(listing.totalSqFt)}
                  </span>
                </div>
                {listing.moq && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Min Order</span>
                    <span className="font-medium">
                      {formatSqFt(listing.moq)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Buyer Fee (3%)</span>
                  <span className="font-medium">
                    {formatCurrency(buyerFee)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total (full lot)</span>
                  <span>{formatCurrency(lotValue + buyerFee)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                {listing.buyNowPrice && (
                  <Link
                    href={
                      isAuthenticated
                        ? `/listings/${listing.id}/checkout`
                        : `/login?redirect=/listings/${listing.id}/checkout`
                    }
                    className="block"
                  >
                    <Button className="w-full" size="lg">
                      Buy Now - {formatCurrency(listing.buyNowPrice)}
                    </Button>
                  </Link>
                )}

                {listing.allowOffers && (
                  <Button variant="outline" className="w-full" size="lg">
                    Make an Offer
                  </Button>
                )}

                {!listing.buyNowPrice && !listing.allowOffers && (
                  <Link
                    href={
                      isAuthenticated
                        ? `/listings/${listing.id}/checkout`
                        : `/login?redirect=/listings/${listing.id}/checkout`
                    }
                    className="block"
                  >
                    <Button className="w-full" size="lg">
                      Purchase
                    </Button>
                  </Link>
                )}
              </div>

              <Separator />

              {/* Location */}
              {(listing.locationCity || listing.locationState) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>
                    {[listing.locationCity, listing.locationState]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {listing.viewsCount} views
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="h-3 w-3" />
                  {listing.watchlistCount} watching
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(listing.createdAt)}
                </span>
              </div>

              {/* Seller info */}
              {listing.seller && (
                <>
                  <Separator />
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary">
                        {listing.seller.businessName?.charAt(0) ||
                          listing.seller.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-medium flex items-center gap-1">
                        {listing.seller.businessName || listing.seller.name}
                        {listing.seller.verified && (
                          <Shield className="h-3 w-3 text-primary" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Member since{" "}
                        {formatDate(listing.seller.createdAt)}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SpecItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium mt-0.5">{value}</dd>
    </div>
  );
}
