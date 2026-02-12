"use client";

import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Search, Trash2, Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function SavedSearchesPage() {
  const { data: searches, isLoading, refetch } =
    trpc.search.getMySavedSearches.useQuery();
  const updateSearch = trpc.search.updateSavedSearch.useMutation();
  const deleteSearch = trpc.search.deleteSavedSearch.useMutation();

  const handleToggleAlert = async (id: string, currentValue: boolean) => {
    try {
      await updateSearch.mutateAsync({ id, alertEnabled: !currentValue });
      toast.success(
        currentValue ? "Alerts disabled" : "Alerts enabled"
      );
      refetch();
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSearch.mutateAsync({ id });
      toast.success("Search deleted");
      refetch();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Saved Searches</h1>
        <p className="text-muted-foreground mt-1">
          Get alerts when new listings match your criteria
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : searches?.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No saved searches</h3>
          <p className="text-muted-foreground mt-1">
            Save a search from the Browse Listings page to get alerts.
          </p>
          <Link href="/listings" className="mt-4 inline-block">
            <Button>Browse Listings</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {searches?.map((search) => (
            <Card key={search.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <h3 className="font-medium">{search.name}</h3>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {search.filters.materialType?.map((m: string) => (
                      <Badge key={m} variant="outline" className="text-xs">
                        {m}
                      </Badge>
                    ))}
                    {search.filters.query && (
                      <Badge variant="outline" className="text-xs">
                        &quot;{search.filters.query}&quot;
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      handleToggleAlert(search.id, search.alertEnabled)
                    }
                    title={
                      search.alertEnabled
                        ? "Disable alerts"
                        : "Enable alerts"
                    }
                  >
                    {search.alertEnabled ? (
                      <Bell className="h-4 w-4 text-primary" />
                    ) : (
                      <BellOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(search.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
