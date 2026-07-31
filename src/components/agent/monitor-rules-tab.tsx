"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
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
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            Matching uses the filters and alert settings from your saved
            searches. The monitor sends notifications only; it never places an
            offer or spends money for you.
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
