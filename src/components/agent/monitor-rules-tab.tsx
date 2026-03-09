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

interface MonitorRulesTabProps {
  config: AgentConfig | null;
}

export function MonitorRulesTab({ config }: MonitorRulesTabProps) {
  const [enabled, setEnabled] = useState(config?.monitorEnabled ?? false);
  const [autoOffer, setAutoOffer] = useState(config?.monitorAutoOffer ?? false);
  const [maxPrice, setMaxPrice] = useState(
    config?.monitorMaxPrice?.toString() ?? ""
  );
  const [budgetMonthly, setBudgetMonthly] = useState(
    config?.monitorBudgetMonthly?.toString() ?? ""
  );

  const utils = trpc.useUtils();
  const mutation = trpc.agent.updateMonitorRules.useMutation({
    onSuccess: () => {
      toast.success("Monitor rules saved successfully.");
      utils.agent.getConfig.invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const handleSave = () => {
    mutation.mutate({
      monitorEnabled: enabled,
      monitorAutoOffer: autoOffer,
      monitorMaxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      monitorBudgetMonthly: budgetMonthly ? parseFloat(budgetMonthly) : undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Listing Monitor</CardTitle>
            <CardDescription>
              Monitor saved searches and get notified when new matches appear.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="monitor-toggle" className="text-sm">
              {enabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              id="monitor-toggle"
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="Monitor saved searches for new matches"
            />
          </div>
        </div>
      </CardHeader>
      {enabled && (
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 rounded-md border p-3">
            <Switch
              id="auto-offer-toggle"
              checked={autoOffer}
              onCheckedChange={setAutoOffer}
              aria-label="Automatically make offers on matches"
            />
            <Label htmlFor="auto-offer-toggle" className="text-sm cursor-pointer">
              Automatically make offers on matches
            </Label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="max-price">Max price per sqft ($)</Label>
              <Input
                id="max-price"
                type="number"
                min={0}
                step={0.01}
                placeholder="3.50"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget-monthly">Monthly budget limit ($)</Label>
              <Input
                id="budget-monthly"
                type="number"
                min={0}
                step={1}
                placeholder="5000"
                value={budgetMonthly}
                onChange={(e) => setBudgetMonthly(e.target.value)}
              />
            </div>
          </div>

          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Save Monitor Rules
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
