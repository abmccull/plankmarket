"use client";

import type { ComponentType } from "react";
import { StatsCard } from "@/components/dashboard/stats-card";
import { Button } from "@/components/ui/button";

export function DashboardReadMetric({ title, value, icon, isLoading, isError, isRetrying, onRetry }: {
  title: string;
  value: number | undefined;
  icon: ComponentType<{ className?: string }>;
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  const failed = !isLoading && (isError || value === undefined);
  return (
    <section aria-label={`${title} summary`} aria-busy={isLoading || isRetrying} className="min-w-0 space-y-2">
      <StatsCard title={title} value={isLoading ? "—" : failed ? "Unavailable" : value!} icon={icon}
        description={isLoading ? "Loading…" : failed ? "This count could not be refreshed." : undefined} />
      {failed ? (
        <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={isRetrying}
          aria-label={`Retry ${title.toLowerCase()}`} onClick={onRetry}>
          {isRetrying ? "Trying again…" : `Retry ${title.toLowerCase()}`}
        </Button>
      ) : null}
    </section>
  );
}
