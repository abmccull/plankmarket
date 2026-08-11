"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import posthog, { type PostHog } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { initPostHog } from "./posthog-client";
import { AnalyticsConsentContext } from "./consent-context";
import {
  readAnalyticsConsent,
  resolveAnalyticsConsentFlag,
  subscribeAnalyticsConsent,
  type AnalyticsConsentState,
  writeAnalyticsConsent,
} from "./privacy";

const getServerAnalyticsConsent = (): null => null;

function AnalyticsConsentBanner({
  consent,
  onDecision,
  isSaving,
  saveFailed,
}: {
  consent: AnalyticsConsentState | null;
  onDecision: (nextValue: AnalyticsConsentState) => void;
  isSaving: boolean;
  saveFailed: boolean;
}) {
  if (consent !== null) {
    return null;
  }

  return (
    <aside
      aria-labelledby="analytics-consent-title"
      className="border-b border-border bg-muted/55 px-4 py-3"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-3xl space-y-1">
          <p id="analytics-consent-title" className="text-sm font-semibold">
            Help improve PlankMarket
          </p>
          <p className="text-sm text-muted-foreground">
            Optional analytics use masked inputs and pseudonymous IDs. Change
            this later in account preferences.
          </p>
          {saveFailed ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              We could not save that choice. Please try again.
            </p>
          ) : null}
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
          <Button
            type="button"
            variant="outline"
            onClick={() => onDecision("denied")}
            disabled={isSaving}
            className="min-h-11"
          >
            Use essential only
          </Button>
          <Button
            type="button"
            onClick={() => onDecision("granted")}
            disabled={isSaving}
            className="min-h-11"
          >
            {isSaving ? "Saving choice…" : "Allow analytics"}
          </Button>
        </div>
      </div>
    </aside>
  );
}

export function PostHogAnalyticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAuthStore((state) => state.user);
  const activePosthogClient = useRef<PostHog | null>(null);
  const browserConsent = useSyncExternalStore(
    subscribeAnalyticsConsent,
    readAnalyticsConsent,
    getServerAnalyticsConsent,
  );
  const preferencesQuery = trpc.preferences.get.useQuery(undefined, {
    enabled: !!user,
  });
  const setAnalyticsConsent =
    trpc.preferences.setAnalyticsConsent.useMutation();

  const consent = user
    ? preferencesQuery.isFetched
      ? resolveAnalyticsConsentFlag(
          preferencesQuery.data?.analyticsTrackingEnabled,
        )
      : null
    : browserConsent;

  useEffect(() => {
    if (consent !== "granted") {
      const client = activePosthogClient.current;
      if (client) {
        client.reset();
        client.opt_out_capturing();
        activePosthogClient.current = null;
      }
      return;
    }

    if (activePosthogClient.current) {
      return;
    }

    const client = initPostHog();
    client.opt_in_capturing();
    activePosthogClient.current = client;
  }, [consent]);

  const persistConsent = async (nextValue: AnalyticsConsentState) => {
    if (!user) {
      writeAnalyticsConsent(nextValue);
      return;
    }

    await setAnalyticsConsent.mutateAsync({
      enabled: nextValue === "granted",
    });
    await preferencesQuery.refetch();
  };

  const content = (
    <AnalyticsConsentContext.Provider value={consent}>
      <AnalyticsConsentBanner
        consent={consent}
        onDecision={(nextValue) => {
          void persistConsent(nextValue).catch(() => {
            // The mutation exposes its error state in the banner. Keep the
            // prior consent value so analytics never starts after a failed save.
          });
        }}
        isSaving={setAnalyticsConsent.isPending}
        saveFailed={setAnalyticsConsent.isError === true}
      />
      {children}
      {consent === "granted" ? <VercelAnalytics /> : null}
    </AnalyticsConsentContext.Provider>
  );

  if (consent !== "granted") {
    return content;
  }

  return <PostHogProvider client={posthog}>{content}</PostHogProvider>;
}
