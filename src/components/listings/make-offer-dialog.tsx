"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency, formatSqFt, formatPricePerSqFt } from "@/lib/utils";

const makeOfferSchema = z.object({
  offerPricePerSqFt: z
    .number()
    .positive("Offer price must be positive")
    .max(1000, "Price seems too high"),
  quantitySqFt: z
    .number()
    .positive("Quantity must be positive"),
  message: z
    .string()
    .max(500, "Message must be at most 500 characters")
    .optional(),
});

type MakeOfferFormData = z.infer<typeof makeOfferSchema>;

export interface MakeOfferDialogProps {
  listing: {
    id: string;
    title: string;
    askPricePerSqFt: number;
    totalSqFt: number;
    sellerId: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BUYER_FEE_PERCENTAGE = 0.03;

export function MakeOfferDialog({
  listing,
  open,
  onOpenChange,
}: MakeOfferDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<MakeOfferFormData>({
    resolver: zodResolver(makeOfferSchema),
    defaultValues: {
      quantitySqFt: listing.totalSqFt,
    },
  });

  const offerPricePerSqFt = useWatch({ control, name: "offerPricePerSqFt" }) || 0;
  const quantitySqFt = useWatch({ control, name: "quantitySqFt" }) || 0;

  const subtotal = offerPricePerSqFt * quantitySqFt;
  const buyerFee = subtotal * BUYER_FEE_PERCENTAGE;
  const totalCost = subtotal + buyerFee;

  const createOfferMutation = trpc.offer.createOffer.useMutation();

  const onSubmit = async (data: MakeOfferFormData) => {
    setIsSubmitting(true);
    try {
      await createOfferMutation.mutateAsync({
        listingId: listing.id,
        offerPricePerSqFt: data.offerPricePerSqFt,
        quantitySqFt: data.quantitySqFt,
        message: data.message,
      });
      toast.success("Offer submitted successfully!");
      reset();
      onOpenChange(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to submit offer";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Make an Offer</DialogTitle>
          <DialogDescription>
            Submit your offer for {listing.title}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="offerPricePerSqFt">
              Offer Price per Sq Ft ($)
            </Label>
            <Input
              id="offerPricePerSqFt"
              type="number"
              step="0.01"
              placeholder={listing.askPricePerSqFt.toFixed(2)}
              {...register("offerPricePerSqFt", { valueAsNumber: true })}
            />
            {errors.offerPricePerSqFt && (
              <p className="text-sm text-destructive">
                {errors.offerPricePerSqFt.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Ask price: {formatPricePerSqFt(listing.askPricePerSqFt)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantitySqFt">Quantity (sq ft)</Label>
            <Input
              id="quantitySqFt"
              type="number"
              step="0.01"
              placeholder={listing.totalSqFt.toString()}
              {...register("quantitySqFt", { valueAsNumber: true })}
            />
            {errors.quantitySqFt && (
              <p className="text-sm text-destructive">
                {errors.quantitySqFt.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Available: {formatSqFt(listing.totalSqFt)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message (optional)</Label>
            <Textarea
              id="message"
              rows={3}
              placeholder="Add a message to the seller..."
              {...register("message")}
            />
            {errors.message && (
              <p className="text-sm text-destructive">
                {errors.message.message}
              </p>
            )}
          </div>

          <Separator />

          {/* Calculation Summary */}
          {offerPricePerSqFt > 0 && quantitySqFt > 0 && (
            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              <h4 className="text-sm font-medium mb-3">Offer Summary</h4>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">
                  {formatCurrency(subtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Buyer fee (3%)
                </span>
                <span className="font-medium">
                  {formatCurrency(buyerFee)}
                </span>
              </div>
              <Separator className="my-2" />
              <div className="flex items-center justify-between">
                <span className="font-semibold">Total Cost</span>
                <span className="font-bold text-primary text-lg">
                  {formatCurrency(totalCost)}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Submit Offer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
