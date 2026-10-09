"use client";

import { useRuleDraft } from "./use-rule-draft";
import { RuleSaveStatus } from "./rule-save-status";
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
  canEnable?: boolean;
}

function ruleFields(config: AgentConfig | null) {
  return {
    enabled: config?.repricingEnabled ?? false,
    staleAfterDays: config?.repricingStaleAfterDays?.toString() ?? "",
    dropPercent: config?.repricingDropPercent?.toString() ?? "",
    floorPercent: config?.repricingFloorPercent?.toString() ?? "",
  };
}

export function RepricingRulesTab({
  config,
  canEnable = true,
}: RepricingRulesTabProps) {
  const form = useRuleDraft(ruleFields(config));
  const { enabled, staleAfterDays, dropPercent, floorPercent } = form.draft;
  const savedEnabled = form.saved.enabled;
  const setEnabled = (value: boolean) => form.setField("enabled", value);
  const setStaleAfterDays = (value: string) =>
    form.setField("staleAfterDays", value);
  const setDropPercent = (value: string) => form.setField("dropPercent", value);
  const setFloorPercent = (value: string) =>
    form.setField("floorPercent", value);

  // Validate that drop percent + floor percent don't exceed 100%
  // E.g., if floor is 70%, max drop per cycle must be < 30%
  const dropNum = dropPercent ? parseFloat(dropPercent) : 0;
  const floorNum = floorPercent ? parseFloat(floorPercent) : 0;
  const maxAllowedDrop = floorNum > 0 ? 100 - floorNum : 100;
  const hasConflict = dropNum > 0 && floorNum > 0 && dropNum >= maxAllowedDrop;

  const utils = trpc.useUtils();
  const mutation = trpc.agent.updateRepricingRules.useMutation({
    onSuccess: (saved) => {
      form.confirm(ruleFields(saved));
      utils.agent.getConfig.setData(undefined, (current) => ({
        config: saved,
        proRequired: current?.proRequired ?? true,
      }));
      toast.success("Repricing rules saved successfully.");
      utils.agent.getConfig.invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      void utils.agent.getConfig.invalidate();
    },
  });

  const handleSave = () => {
    if (!enabled) {
      mutation.mutate({ repricingEnabled: false });
      return;
    }
    mutation.mutate({
      repricingEnabled: enabled,
      repricingStaleAfterDays: staleAfterDays
        ? parseInt(staleAfterDays, 10)
        : undefined,
      repricingDropPercent: dropPercent ? parseFloat(dropPercent) : undefined,
      repricingFloorPercent: floorPercent
        ? parseFloat(floorPercent)
        : undefined,
    });
  };

  return (
    <fieldset disabled={mutation.isPending} className="min-w-0">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Smart Repricing</CardTitle>
              <CardDescription>
                Automatically adjust prices on listings that have not received
                offers. This is separate from scheduled markdowns enabled on
                individual listings.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="repricing-toggle" className="text-sm">
                {enabled ? "Enabled" : "Disabled"}
                {enabled !== savedEnabled ? " · not saved" : ""}
              </Label>
              <Switch
                id="repricing-toggle"
                checked={enabled}
                disabled={mutation.isPending || (!enabled && !canEnable)}
                onCheckedChange={setEnabled}
                aria-label="Auto-reprice stale listings"
              />
            </div>
          </div>
        </CardHeader>
        {enabled && (
          <CardContent className="space-y-4">
            <fieldset disabled={!canEnable} className="space-y-4">
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
                  Drop percentage ({dropNum}%) must be less than{" "}
                  {maxAllowedDrop}% (100% minus the {floorNum}% price floor).
                  These settings would allow prices to drop below your floor.
                </p>
              )}
            </fieldset>
          </CardContent>
        )}
        <CardContent className="space-y-3">
          <RuleSaveStatus
            savedEnabled={savedEnabled}
            dirty={form.dirty}
            isPending={mutation.isPending}
            isError={mutation.isError}
          />
          <Button
            onClick={handleSave}
            disabled={
              mutation.isPending || (enabled && (!canEnable || hasConflict))
            }
          >
            {mutation.isPending && (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            )}
            Save Repricing Rules
          </Button>
        </CardContent>
      </Card>
    </fieldset>
  );
}
