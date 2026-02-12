"use client";

import { useFeatureFlagEnabled, useFeatureFlagVariantKey } from "posthog-js/react";
import type { FeatureFlagKey } from "./feature-flags";
import { FEATURE_FLAG_DEFAULTS } from "./feature-flags";

interface FeatureFlagResult {
  enabled: boolean;
  variant: string | boolean | undefined;
  isLoading: boolean;
}

export function useFeatureFlag(flagKey: FeatureFlagKey): FeatureFlagResult {
  const enabled = useFeatureFlagEnabled(flagKey);
  const variant = useFeatureFlagVariantKey(flagKey);

  // Use default value while loading or if PostHog is not initialized
  const isEnabled = enabled ?? FEATURE_FLAG_DEFAULTS[flagKey];
  const isLoading = enabled === undefined;

  return {
    enabled: isEnabled,
    variant,
    isLoading,
  };
}
