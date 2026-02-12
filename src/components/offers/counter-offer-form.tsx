"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatSqFt } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const counterOfferFormSchema = z.object({
  pricePerSqFt: z
    .number()
    .positive("Price must be positive")
    .max(1000, "Price seems too high"),
  message: z
    .string()
    .max(500, "Message must be at most 500 characters")
    .optional(),
});

type CounterOfferFormValues = z.infer<typeof counterOfferFormSchema>;

interface CounterOfferFormProps {
  currentPricePerSqFt: number;
  quantitySqFt: number;
  onSubmit: (data: { pricePerSqFt: number; message?: string }) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function CounterOfferForm({
  currentPricePerSqFt,
  quantitySqFt,
  onSubmit,
  onCancel,
  isLoading = false,
}: CounterOfferFormProps) {
  const [counterPrice, setCounterPrice] = useState<string>(
    currentPricePerSqFt.toFixed(2)
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<CounterOfferFormValues>({
    resolver: zodResolver(counterOfferFormSchema),
    defaultValues: {
      pricePerSqFt: currentPricePerSqFt,
      message: "",
    },
  });

  const handlePriceChange = (value: string) => {
    setCounterPrice(value);
    setValue("pricePerSqFt", parseFloat(value) || 0);
  };

  const calculatedTotal = parseFloat(counterPrice) * quantitySqFt || 0;

  const onSubmitForm = async (data: CounterOfferFormValues) => {
    await onSubmit({
      pricePerSqFt: data.pricePerSqFt,
      message: data.message || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-4">
      {/* Price comparison */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Current offer</span>
          <span className="font-medium tabular-nums">
            {formatCurrency(currentPricePerSqFt)}/sq ft
          </span>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>Your counter</span>
          <span className="tabular-nums">
            {counterPrice && !isNaN(parseFloat(counterPrice))
              ? `${formatCurrency(parseFloat(counterPrice))}/sq ft`
              : "—"}
          </span>
        </div>
      </div>

      {/* Price input */}
      <div className="space-y-2">
        <Label htmlFor="pricePerSqFt">
          Counter Price per sq ft <span className="text-destructive">*</span>
        </Label>
        <Input
          id="pricePerSqFt"
          type="number"
          step="0.01"
          min="0.01"
          max="1000"
          placeholder="0.00"
          {...register("pricePerSqFt", { valueAsNumber: true })}
          value={counterPrice}
          onChange={(e) => handlePriceChange(e.target.value)}
          aria-invalid={!!errors.pricePerSqFt}
          aria-describedby={errors.pricePerSqFt ? "pricePerSqFt-error" : undefined}
          disabled={isLoading}
        />
        {errors.pricePerSqFt && (
          <p
            id="pricePerSqFt-error"
            className="text-sm text-destructive"
            role="alert"
          >
            {errors.pricePerSqFt.message}
          </p>
        )}
      </div>

      {/* Calculated total */}
      <div className="rounded-lg border p-3 bg-primary/5">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-xs text-muted-foreground">
              {formatSqFt(quantitySqFt)}
            </p>
          </div>
          <p className="text-xl font-bold tabular-nums">
            {!isNaN(calculatedTotal) ? formatCurrency(calculatedTotal) : "—"}
          </p>
        </div>
      </div>

      {/* Message */}
      <div className="space-y-2">
        <Label htmlFor="message">Message (optional)</Label>
        <Textarea
          id="message"
          placeholder="Add a message to explain your counter offer..."
          rows={3}
          maxLength={500}
          {...register("message")}
          aria-describedby={errors.message ? "message-error" : undefined}
          disabled={isLoading}
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

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Counter Offer
        </Button>
      </div>
    </form>
  );
}
