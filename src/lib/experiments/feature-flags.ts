export const FEATURE_FLAGS = {
  HERO_VARIANT_TEST: "hero-variant-test",
  SHOW_URGENCY_SIGNALS: "show-urgency-signals",
  SHOW_FEEDBACK_WIDGET: "show-feedback-widget",
  NEW_ONBOARDING: "new-onboarding",
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

export const FEATURE_FLAG_DEFAULTS: Record<FeatureFlagKey, boolean> = {
  [FEATURE_FLAGS.HERO_VARIANT_TEST]: false,
  [FEATURE_FLAGS.SHOW_URGENCY_SIGNALS]: true,
  [FEATURE_FLAGS.SHOW_FEEDBACK_WIDGET]: true,
  [FEATURE_FLAGS.NEW_ONBOARDING]: false,
};
