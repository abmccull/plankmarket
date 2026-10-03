"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

export function RuleSaveStatus({
  savedEnabled,
  dirty,
  isPending,
  isError,
}: {
  savedEnabled: boolean;
  dirty: boolean;
  isPending: boolean;
  isError: boolean;
}) {
  const utils = trpc.useUtils();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<boolean | null>(null);
  const checkStatus = async () => {
    setChecking(true);
    try {
      await utils.agent.getConfig.fetch(undefined, { staleTime: 0 });
      setChecked(true);
    } catch {
      setChecked(false);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      role={isError ? "alert" : "status"}
      className="space-y-2 text-sm leading-6"
    >
      {isError && (
        <p className="font-medium text-destructive">
          We couldn&apos;t confirm your save. Check the saved status before
          trying again.
        </p>
      )}
      <p className="text-muted-foreground">
        {isPending
          ? "Saving changes…"
          : `Last confirmed: ${savedEnabled ? "enabled" : "disabled"}.`}
        {dirty
          ? " Unsaved changes. Save to apply them."
          : " Changes take effect when you save."}
      </p>
      {isError && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void checkStatus()}
          disabled={checking}
        >
          {checking ? "Checking…" : "Check saved status"}
        </Button>
      )}
      {isError && checked !== null && (
        <p>
          {checked
            ? "Saved status refreshed. Your draft is preserved."
            : "Could not refresh the saved status. Try again."}
        </p>
      )}
    </div>
  );
}
