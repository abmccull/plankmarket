"use client";

import { BuyerTags } from "@/components/crm/buyer-tags";
import { BuyerNotes } from "@/components/crm/buyer-notes";
import { useProStatus } from "@/hooks/use-pro-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface BuyerCrmPanelProps {
  buyerId: string;
  /** Compact mode hides the card wrapper for inline use. */
  compact?: boolean;
}

/**
 * Combined CRM panel showing tags and notes for a buyer.
 * Shows a Pro upgrade teaser for free users.
 */
export function BuyerCrmPanel({ buyerId, compact = false }: BuyerCrmPanelProps) {
  const { isPro, isLoading } = useProStatus();

  if (isLoading) {
    return compact ? (
      <Skeleton className="h-20 w-full rounded-md" />
    ) : (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-20 w-full rounded-md" />
        </CardContent>
      </Card>
    );
  }

  if (!isPro) {
    if (compact) {
      return (
        <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-xs">
            Unlock CRM tools with{" "}
            <Link href="/pro" className="font-medium underline hover:text-foreground">
              Pro
            </Link>
          </span>
        </div>
      );
    }

    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
          <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            Unlock tags, notes, and CRM tools
          </p>
          <Button asChild variant="gold" size="sm">
            <Link href="/pro">Upgrade to Pro</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const content = (
    <div className="space-y-4">
      <BuyerTags buyerId={buyerId} />
      <BuyerNotes buyerId={buyerId} />
    </div>
  );

  if (compact) {
    return content;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4" aria-hidden="true" />
          Buyer CRM
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{content}</CardContent>
    </Card>
  );
}
