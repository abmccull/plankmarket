"use client";

import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import { Loader2, Rocket, Star, Crown, Check, AlertCircle } from "lucide-react";
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
      "Search rank boost (top 20%)",
      '"Spotlight" badge on listing',
      "Category carousel placement",
    ],
  },
  featured: {
    label: "Featured",
    icon: Star,
    color: "border-amber-500 bg-amber-50 dark:bg-amber-950/20",
    benefits: [
      "Top 5% search rank",
      "Homepage featured grid",
      "Category banner placement",
      "Weekly email digest inclusion",
    ],
  },
  premium: {
    label: "Premium",
    icon: Crown,
    color: "border-purple-500 bg-purple-50 dark:bg-purple-950/20",
    benefits: [
      "Guaranteed top-3 placement",
      "Homepage hero rotation",
      "Targeted email blast",
      "Enlarged listing card",
    ],
  },
};

const DURATIONS = [7, 14, 30] as const;

/**
 * Render a modal that lets users choose a promotion tier and duration and purchase a boost for a listing.
 *
 * @param listingId - The ID of the listing to be promoted
 * @param listingTitle - The listing title shown in the modal description
 * @param open - Whether the modal is currently open
 * @param onOpenChange - Callback invoked when the modal open state should change
 * @returns The rendered modal as a `JSX.Element`
 */
export function BoostModal({
  listingId,
  listingTitle,
  open,
  onOpenChange,
}: BoostModalProps) {
  const [selectedTier, setSelectedTier] = useState<PromotionTier>("spotlight");
  const [selectedDuration, setSelectedDuration] = useState<7 | 14 | 30>(7);
  const [error, setError] = useState<string | null>(null);

  const { data: pricing } = trpc.promotion.getPricing.useQuery();
  const utils = trpc.useUtils();

  const purchaseMutation = trpc.promotion.purchase.useMutation({
    onSuccess: () => {
      utils.promotion.getMyPromotions.invalidate();
      utils.promotion.getActiveForListing.invalidate({ listingId });
      onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePurchase}
            disabled={purchaseMutation.isPending || !price}
          >
            {purchaseMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Pay {formatCurrency(price)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}