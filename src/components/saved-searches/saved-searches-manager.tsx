"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  Search,
  Trash2,
  Pencil,
  Mail,
  Bell,
  BellOff,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import {
  getFilterBadges,
  filtersToSearchParams,
} from "@/lib/utils/search-filters";
import { EditSavedSearchDialog } from "@/components/saved-searches/edit-saved-search-dialog";
import type { SavedSearch } from "@/server/db/schema/saved-searches";
import { useProStatus } from "@/hooks/use-pro-status";
import { FREE_LIMITS } from "@/lib/pro";
import { QueryErrorState } from "@/components/ui/state-panel";

const FREQUENCY_LABELS: Record<string, string> = {
  instant: "As listings go live",
  daily: "Daily",
  weekly: "Weekly",
};

export function SavedSearchesManager() {
  const router = useRouter();
  const { isPro } = useProStatus();
  const utils = trpc.useUtils();
  const {
    data: searches,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = trpc.search.getMySavedSearches.useQuery();
  const deleteSearch = trpc.search.deleteSavedSearch.useMutation();

  const [editingSearch, setEditingSearch] = useState<SavedSearch | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const searchCount = searches?.length ?? 0;
  const atSearchLimit = !isPro && searchCount >= FREE_LIMITS.savedSearches;

  const handleDelete = async (id: string) => {
    try {
      await deleteSearch.mutateAsync({ id });
      toast.success("Search deleted");
      setConfirmDeleteId(null);
      void utils.search.getMySavedSearches.invalidate();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleCardClick = (search: SavedSearch) => {
    const params = filtersToSearchParams(search.filters);
    router.push(`/listings${params ? `?${params}` : ""}`);
  };

  if (isError && !searches) {
    return (
      <QueryErrorState
        title="We couldn't load your saved searches"
        description="Your saved searches are unchanged. Retry to check their alert settings."
        onRetry={() => {
          void refetch();
        }}
        isRetrying={isFetching}
      />
    );
  }

  return (
    <div className="space-y-6">
      {isError && (
        <QueryErrorState
          title="Saved-search status is unavailable"
          description="The last loaded settings are shown below. Retry to confirm the latest status."
          onRetry={() => {
            void refetch();
          }}
          isRetrying={isFetching}
        />
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Saved Searches</h1>
          <p className="text-muted-foreground mt-1">
            Choose when and where each saved search sends matching-listing
            alerts.
          </p>
        </div>
        {!isPro && (
          <div className="shrink-0 text-right">
            <p className="text-sm font-medium text-muted-foreground">
              {searchCount}/{FREE_LIMITS.savedSearches} saved searches
            </p>
            {atSearchLimit && (
              <Link
                href="/pro"
                className="text-xs text-primary hover:underline underline-offset-2"
              >
                Upgrade to Pro for unlimited
              </Link>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div
          role="status"
          aria-label="Loading saved searches"
          className="flex items-center justify-center py-12"
        >
          <Loader2
            aria-hidden="true"
            className="h-6 w-6 animate-spin text-muted-foreground"
          />
        </div>
      ) : searches?.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No saved searches</h3>
          <p className="text-muted-foreground mt-1">
            Save a search from the Browse Listings page to get alerts.
          </p>
          <Button asChild className="mt-4">
            <Link href="/listings">Browse Listings</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {searches?.map((search) => {
            const badges = getFilterBadges(search.filters);
            const channels = search.alertChannels?.length
              ? search.alertChannels
              : ["email"];
            const frequency = (search.alertFrequency as string) || "instant";

            return (
              <Card
                key={search.id}
                id={`search-${search.id}`}
                className="group scroll-mt-24 transition-colors hover:border-primary/50"
              >
                <CardContent className="p-4">
                  {/* Header row: name + actions */}
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => handleCardClick(search)}
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-base">
                          {search.name}
                        </h3>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSearch(search);
                        }}
                        aria-label={`Edit ${search.name}`}
                        title="Edit saved search"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {confirmDeleteId === search.id ? (
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="destructive"
                            size="sm"
                            className="min-h-11 text-xs"
                            disabled={deleteSearch.isPending}
                            onClick={() => handleDelete(search.id)}
                          >
                            Delete
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 text-xs"
                            disabled={deleteSearch.isPending}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(search.id);
                          }}
                          aria-label={`Delete ${search.name}`}
                          title="Delete saved search"
                          disabled={deleteSearch.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Filter badges */}
                  <button
                    type="button"
                    className="w-full text-left mt-2"
                    onClick={() => handleCardClick(search)}
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {badges.length > 0 ? (
                        badges.map((b, i) => (
                          <Badge
                            key={`${b.key}-${i}`}
                            variant="outline"
                            className="text-xs"
                          >
                            {b.label}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          All listings
                        </span>
                      )}
                    </div>

                    {/* Alert status */}
                    {search.alertEnabled ? (
                      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {channels.includes("email") && (
                            <>
                              <Mail className="h-3.5 w-3.5" />
                              Email
                            </>
                          )}
                        </span>
                        {channels.includes("in_app") && (
                          <span className="flex items-center gap-1">
                            <Bell className="h-3.5 w-3.5" />
                            In-App
                          </span>
                        )}
                        <span className="text-muted-foreground/60">|</span>
                        <span>{FREQUENCY_LABELS[frequency] || frequency}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
                        <BellOff className="h-3.5 w-3.5" />
                        Alerts off
                      </div>
                    )}
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      {editingSearch && (
        <EditSavedSearchDialog
          search={editingSearch}
          open={!!editingSearch}
          onOpenChange={(open) => {
            if (!open) setEditingSearch(null);
          }}
          onSaved={() => {
            void utils.search.getMySavedSearches.invalidate();
            setEditingSearch(null);
          }}
        />
      )}
    </div>
  );
}
