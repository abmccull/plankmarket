"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SellerPaymentNotReadyDialog } from "@/components/checkout/seller-payment-not-ready-dialog";
import { MakeOfferModal } from "@/components/offers/make-offer-modal";
import {
  formatCurrency,
  formatSqFt,
  formatDate,
  formatPricePerSqFt,
  calculateBuyerFee,
} from "@/lib/utils";
import { BUYER_MARKETPLACE_FEE_PERCENT } from "@/lib/fees";
import { getDirectPurchaseUnitPrice } from "@/lib/listing-pricing";
import {
  Heart,
  Share2,
  AlertTriangle,
  MapPin,
  Shield,
  Clock,
  Eye,
  Loader2,
  MessageSquare,
  HandCoins,
} from "lucide-react";
import { StarRating } from "@/components/shared/star-rating";
import { toast } from "sonner";
import { getAnonymousInitials } from "@/lib/identity/display-name";
import {
  getListingEvidenceAlerts,
  type FreightEstimateStatus,
} from "@/components/listings/listing-evidence";
import type { ListingFreshnessStatus } from "@/lib/listing-freshness";

interface ListingDetailClientProps {
  listing: {
    id: string;
    title: string;
    sellerId: string;
    materialType: string;
    condition: string;
    species: string | null;
    askPricePerSqFt: number;
    totalSqFt: number;
    buyNowPrice: number | null;
    allowOffers: boolean;
    moq: number | null;
    moqUnit: "pallets" | "sqft" | null;
    freightEstimateStatus: FreightEstimateStatus;
    freshnessStatus?: ListingFreshnessStatus;
    lastConfirmedAt?: Date | string | null;
    locationCity: string | null;
    locationState: string | null;
    viewsCount: number;
    watchlistCount: number;
    createdAt: Date | string;
    media?: { url: string }[];
    seller: {
      id: string;
      displayName: string;
      verified: boolean;
      createdAt: Date | string;
      stripeOnboardingComplete: boolean;
      role: string;
    } | null;
  };
}

function formatMoq(moq: number | null, unit: "pallets" | "sqft" | null) {
  if (!moq) return "Full-lot or seller terms";
  if (unit === "pallets") {
    return `${moq.toLocaleString()} pallet${moq === 1 ? "" : "s"}`;
  }
  return formatSqFt(moq);
}

