"use client";

import { useCallback } from "react";
import posthog from "posthog-js";
import type { PlankMarketEvent } from "./events";
import { useResolvedAnalyticsConsent } from "./consent-context";
import { sanitizeAnalyticsProperties } from "./privacy";

export function useTrack() {
  const consent = useResolvedAnalyticsConsent();
  const track = useCallback(
    <T extends PlankMarketEvent>(event: T["event"], properties: T["properties"]) => {
      if (typeof window === "undefined") return;
      if (consent !== "granted") return;

      try {
        posthog.capture(
          event,
          sanitizeAnalyticsProperties(
            properties as unknown as Record<string, unknown>,
          ),
        );
      } catch (error) {
         
        console.error("Failed to track event:", error);
      }
    },
    [consent]
  );

  return track;
}
