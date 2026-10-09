import type { UserPreference } from "@/server/db/schema/user-preferences";

export type PreferenceWorkspace = "buyer" | "seller";

const CORE_FIELDS = {
  buyer: [
    "preferredZip",
    "preferredRadiusMiles",
    "preferredMaterialTypes",
    "priceMaxPerSqFt",
    "preferredShippingMode",
    "urgency",
  ],
  seller: [
    "originZip",
    "shipCapable",
    "typicalMaterialTypes",
    "minLotSqFt",
    "preferredBuyerRadiusMiles",
    "pricingStyle",
    "leadTimeDaysMin",
  ],
} as const satisfies Record<PreferenceWorkspace, readonly (keyof UserPreference)[]>;

type CompletionField = (typeof CORE_FIELDS)[PreferenceWorkspace][number];
type CompletionValues = Partial<Pick<UserPreference, CompletionField>>;

/** Derive each workspace's setup from saved answers, never the legacy row flag. */
export function getPreferenceCompletion(
  preferences: CompletionValues | null | undefined,
  workspace: PreferenceWorkspace,
) {
  const fields: readonly CompletionField[] = CORE_FIELDS[workspace];
  const missingFields = fields.filter((field) => {
    const value = preferences?.[field];
    return value == null ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === "string" && value.trim().length === 0);
  });
  const filledCount = fields.length - missingFields.length;
  return {
    filledCount,
    totalFields: fields.length,
    completionPercent: Math.round((filledCount / fields.length) * 100),
    missingFields,
    profileComplete: filledCount >= Math.ceil(fields.length * 0.7),
  };
}
