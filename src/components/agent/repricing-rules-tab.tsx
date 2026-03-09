"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getErrorMessage } from "@/lib/utils";
import type { AgentConfig } from "@/server/db/schema";

interface RepricingRulesTabProps {
  config: AgentConfig | null;
}

export function RepricingRulesTab({ config }: RepricingRulesTabProps) {
  const [enabled, setEnabled] = useState(config?.repricingEnabled ?? false);
  const [staleAfterDays, setStaleAfterDays] = useState(
    config?.repricingStaleAfterDays?.toString() ?? ""
  );
  const [dropPercent, setDropPercent] = useState(
    config?.repricingDropPercent?.toString() ?? ""
  );
  const [floorPercent, setFloorPercent] = useState(
    config?.repricingFloorPercent?.toString() ?? ""
  );

  // Validate that drop percent + floor percent don't exceed 100%
  // E.g., if floor is 70%, max drop per cycle must be < 30%
  const dropNum = dropPercent ? parseFloat(dropPercent) : 0;
  const floorNum = floorPercent ? parseFloat(floorPercent) : 0;
  const maxAllowedDrop = floorNum > 0 ? 100 - floorNum : 100;
  const hasConflict = dropNum > 0 && floorNum > 0 && dropNum >= maxAllowedDrop;

  const utils = trpc.useUtils();
  const mutation = trpc.agent.updateRepricingRules.useMutation({
    onSuccess: () => {
      toast.success("Repricing rules saved successfully.");
      utils.agent.getConfig.invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const handleSave = () => {
    mutation.mutate({
      repricingEnabled: enabled,
      repricingStaleAfterDays: staleAfterDays
        ? parseInt(staleAfterDays, 10)
        : undefined,
      repricingDropPercent: dropPercent ? parseFloat(dropPercent) : undefined,
      repricingFloorPercent: floorPercent ? parseFloat(floorPercent) : undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Smart Repricing</CardTitle>
            <CardDescription>
              Automatically adjust prices on listings that have not received offers.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="repricing-toggle" className="text-sm">
              {enabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              id="repricing-toggle"
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="Auto-reprice stale listings"
            />
          </div>
        </div>
      </CardHeader>
      {enabled && (
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="stale-days">Days before repricing</Label>
              <Input
                id="stale-days"
                type="number"
                min={1}
                max={90}
                placeholder="14"
                value={staleAfterDays}
                onChange={(e) => setStaleAfterDays(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="drop-percent">Drop price by (%)</Label>
              <Input
                id="drop-percent"
                type="number"
                min={1}
                max={50}
                placeholder="5"
                value={dropPercent}
                onChange={(e) => setDropPercent(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="floor-percent">Price floor (%)</Label>
              <Input
                id="floor-percent"
                type="number"
                min={10}
                max={100}
                placeholder="70"
                value={floorPercent}
                onChange={(e) => setFloorPercent(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Never drop below this % of original price.
              </p>
            </div>
          </div>

          {hasConflict && (
            <p className="text-sm text-destructive" role="alert">
              Drop percentage ({dropNum}%) must be less than {maxAllowedDrop}% (100% minus the {floorNum}% price floor). These settings would allow prices to drop below your floor.
            </p>
          )}

          <Button onClick={handleSave} disabled={mutation.isPending || hasConflict}>
            {mutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Save Repricing Rules
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
