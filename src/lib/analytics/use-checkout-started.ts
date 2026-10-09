"use client";

import { useCallback, useRef } from "react";
import type { CheckoutStartedProperties } from "./events";
import { useResolvedAnalyticsConsent } from "./consent-context";
import { useTrack } from "./use-track";

/** Count a validated checkout transition once per mounted attempt, with consent. */
export function useCheckoutStartedAnalytics() {
  const consent = useResolvedAnalyticsConsent();
  const track = useTrack();
  const recorded = useRef(new Set<string>());
  return useCallback((attempt: string, properties: CheckoutStartedProperties) => {
    if (consent !== "granted" || recorded.current.has(attempt) ||
        !Number.isFinite(properties.quantity_sqft) || properties.quantity_sqft <= 0 ||
        !Number.isFinite(properties.lot_value) || properties.lot_value <= 0) return;
    recorded.current.add(attempt);
    track("checkout_started", properties);
  }, [consent, track]);
}
