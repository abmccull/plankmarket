"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  QueryErrorState,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { FREE_LIMITS } from "@/lib/pro";

const FREQUENCIES = {
  instant: "As listings go live",
  daily: "Daily digest",
  weekly: "Weekly digest",
} as const;

export function SavedSearchAlertsTab() {
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.search.getMySavedSearches.useQuery();
  const retry = () => {
    void refetch();
  };
  if (isLoading)
    return <StatePanelLoading label="Loading saved-search alerts" rows={3} />;
  if (isError && !data) {
    return (
      <QueryErrorState
        title="We couldn't load your saved-search alerts"
        description="Retry to check each search's current settings."
        onRetry={retry}
        isRetrying={isFetching}
      />
    );
  }

  const searches = data ?? [];
  const enabledCount = searches.filter((search) => search.alertEnabled).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Saved-search alerts</CardTitle>
        <CardDescription>
          Choose the timing and delivery channels for each saved search. Alerts
          work on Free and Pro; there is no separate monitor to enable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isError && (
          <QueryErrorState
            title="Latest alert status is unavailable"
            description="The last loaded settings are shown below. Retry to confirm them."
            onRetry={retry}
            isRetrying={isFetching}
          />
        )}
        {searches.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              {enabledCount} of {searches.length} saved searches have alerts
              enabled.
            </p>
            <ul
              className="divide-y rounded-md border"
              aria-label="Saved-search alert settings"
            >
              {searches.slice(0, 5).map((search) => {
                const channels = search.alertChannels?.length
                  ? search.alertChannels
                  : ["email"];
                return (
                  <li key={search.id}>
                    <Link
                      href={`/settings/saved-searches#search-${search.id}`}
                      className="flex min-h-11 items-start justify-between gap-3 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <span className="min-w-0 space-y-1">
                        <span className="block break-words text-sm font-medium">
                          {search.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {FREQUENCIES[search.alertFrequency]} ·{" "}
                          {channels
                            .map((channel) =>
                              channel === "email" ? "Email" : "In-app",
                            )
                            .join(" and ")}
                        </span>
                      </span>
                      <Badge
                        variant={search.alertEnabled ? "secondary" : "outline"}
                      >
                        {search.alertEnabled ? "Enabled" : "Paused"}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {searches.length > 5 && (
              <p className="text-sm text-muted-foreground">
                View all {searches.length} searches in saved-search settings.
              </p>
            )}
          </>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="font-medium">No saved searches yet</p>
            <p className="text-muted-foreground">
              Save your filters while browsing to get alerts for matching
              listings.
            </p>
            <Button asChild variant="outline">
              <Link href="/listings">Browse listings</Link>
            </Button>
          </div>
        )}
        <Button asChild>
          <Link href="/settings/saved-searches">Manage saved searches</Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          Free includes {FREE_LIMITS.savedSearches} saved searches with email
          and in-app alerts. Pro adds unlimited saved searches.
        </p>
      </CardContent>
    </Card>
  );
}
