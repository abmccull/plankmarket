"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import {
  Heart,
  Share2,
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
import { getAnonymousDisplayName, getAnonymousInitials } from "@/lib/identity/display-name";

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
    locationCity: string | null;
    locationState: string | null;
    viewsCount: number;
    watchlistCount: number;
    createdAt: Date | string;
    seller: {
      id: string;
      name: string;
      verified: boolean;
      createdAt: Date | string;
      stripeOnboardingComplete: boolean;
      businessCity: string | null;
      businessState: string | null;
      role: string;
    } | null;
  };
}

export function ListingDetailClient({ listing }: ListingDetailClientProps) {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, user } = useAuthStore();
  const listingId = params.id as string;

  const [showPaymentNotReadyDialog, setShowPaymentNotReadyDialog] = useState(false);
  const [showMakeOfferModal, setShowMakeOfferModal] = useState(false);
  const [isContactingLoading, setIsContactingLoading] = useState(false);
  const [viewingAsBuyer, setViewingAsBuyer] = useState(false);

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

    setShowMakeOfferModal(true);
  };

  // Check if current user is the seller
  const isOwner = user && listing?.sellerId === user.id;
  const isOwnListing = isOwner && !viewingAsBuyer;

  const lotValue = listing.askPricePerSqFt * listing.totalSqFt;
  const buyerFee = calculateBuyerFee(lotValue);

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
                {formatPricePerSqFt(listing.askPricePerSqFt)}
              </div>
              <p className="text-sm text-muted-foreground tabular-nums">
                Lot value: {formatCurrency(lotValue)}
              </p>
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
                    {formatSqFt(listing.moq)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Buyer Fee (3%)</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(buyerFee)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold tabular-nums">
                <span>Total (full lot)</span>
                <span>{formatCurrency(lotValue + buyerFee)}</span>
              </div>
            </div>

            {/* Actions */}
            {isOwnListing ? (
              <div className="space-y-2">
                <Link href={`/seller/listings/${listing.id}/edit`}>
                  <Button className="w-full" size="lg">
                    Edit Listing
                  </Button>
                </Link>
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
                  <Link
                    href={
                      isAuthenticated
                        ? `/listings/${listing.id}/checkout`
                        : `/login?redirect=/listings/${listing.id}/checkout`
                    }
                    className="block"
                    onClick={handleBuyNowClick}
                  >
                    <Button variant="secondary" className="w-full tabular-nums" size="lg">
                      Buy Now - {formatCurrency(listing.buyNowPrice)}
                    </Button>
                  </Link>
                ) : !listing.allowOffers ? (
                  <Link
                    href={
                      isAuthenticated
                        ? `/listings/${listing.id}/checkout`
                        : `/login?redirect=/listings/${listing.id}/checkout`
                    }
                    className="block"
                    onClick={handleBuyNowClick}
                  >
                    <Button className="w-full" size="lg">
                      Purchase
                    </Button>
                  </Link>
                ) : null}

                {/* Secondary actions - Make Offer and Contact Seller */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {listing.allowOffers && (
                    <Button
                      variant="outline"
                      className="w-full"
                      size="lg"
                      onClick={handleMakeOfferClick}
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
                      {getAnonymousDisplayName({
                        role: listing.seller.role,
                        businessState: listing.seller.businessState,
                        name: listing.seller.name,
                        businessCity: listing.seller.businessCity
                      })}
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

      {/* Payment Not Ready Dialog */}
      {listing.seller && (
        <SellerPaymentNotReadyDialog
          open={showPaymentNotReadyDialog}
          onOpenChange={setShowPaymentNotReadyDialog}
          sellerId={listing.seller.id}
          sellerName={getAnonymousDisplayName({
            role: listing.seller.role,
            businessState: listing.seller.businessState,
            name: listing.seller.name,
            businessCity: listing.seller.businessCity
          })}
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
      />
    </>
  );
}
