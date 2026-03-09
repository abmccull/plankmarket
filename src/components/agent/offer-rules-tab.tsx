"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

interface OfferRulesTabProps {
  config: AgentConfig | null;
}

const EXAMPLE_TEXT =
  "Example: If ask is $4.00/sqft with thresholds 90/80/70 — Accept above $3.60, Counter $2.80-$3.60, Reject below $2.80";

export function OfferRulesTab({ config }: OfferRulesTabProps) {
  const [enabled, setEnabled] = useState(config?.offerAutoEnabled ?? false);
  const [acceptAbove, setAcceptAbove] = useState(
    config?.offerAcceptAbove?.toString() ?? ""
  );
  const [counterAt, setCounterAt] = useState(
    config?.offerCounterAt?.toString() ?? ""
  );
  const [rejectBelow, setRejectBelow] = useState(
    config?.offerRejectBelow?.toString() ?? ""
  );
  const [counterMessage, setCounterMessage] = useState(
    config?.offerCounterMessage ?? ""
  );
  const [rejectMessage, setRejectMessage] = useState(
    config?.offerRejectMessage ?? ""
  );
  const [validationError, setValidationError] = useState("");

  const utils = trpc.useUtils();
  const mutation = trpc.agent.updateOfferRules.useMutation({
    onSuccess: () => {
      toast.success("Offer rules saved successfully.");
      utils.agent.getConfig.invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const handleSave = () => {
    setValidationError("");
    const accept = acceptAbove ? parseFloat(acceptAbove) : undefined;
    const counter = counterAt ? parseFloat(counterAt) : undefined;
    const reject = rejectBelow ? parseFloat(rejectBelow) : undefined;

    if (enabled && accept !== undefined && counter !== undefined && accept <= counter) {
      setValidationError("Accept threshold must be greater than counter threshold.");
      return;
    }
    if (enabled && counter !== undefined && reject !== undefined && counter <= reject) {
      setValidationError("Counter threshold must be greater than reject threshold.");
      return;
    }

    mutation.mutate({
      offerAutoEnabled: enabled,
      offerAcceptAbove: accept,
      offerCounterAt: counter,
      offerRejectBelow: reject,
      offerCounterMessage: counterMessage || undefined,
      offerRejectMessage: rejectMessage || undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Offer Rules</CardTitle>
            <CardDescription>
              Automatically handle incoming offers on your listings.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="offer-toggle" className="text-sm">
              {enabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              id="offer-toggle"
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="Auto-handle incoming offers"
            />
          </div>
        </div>
      </CardHeader>
      {enabled && (
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">{EXAMPLE_TEXT}</p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="accept-above">Accept at or above (%)</Label>
              <Input
                id="accept-above"
                type="number"
                min={50}
                max={100}
                placeholder="90"
                value={acceptAbove}
                onChange={(e) => setAcceptAbove(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="counter-at">Counter between (%)</Label>
              <Input
                id="counter-at"
                type="number"
                min={30}
                max={100}
                placeholder="80"
                value={counterAt}
                onChange={(e) => setCounterAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reject-below">Reject below (%)</Label>
              <Input
                id="reject-below"
                type="number"
                min={0}
                max={100}
                placeholder="70"
                value={rejectBelow}
                onChange={(e) => setRejectBelow(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="counter-message">Counter-offer message</Label>
            <Textarea
              id="counter-message"
              placeholder="Thanks for your offer! We can meet you partway..."
              maxLength={500}
              value={counterMessage}
              onChange={(e) => setCounterMessage(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reject-message">Rejection message</Label>
            <Textarea
              id="reject-message"
              placeholder="Thanks for your interest, but this offer is too low..."
              maxLength={500}
              value={rejectMessage}
              onChange={(e) => setRejectMessage(e.target.value)}
              rows={2}
            />
          </div>

          {validationError && (
            <p className="text-sm text-destructive" role="alert">
              {validationError}
            </p>
          )}

          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Save Offer Rules
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
