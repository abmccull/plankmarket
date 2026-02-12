"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StarRatingProps {
  value: number;
  onChange?: (rating: number) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export function StarRating({
  value,
  onChange,
  readonly = false,
  size = "md",
  className,
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const displayRating = hoverRating ?? value;
  const isInteractive = !readonly && onChange;

  const handleClick = (rating: number) => {
    if (isInteractive) {
      onChange(rating);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent, currentRating: number) => {
    if (!isInteractive) return;

    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onChange(Math.min(5, currentRating + 1));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onChange(Math.max(1, currentRating - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onChange(currentRating);
    }
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1",
        isInteractive && "cursor-pointer",
        className
      )}
      role={isInteractive ? "slider" : "img"}
      aria-label={`Rating: ${value} out of 5 stars`}
      aria-valuemin={isInteractive ? 1 : undefined}
      aria-valuemax={isInteractive ? 5 : undefined}
      aria-valuenow={isInteractive ? value : undefined}
      onMouseLeave={() => isInteractive && setHoverRating(null)}
    >
      {[1, 2, 3, 4, 5].map((rating) => {
        const isFilled = rating <= displayRating;
        return (
          <button
            key={rating}
            type="button"
            className={cn(
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm",
              !isInteractive && "cursor-default pointer-events-none"
            )}
            onClick={() => handleClick(rating)}
            onMouseEnter={() => isInteractive && setHoverRating(rating)}
            onKeyDown={(e) => handleKeyDown(e, rating)}
            disabled={!isInteractive}
            tabIndex={isInteractive ? 0 : -1}
            aria-label={`${rating} star${rating !== 1 ? "s" : ""}`}
          >
            <Star
              className={cn(
                sizeClasses[size],
                isFilled
                  ? "fill-yellow-400 text-yellow-400"
                  : "fill-none text-gray-300 dark:text-gray-600",
                isInteractive && "hover:scale-110 transition-transform"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
