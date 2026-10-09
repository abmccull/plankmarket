"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  getFilterBadges,
  filtersToSearchParams,
} from "@/lib/utils/search-filters";
import type { SavedSearch } from "@/server/db/schema/saved-searches";

type AlertFrequency = "instant" | "daily" | "weekly";
type AlertChannel = "in_app" | "email";

interface EditSavedSearchDialogProps {
  search: SavedSearch;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const FREQUENCY_OPTIONS: { value: AlertFrequency; label: string }[] = [
  { value: "instant", label: "As listings go live" },
  { value: "daily", label: "Daily digest" },
  { value: "weekly", label: "Weekly digest" },
];

const CHANNEL_OPTIONS: { value: AlertChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "in_app", label: "In-App" },
];

export function EditSavedSearchDialog({
  search,
  open,
  onOpenChange,
  onSaved,
}: EditSavedSearchDialogProps) {
  const [name, setName] = useState(search.name);
  const [alertEnabled, setAlertEnabled] = useState(search.alertEnabled);
  const [alertFrequency, setAlertFrequency] = useState<AlertFrequency>(
    (search.alertFrequency as AlertFrequency) || "instant",
  );
  const [alertChannels, setAlertChannels] = useState<AlertChannel[]>(
    (search.alertChannels as AlertChannel[]) || ["email"],
  );

  const updateSearch = trpc.search.updateSavedSearch.useMutation();
  const badges = getFilterBadges(search.filters);
  const browseUrl = `/listings?${filtersToSearchParams(search.filters)}`;

  const toggleChannel = (channel: AlertChannel) => {
    setAlertChannels((prev) => {
      if (prev.includes(channel)) {
        const next = prev.filter((c) => c !== channel);
        return next.length > 0 ? next : prev; // must keep at least one
      }
      return [...prev, channel];
    });
  };

  const handleSave = async () => {
    try {
      await updateSearch.mutateAsync({
        id: search.id,
        name,
        alertEnabled,
        alertFrequency,
        alertChannels,
      });
      toast.success("Saved search updated");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Failed to update saved search");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!updateSearch.isPending) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Saved Search</DialogTitle>
          <DialogDescription>
            Update your search name and alert preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="search-name">Name</Label>
            <Input
              id="search-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              disabled={updateSearch.isPending}
            />
          </div>

          {/* Filter summary */}
          <div className="space-y-2">
            <Label>Filters</Label>
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
                  No filters — matches all listings
                </span>
              )}
            </div>
            <a
              href={browseUrl}
              className="text-xs text-primary hover:underline"
            >
              View or modify filters on the browse page
            </a>
          </div>

          {/* Alert toggle */}
          <div className="space-y-2">
            <Label htmlFor="saved-search-alert-toggle">Alerts</Label>
            <button
              type="button"
              id="saved-search-alert-toggle"
              aria-label="Alerts for this saved search"
              disabled={updateSearch.isPending}
              role="switch"
              aria-checked={alertEnabled}
              onClick={() => setAlertEnabled(!alertEnabled)}
              className="flex min-h-11 items-center rounded-md border px-3 text-sm font-medium disabled:opacity-50"
            >
              {alertEnabled ? "Alerts enabled" : "Alerts paused"}
            </button>
          </div>

          {/* Frequency */}
          <div
            className={`space-y-2 ${!alertEnabled ? "opacity-50 pointer-events-none" : ""}`}
          >
            <Label>Frequency</Label>
            <div className="flex flex-wrap gap-2">
              {FREQUENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAlertFrequency(opt.value)}
                  aria-pressed={alertFrequency === opt.value}
                  disabled={!alertEnabled || updateSearch.isPending}
                  className={`min-h-11 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    alertFrequency === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Channels */}
          <div
            className={`space-y-2 ${!alertEnabled ? "opacity-50 pointer-events-none" : ""}`}
          >
            <Label>Channels</Label>
            <div className="flex flex-wrap gap-2">
              {CHANNEL_OPTIONS.map((opt) => {
                const active = alertChannels.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleChannel(opt.value)}
                    aria-pressed={active}
                    disabled={!alertEnabled || updateSearch.isPending}
                    className={`min-h-11 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-secondary text-secondary-foreground"
                        : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    {opt.value === "email" ? "✉ " : "🔔 "}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Pausing stops new alert scheduling. Alerts already being processed may
          still arrive.
        </p>
        {updateSearch.error && (
          <p role="alert" className="text-sm text-destructive">
            Your changes have not been confirmed. {updateSearch.error.message}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={updateSearch.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateSearch.isPending || !name.trim()}
          >
            {updateSearch.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
