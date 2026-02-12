"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc/client";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatSqFt, calculateBuyerFee } from "@/lib/utils";

const makeOfferFormSchema = z.object({
  offerPricePerSqFt: z
    .number()
    .positive("Price per sq ft must be positive")
    .max(1000, "Price seems too high"),
  quantitySqFt: z
    .number()
    .positive("Quantity must be positive")
    .max(1000000, "Quantity seems too high"),
  message: z
    .string()
    .max(1000, "Message is too long")
    .optional(),
});

type MakeOfferFormValues = z.infer<typeof makeOfferFormSchema>;

interface MakeOfferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  listingTitle: string;
  askPricePerSqFt: number;
  totalSqFt: number;
  moq?: number | null;
}

export function MakeOfferModal({
  open,
  onOpenChange,
  listingId,
  listingTitle,
  askPricePerSqFt,
  totalSqFt,
  moq,
}: MakeOfferModalProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  } = useForm<MakeOfferFormValues>({
    resolver: zodResolver(makeOfferFormSchema),
    defaultValues: {
      offerPricePerSqFt: askPricePerSqFt * 0.9, // Default to 10% below asking
      quantitySqFt: totalSqFt,
      message: "",
    },
  });

  const createOffer = trpc.offer.createOffer.useMutation();

  const watchedPrice = watch("offerPricePerSqFt");
  const watchedQuantity = watch("quantitySqFt");

  // Calculate totals
  const subtotal =
    watchedPrice && watchedQuantity ? watchedPrice * watchedQuantity : 0;
  const buyerFee = calculateBuyerFee(subtotal);
  const total = subtotal + buyerFee;

  const onSubmit = async (data: MakeOfferFormValues) => {
    setIsSubmitting(true);
    try {
      const offer = await createOffer.mutateAsync({
        listingId,
        offerPricePerSqFt: data.offerPricePerSqFt,
        quantitySqFt: data.quantitySqFt,
        message: data.message,
      });

      toast.success("Offer submitted successfully");
      reset();
      onOpenChange(false);

      // Redirect to offer detail page
      router.push(`/offers/${offer.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit offer";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Make an Offer</DialogTitle>
          <DialogDescription>
            Submit your offer for {listingTitle}. The seller will be notified and
            can accept, counter, or decline.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Reference price */}
          <div className="bg-muted p-3 rounded-md text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Asking Price</span>
              <span className="font-medium tabular-nums">
                {formatCurrency(askPricePerSqFt)}/sq ft
              </span>
            </div>
            {moq && (
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Minimum Order</span>
                <span className="font-medium tabular-nums">
                  {formatSqFt(moq)}
                </span>
              </div>
            )}
          </div>

          {/* Price per sq ft input */}
          <div className="space-y-2">
            <Label htmlFor="offerPricePerSqFt">
              Your Offer (per sq ft) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="offerPricePerSqFt"
              type="number"
              step="0.01"
              placeholder="0.00"
              disabled={isSubmitting}
              aria-invalid={!!errors.offerPricePerSqFt}
              aria-describedby={
                errors.offerPricePerSqFt ? "offerPricePerSqFt-error" : undefined
              }
              {...register("offerPricePerSqFt", { valueAsNumber: true })}
            />
            {errors.offerPricePerSqFt && (
              <p
                id="offerPricePerSqFt-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.offerPricePerSqFt.message}
              </p>
            )}
          </div>

          {/* Quantity input */}
          <div className="space-y-2">
            <Label htmlFor="quantitySqFt">
              Quantity (sq ft) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="quantitySqFt"
              type="number"
              step="1"
              placeholder="0"
              disabled={isSubmitting}
              aria-invalid={!!errors.quantitySqFt}
              aria-describedby={
                errors.quantitySqFt ? "quantitySqFt-error" : undefined
              }
              {...register("quantitySqFt", { valueAsNumber: true })}
            />
            {errors.quantitySqFt && (
              <p
                id="quantitySqFt-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.quantitySqFt.message}
              </p>
            )}
            {moq && watchedQuantity < moq && (
              <p className="text-sm text-amber-600" role="alert">
                Note: This is below the seller&apos;s minimum order quantity of{" "}
                {formatSqFt(moq)}
              </p>
            )}
          </div>

          {/* Message input */}
          <div className="space-y-2">
            <Label htmlFor="message">Message (optional)</Label>
            <Textarea
              id="message"
              placeholder="Add a message to the seller..."
              rows={3}
              disabled={isSubmitting}
              aria-invalid={!!errors.message}
              aria-describedby={errors.message ? "message-error" : undefined}
              {...register("message")}
            />
            {errors.message && (
              <p
                id="message-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.message.message}
              </p>
            )}
          </div>

          {/* Calculated totals */}
          <div className="bg-muted p-3 rounded-md space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">
                {formatCurrency(subtotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Buyer Fee (3%)</span>
              <span className="font-medium tabular-nums">
                {formatCurrency(buyerFee)}
              </span>
            </div>
            <div className="flex justify-between font-semibold text-base pt-2 border-t border-border">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Submitting...
                </>
              ) : (
                "Submit Offer"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
