"use client";

import { useCallback } from "react";
import posthog from "posthog-js";
import type { PlankMarketEvent } from "./events";

export function useTrack() {
  const track = useCallback(
    <T extends PlankMarketEvent>(event: T["event"], properties: T["properties"]) => {
      if (typeof window === "undefined") return;

      try {
        posthog.capture(event, properties);
      } catch (error) {
         
        console.error("Failed to track event:", error);
      }
    },
    []
  );

  return track;
}
