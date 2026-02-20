"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/shared/star-rating";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface LeaveReviewFormProps {
  orderId: string;
  direction: "buyer_to_seller" | "seller_to_buyer";
  onSuccess?: () => void;
}

export function LeaveReviewForm({
  orderId,
  direction,
  onSuccess,
}: LeaveReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [communicationRating, setCommunicationRating] = useState(0);
  const [accuracyRating, setAccuracyRating] = useState(0);
  const [shippingRating, setShippingRating] = useState(0);

  const utils = trpc.useUtils();
  const createReview = trpc.review.create.useMutation({
    onSuccess: () => {
      toast.success("Review submitted");
      utils.review.getByOrder.invalidate({ orderId });
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    createReview.mutate({
      orderId,
      direction,
      rating,
      title: title || undefined,
      comment: comment || undefined,
      ...(direction === "buyer_to_seller"
        ? {
            communicationRating: communicationRating || undefined,
            accuracyRating: accuracyRating || undefined,
            shippingRating: shippingRating || undefined,
          }
        : {}),
    });
  };

  const isBuyerToSeller = direction === "buyer_to_seller";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label className="text-sm font-medium">
          Overall Rating <span className="text-destructive">*</span>
        </Label>
        <div className="mt-1">
          <StarRating value={rating} onChange={setRating} size="lg" />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="review-title">Title</Label>
        <Input
          id="review-title"
          placeholder="Summarize your experience"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="review-comment">Comment</Label>
        <Textarea
          id="review-comment"
          placeholder={
            isBuyerToSeller
              ? "How was the product quality, shipping, and communication?"
              : "How was your experience with this buyer?"
          }
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={2000}
          rows={3}
        />
      </div>

      {isBuyerToSeller && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm font-medium text-muted-foreground">
            Detailed Ratings (optional)
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm">Communication</span>
            <StarRating
              value={communicationRating}
              onChange={setCommunicationRating}
              size="sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Accuracy</span>
            <StarRating
              value={accuracyRating}
              onChange={setAccuracyRating}
              size="sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Shipping</span>
            <StarRating
              value={shippingRating}
              onChange={setShippingRating}
              size="sm"
            />
          </div>
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={rating === 0 || createReview.isPending}
      >
        {createReview.isPending && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        Submit Review
      </Button>
    </form>
  );
}
