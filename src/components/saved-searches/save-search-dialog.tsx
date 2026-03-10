"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import type { SearchFilters } from "@/types";
import { getFilterBadges } from "@/lib/utils/search-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SaveSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: SearchFilters;
  defaultName: string;
  onSaved?: () => void;
}

export function SaveSearchDialog({
  open,
  onOpenChange,
  filters,
  defaultName,
  onSaved,
}: SaveSearchDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const saveSearch = trpc.search.saveSearch.useMutation();
  const badges = getFilterBadges(filters);

  const handleSave = async () => {
    try {
      await saveSearch.mutateAsync({
        name: name.trim(),
        filters,
        alertEnabled: true,
      });
      toast.success("Saved search created");
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save search";
      toast.error(message);
      if (message.toLowerCase().includes("upgrade to pro")) {
        router.push("/pro");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent key={defaultName}>
        <DialogHeader>
          <DialogTitle>Save Search</DialogTitle>
          <DialogDescription>
            Save your current filters and get alerts when matching listings go live.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="saved-search-name">Name</Label>
            <Input
              id="saved-search-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={255}
            />
          </div>

          <div className="space-y-2">
            <Label>Filters</Label>
            <div className="flex flex-wrap gap-1.5">
              {badges.length > 0 ? (
                badges.map((badge, index) => (
                  <Badge key={`${badge.key}-${index}`} variant="outline" className="text-xs">
                    {badge.label}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">
                  No filters applied. This search will watch all listings.
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveSearch.isPending || !name.trim()}
          >
            {saveSearch.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save Search
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
