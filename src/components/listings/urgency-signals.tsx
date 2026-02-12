"use client";

import { Badge } from "@/components/ui/badge";
import { Eye, Clock, AlertCircle, Package } from "lucide-react";
import { useFeatureFlag } from "@/lib/experiments/use-feature-flag";
import { FEATURE_FLAGS } from "@/lib/experiments/feature-flags";

interface UrgencySignalsProps {
  listing: {
    watchlistCount: number;
    createdAt: Date | string;
    expiresAt?: Date | string | null;
    totalSqFt: number;
    originalSqFt?: number;
  };
  className?: string;
}

function getDaysAgo(date: Date | string): number {
  const createdDate = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - createdDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getDaysUntil(date: Date | string): number {
  const targetDate = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffTime = targetDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function UrgencySignals({ listing, className }: UrgencySignalsProps) {
  const { enabled } = useFeatureFlag(FEATURE_FLAGS.SHOW_URGENCY_SIGNALS);

  if (!enabled) {
    return null;
  }

  const signals: React.ReactNode[] = [];

  // Watchlist count signal (if > 5 buyers)
  if (listing.watchlistCount >= 5) {
    signals.push(
      <Badge
        key="watchlist"
        variant="secondary"
        className="bg-amber-100 text-amber-800 hover:bg-amber-100"
      >
        <Eye className="h-3 w-3 mr-1" />
        {listing.watchlistCount} buyers watching
      </Badge>
    );
  }

  // New listing signal (if < 3 days old)
  const daysAgo = getDaysAgo(listing.createdAt);
  if (daysAgo < 3) {
    signals.push(
      <Badge
        key="new"
        variant="secondary"
        className="bg-green-100 text-green-800 hover:bg-green-100"
      >
        <Clock className="h-3 w-3 mr-1" />
        {daysAgo === 0 ? "New listing" : `Listed ${daysAgo} day${daysAgo > 1 ? "s" : ""} ago`}
      </Badge>
    );
  }

  // Expiring soon signal (if expires within 14 days)
  if (listing.expiresAt) {
    const daysUntilExpiry = getDaysUntil(listing.expiresAt);
    if (daysUntilExpiry > 0 && daysUntilExpiry <= 14) {
      signals.push(
        <Badge
          key="expiring"
          variant="secondary"
          className="bg-amber-100 text-amber-800 hover:bg-amber-100"
        >
          <AlertCircle className="h-3 w-3 mr-1" />
          Expiring in {daysUntilExpiry} day{daysUntilExpiry > 1 ? "s" : ""}
        </Badge>
      );
    }
  }

  // Low quantity signal (if < 30% of original remaining)
  if (listing.originalSqFt && listing.originalSqFt > 0) {
    const percentageRemaining =
      (listing.totalSqFt / listing.originalSqFt) * 100;
    if (percentageRemaining < 30 && percentageRemaining > 0) {
      signals.push(
        <Badge
          key="low-quantity"
          variant="secondary"
          className="bg-orange-100 text-orange-800 hover:bg-orange-100"
        >
          <Package className="h-3 w-3 mr-1" />
          Only {listing.totalSqFt.toLocaleString()} sq ft remaining
        </Badge>
      );
    }
  }

  if (signals.length === 0) {
    return null;
  }

  return <div className={`flex flex-wrap gap-2 ${className || ""}`}>{signals}</div>;
}
