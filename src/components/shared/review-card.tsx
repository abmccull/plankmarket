"use client";

import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating } from "./star-rating";
import { cn } from "@/lib/utils";

export interface ReviewCardProps {
  reviewerName: string;
  reviewerAvatar?: string;
  date: Date;
  rating: number;
  title?: string;
  comment: string;
  subRatings?: {
    communication?: number;
    accuracy?: number;
    shipping?: number;
  };
  sellerResponse?: {
    message: string;
    date: Date;
  };
  className?: string;
}

export function ReviewCard({
  reviewerName,
  reviewerAvatar,
  date,
  rating,
  title,
  comment,
  subRatings,
  sellerResponse,
  className,
}: ReviewCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="pt-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {reviewerAvatar ? (
              <Image
                src={reviewerAvatar}
                alt={reviewerName}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-medium text-primary">
                  {reviewerName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <p className="font-medium text-sm">{reviewerName}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(date, { addSuffix: true })}
              </p>
            </div>
          </div>
          <StarRating value={rating} readonly size="sm" />
        </div>

        {/* Title */}
        {title && <h4 className="font-semibold mb-2">{title}</h4>}

        {/* Comment */}
        <p className="text-sm text-muted-foreground mb-4">{comment}</p>

        {/* Sub-ratings */}
        {subRatings && (
          <div className="space-y-2 mb-4 pb-4 border-b">
            {subRatings.communication !== undefined && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Communication</span>
                <StarRating
                  value={subRatings.communication}
                  readonly
                  size="sm"
                />
              </div>
            )}
            {subRatings.accuracy !== undefined && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Accuracy</span>
                <StarRating value={subRatings.accuracy} readonly size="sm" />
              </div>
            )}
            {subRatings.shipping !== undefined && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Shipping</span>
                <StarRating value={subRatings.shipping} readonly size="sm" />
              </div>
            )}
          </div>
        )}

        {/* Seller Response */}
        {sellerResponse && (
          <div className="bg-muted/50 rounded-lg p-3 border-l-2 border-primary">
            <p className="text-xs font-medium mb-1">Seller Response</p>
            <p className="text-sm text-muted-foreground mb-1">
              {sellerResponse.message}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(sellerResponse.date, { addSuffix: true })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
