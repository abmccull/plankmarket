"use client";

import { createContext, useContext } from "react";
import type { AnalyticsConsentState } from "./privacy";

/**
 * Resolved consent for the current viewer. Authenticated values come from the
 * account preference; anonymous values come from this browser. The undefined
 * default intentionally fails closed when a component is rendered outside the
 * application provider.
 */
export const AnalyticsConsentContext = createContext<
  AnalyticsConsentState | null | undefined
>(undefined);

export function useResolvedAnalyticsConsent() {
  return useContext(AnalyticsConsentContext);
}