export function ListingDetailClient({ listing }: ListingDetailClientProps) {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, user } = useAuthStore();
  const listingId = params.id as string;

  const [showPaymentNotReadyDialog, setShowPaymentNotReadyDialog] = useState(false);
  const [showMakeOfferModal, setShowMakeOfferModal] = useState(false);
  const [isContactingLoading, setIsContactingLoading] = useState(false);
  const [isRequestingSample, setIsRequestingSample] = useState(false);
  const [viewingAsBuyer, setViewingAsBuyer] = useState(false);

  const {
    data: purchaseConfig,
    isLoading: isPurchaseConfigLoading,
  } = trpc.listing.getPurchaseConfig.useQuery(
    { listingId },
    { enabled: !!listingId },
  );

  const { data: sellerReputation } = trpc.review.getUserReputation.useQuery(
    { userId: listing.sellerId },
    { enabled: !!listing.seller }
  );

  const { data: watchlistStatus } = trpc.watchlist.isWatchlisted.useQuery(
    { listingId },
    { enabled: isAuthenticated }
  );

  const utils = trpc.useUtils();
  const addToWatchlist = trpc.watchlist.add.useMutation();
  const removeFromWatchlist = trpc.watchlist.remove.useMutation();
  const getOrCreateConversation = trpc.message.getOrCreateConversation.useMutation();

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

  const handleShare = async () => {
    const url = window.location.href;
    const title = listing?.title || "PlankMarket Listing";
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        toast.error("Failed to share listing");
      }
    }
  };

  const handleBuyNowClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!listing?.seller) return;

    // Check if seller has completed Stripe onboarding
    if (!listing.seller.stripeOnboardingComplete) {
      e.preventDefault();
      setShowPaymentNotReadyDialog(true);
    }
  };

  const handleContactSeller = async () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/listings/${listingId}`);
      return;
    }

    setIsContactingLoading(true);
    try {
      const conversation = await getOrCreateConversation.mutateAsync({
        listingId,
      });

      if (conversation?.id) {
        toast.success("Opening conversation with seller");
        router.push(`/messages/${conversation.id}`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to contact seller";
      toast.error(message);
    } finally {
      setIsContactingLoading(false);
    }
  };

  const handleMakeOfferClick = () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/listings/${listingId}`);
      return;
    }

    if (!purchaseConfig) {
      toast.error(
        "We are still verifying this listing's purchase rules. Please try again.",
      );
      return;
    }

    setShowMakeOfferModal(true);
  };

  const handleRequestSample = async () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/listings/${listingId}`);
      return;
    }

    setIsRequestingSample(true);
    router.push(`/buyer/samples/new?listingId=${listingId}`);
  };

  // Check if current user is the seller
  const isOwner = user && listing?.sellerId === user.id;
  const isOwnListing = isOwner && !viewingAsBuyer;
  const canRequestSample =
    purchaseConfig?.allowSampleRequests &&
    (!user || user.role === "buyer" || user.role === "admin");

  const directPurchaseUnitPrice = getDirectPurchaseUnitPrice(listing);
  const lotValue = directPurchaseUnitPrice * listing.totalSqFt;
  const buyerFee = calculateBuyerFee(lotValue);
  const freightReady =
    listing.freightEstimateStatus === "quote_request_ready";
  const evidenceAlerts = getListingEvidenceAlerts({
    totalSqFt: listing.totalSqFt,
    moq: listing.moq,
    moqUnit: listing.moqUnit,
    condition: listing.condition,
    locationCity: listing.locationCity,
    locationState: listing.locationState,
    freightEstimateStatus: listing.freightEstimateStatus,
    freshnessStatus: listing.freshnessStatus,
    lastConfirmedAt: listing.lastConfirmedAt,
    media: listing.media,
    seller: listing.seller,
  });
  const knownNowItems = [
    `Direct purchase unit price ${formatPricePerSqFt(directPurchaseUnitPrice)}`,
    `Lot subtotal ${formatCurrency(lotValue)}`,
    `Buyer marketplace fee ${formatCurrency(buyerFee)}`,
    `Minimum order ${formatMoq(listing.moq, listing.moqUnit)}`,
  ];
  const calculatedLaterItems = [
    freightReady
      ? "Freight quote is calculated after destination details are entered at checkout."
      : "Freight quote is not ready from this listing yet because seller freight setup is incomplete.",
    purchaseConfig?.canSplitLots === false
      ? "Full-lot purchasing rules are fixed now."
      : purchaseConfig?.partialQuantityMarkupPercent != null
        ? `Partial-lot pricing adds +${purchaseConfig.partialQuantityMarkupPercent}% below the full lot.`
        : "Partial-lot pricing depends on seller purchase rules.",
  ];

  return (
    <>
      {/* Sidebar - Purchase Card */}
      <div className="space-y-4">
        {/* Action buttons - watchlist and share */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleWatchlist}
            aria-label={watchlistStatus?.isWatchlisted ? "Remove from watchlist" : "Add to watchlist"}
            aria-pressed={watchlistStatus?.isWatchlisted}
            className="flex-1"
          >
            <Heart
              className={`h-4 w-4 ${
                watchlistStatus?.isWatchlisted
                  ? "fill-red-500 text-red-500"
                  : ""
              }`}
            />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleShare}
            aria-label="Share listing"
            className="flex-1"
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
        <Card className="sticky top-20 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-primary to-secondary" />
          <CardContent className="p-6 space-y-4">
            {/* Price */}
            <div>
              <div className="text-3xl font-display font-bold text-primary tabular-nums">
                {formatPricePerSqFt(directPurchaseUnitPrice)}
              </div>
              <p className="text-sm text-muted-foreground tabular-nums">
                Direct purchase lot: {formatCurrency(lotValue)}
              </p>
              {listing.buyNowPrice != null &&
                listing.buyNowPrice !== listing.askPricePerSqFt && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Seller ask for offers:{" "}
                    {formatPricePerSqFt(listing.askPricePerSqFt)}
                  </p>
                )}
            </div>

            <Separator />

            {/* Quick specs */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Available</span>
                <span className="font-medium tabular-nums">
                  {formatSqFt(listing.totalSqFt)}
                </span>
              </div>
              {listing.moq && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Min Order</span>
                  <span className="font-medium tabular-nums">
                    {listing.moqUnit === "pallets"
                      ? `${listing.moq.toLocaleString()} pallet${listing.moq === 1 ? "" : "s"}`
                      : formatSqFt(listing.moq)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Buyer Fee ({BUYER_MARKETPLACE_FEE_PERCENT}%)
                </span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(buyerFee)}
                </span>
              </div>
              {purchaseConfig?.canSplitLots === false && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lot Policy</span>
                  <span className="font-medium text-right">Full lot only</span>
                </div>
              )}
              {purchaseConfig?.canSplitLots &&
                purchaseConfig.partialQuantityMarkupPercent != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Partial Orders</span>
                    <span className="font-medium text-right">
                      +{purchaseConfig.partialQuantityMarkupPercent}% below full lot
                    </span>
                  </div>
                )}
              {purchaseConfig?.sellingTerritoryMode === "allowed_states" &&
                purchaseConfig.allowedDestinationStates.length > 0 && (
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-muted-foreground">Selling Territory</span>
                    <span className="font-medium text-right">
                      {purchaseConfig.allowedDestinationStates.join(", ")}
                    </span>
                  </div>
                )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="font-medium text-right">
                  {freightReady
                    ? "Quote request at checkout"
                    : "Contact seller for freight"}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold tabular-nums">
                <span>Total before shipping</span>
                <span>{formatCurrency(lotValue + buyerFee)}</span>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Known now
                </p>
                <ul className="mt-2 space-y-1 text-sm text-foreground">
                  {knownNowItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <Separator />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Calculated later
                </p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {calculatedLaterItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {evidenceAlerts.length > 0 && (
              <div className="space-y-3">
                {evidenceAlerts.map((alert) => {
                  const blocked = alert.tone === "blocked";

                  return (
                    <div
                      key={`${alert.tone}-${alert.title}`}
                      className={
                        blocked
                          ? "rounded-xl border border-destructive/30 bg-destructive/5 p-4"
                          : "rounded-xl border border-amber-300/40 bg-amber-50/60 p-4 dark:bg-amber-950/10"
                      }
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={
                            blocked
                              ? "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
                              : "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                          }
                        >
                          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={blocked ? "destructive" : "warning"}>
                              {blocked ? "Blocked" : "Warning"}
                            </Badge>
                            <p className="text-sm font-semibold">{alert.title}</p>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {alert.detail}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Actions */}
            {isOwnListing ? (
              <div className="flex flex-col gap-3">
                <Button asChild className="w-full" size="lg">
                  <Link href={`/seller/listings/${listing.id}/edit`}>
                    Edit Listing
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  size="lg"
                  onClick={() => setViewingAsBuyer(true)}
                >
                  View as Buyer
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Primary action - Buy Now or Purchase */}
                {listing.buyNowPrice ? (
                  <Button
                    asChild
                    variant="secondary"
                    className="w-full tabular-nums"
                    size="lg"
                  >
                    <Link
                      href={
                        isAuthenticated
                          ? `/listings/${listing.id}/checkout`
                          : `/login?redirect=/listings/${listing.id}/checkout`
                      }
                      onClick={handleBuyNowClick}
                    >
                      Buy Now - {formatPricePerSqFt(listing.buyNowPrice)}
                    </Link>
                  </Button>
                ) : !listing.allowOffers ? (
                  <Button asChild className="w-full" size="lg">
                    <Link
                      href={
                        isAuthenticated
                          ? `/listings/${listing.id}/checkout`
                          : `/login?redirect=/listings/${listing.id}/checkout`
                      }
                      onClick={handleBuyNowClick}
                    >
                      Purchase
                    </Link>
                  </Button>
                ) : null}

                {/* Secondary actions - Make Offer and Contact Seller */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {listing.allowOffers && (
                    <Button
                      variant="outline"
                      className="w-full"
                      size="lg"
                      onClick={handleMakeOfferClick}
                      disabled={isPurchaseConfigLoading || !purchaseConfig}
                      aria-label="Make an offer on this listing"
                    >
                      <HandCoins className="mr-2 h-4 w-4" aria-hidden="true" />
                      Make Offer
                    </Button>
                  )}

                  <Button
                    variant={listing.allowOffers ? "outline" : "default"}
                    className={listing.allowOffers ? "w-full" : "w-full sm:col-span-2"}
                    size="lg"
                    onClick={handleContactSeller}
                    disabled={isContactingLoading}
                    aria-label="Contact the seller"
                  >
                    {isContactingLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />
                        Contact Seller
                      </>
                    )}
                  </Button>
                </div>

                {canRequestSample && (
                  <Button
                    variant="outline"
                    className="w-full"
                    size="lg"
                    onClick={handleRequestSample}
                    disabled={isRequestingSample}
                  >
                    {isRequestingSample ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        Opening sample request...
                      </>
                    ) : (
                      <>
                        <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />
                        Request Sample
                      </>
                    )}
                  </Button>
                )}

                {viewingAsBuyer && (
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    size="sm"
                    onClick={() => setViewingAsBuyer(false)}
                  >
                    Back to Seller View
                  </Button>
                )}
              </div>
            )}

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
                      {getAnonymousInitials(listing.seller.role)}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium flex items-center gap-1">
                      {listing.seller.displayName}
                      {listing.seller.verified && (
                        <Shield className="h-3 w-3 text-secondary" />
                      )}
                    </div>
                    {sellerReputation &&
                    sellerReputation.averageRating !== null ? (
                      <div className="flex items-center gap-1 text-xs">
                        <StarRating
                          value={sellerReputation.averageRating}
                          readonly
                          size="sm"
                        />
                        <span className="font-medium">
                          {sellerReputation.averageRating}
                        </span>
                        <span className="text-muted-foreground">
                          ({sellerReputation.reviewCount} review
                          {sellerReputation.reviewCount !== 1 ? "s" : ""})
                        </span>
                        <span className="text-muted-foreground">
                          &middot; {sellerReputation.completedTransactions}{" "}
                          transaction
                          {sellerReputation.completedTransactions !== 1
                            ? "s"
                            : ""}
                        </span>
                      </div>
                    ) : sellerReputation &&
                      sellerReputation.completedTransactions > 0 ? (
                      <div className="text-xs text-muted-foreground">
                        New seller &middot;{" "}
                        {sellerReputation.completedTransactions} transaction
                        {sellerReputation.completedTransactions !== 1
                          ? "s"
                          : ""}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        New to Plank Market
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div
        data-testid="mobile-listing-action-bar"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(41,26,17,0.12)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Direct purchase</p>
            <p className="truncate font-display text-lg font-bold text-primary tabular-nums">
              <span>{formatCurrency(directPurchaseUnitPrice)}</span>
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                / sq ft
              </span>
            </p>
          </div>

          {isOwnListing ? (
            <Button asChild size="lg">
              <Link
                href={`/seller/listings/${listing.id}/edit`}
                aria-label="Edit this listing"
              >
                Edit listing
              </Link>
            </Button>
          ) : listing.buyNowPrice ? (
            <Button
              asChild
              variant="secondary"
              size="lg"
            >
              <Link
                href={
                  isAuthenticated
                    ? `/listings/${listing.id}/checkout`
                    : `/login?redirect=/listings/${listing.id}/checkout`
                }
                onClick={handleBuyNowClick}
                aria-label={`Buy now at ${formatPricePerSqFt(listing.buyNowPrice)}`}
              >
                Buy now
              </Link>
            </Button>
          ) : !listing.allowOffers ? (
            <Button asChild size="lg">
              <Link
                href={
                  isAuthenticated
                    ? `/listings/${listing.id}/checkout`
                    : `/login?redirect=/listings/${listing.id}/checkout`
                }
                onClick={handleBuyNowClick}
                aria-label="Purchase this listing"
              >
                Purchase
              </Link>
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={handleMakeOfferClick}
              disabled={isPurchaseConfigLoading || !purchaseConfig}
              aria-label="Make an offer from the mobile action bar"
            >
              Make offer
            </Button>
          )}
        </div>
      </div>

      {/* Payment Not Ready Dialog */}
      {listing.seller && (
        <SellerPaymentNotReadyDialog
          open={showPaymentNotReadyDialog}
          onOpenChange={setShowPaymentNotReadyDialog}
          sellerId={listing.seller.id}
          sellerName={listing.seller.displayName}
          listingId={listing.id}
        />
      )}

      {/* Make Offer Modal */}
      <MakeOfferModal
        open={showMakeOfferModal}
        onOpenChange={setShowMakeOfferModal}
        listingId={listing.id}
        listingTitle={listing.title}
        askPricePerSqFt={listing.askPricePerSqFt}
        totalSqFt={listing.totalSqFt}
        moq={listing.moq}
        fullLotOnly={purchaseConfig?.fullLotOnly ?? true}
      />
    </>
  );
}
