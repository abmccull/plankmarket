"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PromotionTier } from "@/types";

interface PromotionBadgeProps {
  tier?: PromotionTier | null;
  className?: string;
}

const TIER_STYLES: Record<string, { label: string; className: string }> = {
  spotlight: {
    label: "Promoted",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  featured: {
    label: "Featured",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  premium: {
    label: "Premium",
    className:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
};

export function PromotionBadge({ tier, className }: PromotionBadgeProps) {
  if (!tier) return null;

  const style = TIER_STYLES[tier];
  if (!style) return null;

  return (
    <Badge
      variant="secondary"
      className={cn("text-[10px] font-medium", style.className, className)}
    >
      {style.label}
    </Badge>
  );
}
