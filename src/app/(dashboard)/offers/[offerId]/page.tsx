"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { OfferStatusBadge } from "@/components/offers/offer-status-badge";
import { OfferTimeline } from "@/components/offers/offer-timeline";
import { CounterOfferForm } from "@/components/offers/counter-offer-form";
import { formatCurrency, formatSqFt, getErrorMessage } from "@/lib/utils";
import {
  ArrowLeft,
  ExternalLink,
  User,
  Loader2,
  AlertCircle,
  Ban,
} from "lucide-react";
import { toast } from "sonner";

export default function OfferDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const offerId = params.offerId as string;

  const [showCounterForm, setShowCounterForm] = useState(false);
  const [showAcceptDialog, setShowAcceptDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [rejectMessage, setRejectMessage] = useState("");

  const { data: offer, isLoading } = trpc.offer.getOfferById.useQuery({
    offerId,
  });

  const utils = trpc.useUtils();

  const counterMutation = trpc.offer.counterOffer.useMutation({
    onSuccess: () => {
      utils.offer.getOfferById.invalidate({ offerId });
      utils.offer.getMyOffers.invalidate();
    },
  });

  const acceptMutation = trpc.offer.acceptOffer.useMutation({
    onSuccess: () => {
      utils.offer.getOfferById.invalidate({ offerId });
      utils.offer.getMyOffers.invalidate();
    },
  });

  const rejectMutation = trpc.offer.rejectOffer.useMutation({
    onSuccess: () => {
      utils.offer.getOfferById.invalidate({ offerId });
      utils.offer.getMyOffers.invalidate();
    },
  });

  const withdrawMutation = trpc.offer.withdrawOffer.useMutation({
    onSuccess: () => {
      utils.offer.getOfferById.invalidate({ offerId });
      utils.offer.getMyOffers.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold">Offer Not Found</h2>
        <p className="text-muted-foreground mt-2">
          This offer may have been removed or you don&apos;t have access to it.
        </p>
        <Link href="/offers" className="mt-4 inline-block">
          <Button>Back to Offers</Button>
        </Link>
      </div>
    );
  }

  const isBuyer = offer.buyerId === user?.id;
  const isSeller = offer.sellerId === user?.id;
  const isYourTurn =
    offer.lastActorId &&
    offer.lastActorId !== user?.id &&
    (offer.status === "pending" || offer.status === "countered");

  const canAct = isYourTurn && (offer.status === "pending" || offer.status === "countered");
  const canWithdraw =
    isBuyer && (offer.status === "pending" || offer.status === "countered");

  // Determine current price
  const currentPrice = offer.counterPricePerSqFt || offer.offerPricePerSqFt;
  const currentTotal = currentPrice * offer.quantitySqFt;

  const handleCounter = async (data: {
    pricePerSqFt: number;
    message?: string;
  }) => {
    try {
      await counterMutation.mutateAsync({
        offerId: offer.id,
        pricePerSqFt: data.pricePerSqFt,
        message: data.message,
      });
      setShowCounterForm(false);
      toast.success("Counter offer submitted");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to submit counter offer"));
    }
  };

  const handleAccept = async () => {
    try {
      await acceptMutation.mutateAsync({ offerId: offer.id });
      setShowAcceptDialog(false);
      toast.success("Offer accepted");
      router.push("/offers");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to accept offer"));
    }
  };

  const handleReject = async () => {
    try {
      await rejectMutation.mutateAsync({
        offerId: offer.id,
        message: rejectMessage || undefined,
      });
      setShowRejectDialog(false);
      toast.success("Offer rejected");
      router.push("/offers");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to reject offer"));
    }
  };

  const handleWithdraw = async () => {
    try {
      await withdrawMutation.mutateAsync({ offerId: offer.id });
      setShowWithdrawDialog(false);
      toast.success("Offer withdrawn");
      router.push("/offers");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to withdraw offer"));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Link href="/offers">
            <Button variant="ghost" size="icon" aria-label="Back to offers">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Offer Details</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            href={`/listings/${(offer as any).listing.id}`}
            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(offer as any).listing.title}
            <ExternalLink className="h-3 w-3" />
          </Link>
          <span className="text-muted-foreground">•</span>
          <OfferStatusBadge status={offer.status} />
          <span className="text-muted-foreground">•</span>
          <span className="text-sm text-muted-foreground">
            Round {offer.currentRound}
          </span>
        </div>
      </div>

      {/* Your turn banner */}
      {isYourTurn && (
        <div className="rounded-lg border-2 border-primary bg-primary/10 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-primary" />
            <p className="font-semibold">It&apos;s your turn to respond</p>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            You can accept, reject, or counter this offer.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main content - Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Parties */}
          <Card>
            <CardHeader>
              <CardTitle>Parties</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      Buyer {isBuyer && "(You)"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(offer as any).buyer.businessName || (offer as any).buyer.name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-secondary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      Seller {isSeller && "(You)"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(offer as any).seller.businessName || (offer as any).seller.name}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current Terms */}
          <Card>
            <CardHeader>
              <CardTitle>Current Terms</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Price per sq ft</span>
                  <span className="text-xl font-bold tabular-nums">
                    {formatCurrency(currentPrice)}/sq ft
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Quantity</span>
                  <span className="font-semibold tabular-nums">
                    {formatSqFt(offer.quantitySqFt)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-lg font-medium">Total</span>
                  <span className="text-2xl font-bold tabular-nums">
                    {formatCurrency(currentTotal)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Negotiation Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <OfferTimeline events={(offer as any).events} currentUserId={user?.id || ""} />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Actions */}
        <div className="space-y-4">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canAct && !showCounterForm && (
                <>
                  <Button
                    className="w-full"
                    onClick={() => setShowAcceptDialog(true)}
                    disabled={acceptMutation.isPending}
                  >
                    {acceptMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Accept Offer
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setShowCounterForm(true)}
                  >
                    Submit Counter Offer
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowRejectDialog(true)}
                    disabled={rejectMutation.isPending}
                  >
                    {rejectMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Reject Offer
                  </Button>
                </>
              )}

              {showCounterForm && (
                <div className="space-y-3">
                  <h4 className="font-semibold">Counter Offer</h4>
                  <CounterOfferForm
                    currentPricePerSqFt={currentPrice}
                    quantitySqFt={offer.quantitySqFt}
                    onSubmit={handleCounter}
                    onCancel={() => setShowCounterForm(false)}
                    isLoading={counterMutation.isPending}
                  />
                </div>
              )}

              {canWithdraw && !showCounterForm && (
                <>
                  <Separator />
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => setShowWithdrawDialog(true)}
                    disabled={withdrawMutation.isPending}
                  >
                    {withdrawMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    <Ban className="mr-2 h-4 w-4" />
                    Withdraw Offer
                  </Button>
                </>
              )}

              {!canAct && !canWithdraw && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  {offer.status === "accepted" && "This offer has been accepted"}
                  {offer.status === "rejected" && "This offer has been rejected"}
                  {offer.status === "withdrawn" && "This offer has been withdrawn"}
                  {offer.status === "expired" && "This offer has expired"}
                  {(offer.status === "pending" || offer.status === "countered") &&
                    !isYourTurn &&
                    "Waiting for the other party to respond"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Accept dialog */}
      <AlertDialog open={showAcceptDialog} onOpenChange={setShowAcceptDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept this offer?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to accept this offer for {formatCurrency(currentPrice)}/sq ft
              ({formatSqFt(offer.quantitySqFt)} total: {formatCurrency(currentTotal)}).
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAccept}>
              Accept Offer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this offer?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject this offer? You can optionally provide a
              reason.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="rejectMessage">Reason (optional)</Label>
            <Textarea
              id="rejectMessage"
              placeholder="Explain why you're rejecting this offer..."
              rows={3}
              maxLength={500}
              value={rejectMessage}
              onChange={(e) => setRejectMessage(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject}>
              Reject Offer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Withdraw dialog */}
      <AlertDialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw this offer?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to withdraw your offer? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleWithdraw}>
              Withdraw Offer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
