"use client";

import { useState, type FormEvent } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StripeProvider } from "@/components/checkout/stripe-provider";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { cn, formatCurrency } from "@/lib/utils";
import { Loader2, Rocket, Star, Crown, Check, AlertCircle, ArrowLeft, CheckCircle2 } from "lucide-react";
import type { PromotionTier } from "@/types";

interface BoostModalProps {
  listingId: string;
  listingTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TIER_INFO: Record<
  PromotionTier,
  {
    label: string;
    icon: typeof Rocket;
    color: string;
    benefits: string[];
  }
> = {
  spotlight: {
    label: "Spotlight",
    icon: Rocket,
    color: "border-blue-500 bg-blue-50 dark:bg-blue-950/20",
    benefits: [
      "Search rank boost",
      '"Spotlight" badge on listing',
    ],
  },
  featured: {
    label: "Featured",
    icon: Star,
    color: "border-amber-500 bg-amber-50 dark:bg-amber-950/20",
    benefits: [
      "Higher search rank boost",
      '"Featured" badge on listing',
      "Homepage carousel placement",
    ],
  },
  premium: {
    label: "Premium",
    icon: Crown,
    color: "border-purple-500 bg-purple-50 dark:bg-purple-950/20",
    benefits: [
      "Highest search rank boost",
      '"Premium" badge on listing',
      "Homepage hero rotation",
      "Homepage carousel placement",
    ],
  },
};

const DURATIONS = [7, 14, 30] as const;

type ModalStep = "select" | "payment" | "success";

function PromotionPaymentForm({
  price,
  onSuccess,
}: {
  price: number;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!stripe || !elements) return;

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/seller/listings`,
        },
        redirect: "if_required",
      });

      if (error) {
        setErrorMessage(error.message || "An error occurred during payment processing.");
      } else {
        onSuccess();
      }
    } catch {
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border bg-background p-4">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={!stripe || !elements || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          `Pay ${formatCurrency(price)}`
        )}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        Your payment is secured by Stripe. We never store your card details.
      </p>
    </form>
  );
}

export function BoostModal({
  listingId,
  listingTitle,
  open,
  onOpenChange,
}: BoostModalProps) {
  const [selectedTier, setSelectedTier] = useState<PromotionTier>("spotlight");
  const [selectedDuration, setSelectedDuration] = useState<7 | 14 | 30>(7);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<ModalStep>("select");
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const { data: pricing } = trpc.promotion.getPricing.useQuery();
  const utils = trpc.useUtils();

  const purchaseMutation = trpc.promotion.purchase.useMutation({
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
      setStep("payment");
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const price = pricing?.[selectedTier]?.[selectedDuration] ?? 0;

  const handlePurchase = () => {
    setError(null);
    purchaseMutation.mutate({
      listingId,
      tier: selectedTier,
      durationDays: selectedDuration,
    });
  };

  const handlePaymentSuccess = () => {
    utils.promotion.getMyPromotions.invalidate();
    utils.promotion.getActiveForListing.invalidate({ listingId });
    setStep("success");
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      // Reset state when closing
      setStep("select");
      setClientSecret(null);
      setError(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {step === "select" && (
          <>
            <DialogHeader>
              <DialogTitle>Boost Your Listing</DialogTitle>
              <DialogDescription>
                Promote &ldquo;{listingTitle}&rdquo; to get more views and move
                inventory faster.
              </DialogDescription>
            </DialogHeader>

            {/* Tier Selection */}
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(TIER_INFO) as PromotionTier[]).map((tier) => {
                const info = TIER_INFO[tier];
                const Icon = info.icon;
                const isSelected = selectedTier === tier;

                return (
                  <Card
                    key={tier}
                    className={cn(
                      "cursor-pointer border-2 transition-all",
                      isSelected
                        ? info.color + " ring-2 ring-offset-2 ring-primary"
                        : "hover:border-muted-foreground/50"
                    )}
                    onClick={() => setSelectedTier(tier)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Icon className="h-5 w-5" />
                        <span className="font-semibold">{info.label}</span>
                      </div>
                      <ul className="space-y-1.5">
                        {info.benefits.map((benefit) => (
                          <li
                            key={benefit}
                            className="text-xs text-muted-foreground flex items-start gap-1.5"
                          >
                            <Check className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                            {benefit}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Duration Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">Duration</label>
              <div className="flex gap-2">
                {DURATIONS.map((days) => (
                  <Button
                    key={days}
                    variant={selectedDuration === days ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedDuration(days)}
                    className="flex-1"
                  >
                    {days} days
                    {pricing && (
                      <span className="ml-1 font-bold">
                        {formatCurrency(pricing[selectedTier]?.[days] ?? 0)}
                      </span>
                    )}
                  </Button>
                ))}
              </div>
            </div>

            {/* Price Summary */}
            <div className="rounded-lg border p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">
                    {TIER_INFO[selectedTier].label} &middot; {selectedDuration} days
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Promotion starts immediately after payment
                  </p>
                </div>
                <div className="text-2xl font-bold text-primary">
                  {formatCurrency(price)}
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={handlePurchase}
                disabled={purchaseMutation.isPending || !price}
              >
                {purchaseMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Continue to Payment
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "payment" && clientSecret && (
          <>
            <DialogHeader>
              <DialogTitle>Complete Payment</DialogTitle>
              <DialogDescription>
                {TIER_INFO[selectedTier].label} promotion &middot; {selectedDuration} days &middot; {formatCurrency(price)}
              </DialogDescription>
            </DialogHeader>

            <StripeProvider clientSecret={clientSecret}>
              <PromotionPaymentForm
                price={price}
                onSuccess={handlePaymentSuccess}
              />
            </StripeProvider>

            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={() => {
                setStep("select");
                setClientSecret(null);
              }}
            >
              <ArrowLeft className="mr-1 h-3 w-3" />
              Back to tier selection
            </Button>
          </>
        )}

        {step === "success" && (
          <div className="py-8 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <div>
              <h3 className="text-lg font-semibold">Promotion Activated!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your {TIER_INFO[selectedTier].label} promotion for &ldquo;{listingTitle}&rdquo; is now live for {selectedDuration} days.
              </p>
            </div>
            <Button onClick={() => handleClose(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
