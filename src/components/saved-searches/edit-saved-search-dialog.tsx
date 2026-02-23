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
import { getFilterBadges, filtersToSearchParams } from "@/lib/utils/search-filters";
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
  { value: "instant", label: "Instant" },
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
    (search.alertFrequency as AlertFrequency) || "instant"
  );
  const [alertChannels, setAlertChannels] = useState<AlertChannel[]>(
    (search.alertChannels as AlertChannel[]) || ["email"]
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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            />
          </div>

          {/* Filter summary */}
          <div className="space-y-2">
            <Label>Filters</Label>
            <div className="flex flex-wrap gap-1.5">
              {badges.length > 0 ? (
                badges.map((b, i) => (
                  <Badge key={`${b.key}-${i}`} variant="outline" className="text-xs">
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
            <Label>Alerts</Label>
            <button
              type="button"
              role="switch"
              aria-checked={alertEnabled}
              onClick={() => setAlertEnabled(!alertEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                alertEnabled ? "bg-primary" : "bg-input"
              }`}
            >
              <span
                className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                  alertEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Frequency */}
          <div className={`space-y-2 ${!alertEnabled ? "opacity-50 pointer-events-none" : ""}`}>
            <Label>Frequency</Label>
            <div className="flex gap-2">
              {FREQUENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAlertFrequency(opt.value)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
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
          <div className={`space-y-2 ${!alertEnabled ? "opacity-50 pointer-events-none" : ""}`}>
            <Label>Channels</Label>
            <div className="flex gap-2">
              {CHANNEL_OPTIONS.map((opt) => {
                const active = alertChannels.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleChannel(opt.value)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
