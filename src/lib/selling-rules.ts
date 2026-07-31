import type { SellingTerritoryMode } from "@/lib/selling-territory";

type MaybeDate = Date | string | null | undefined;

export const PRICING_RULES_VERSION = 1;
export const AUTOMATIC_MARKDOWN_STEP_COUNT = 4;
export const FREIGHT_PAYMENT_MODES = ["buyer_pays", "seller_pays"] as const;

export type FreightPaymentMode = (typeof FREIGHT_PAYMENT_MODES)[number];

export interface ListingSellingRulePreferences {
  fullLotOnly: boolean;
  partialQuantityMarkupPercent: number | null;
  automaticMarkdownEnabled: boolean;
  automaticMarkdownFloorPercent: number | null;
  automaticMarkdownIntervalDays: number | null;
  pricingRulesVersion: number;
  allowSampleRequests: boolean;
  territoryMode: SellingTerritoryMode;
  allowedDestinationStates: string[];
  freightPaymentMode: FreightPaymentMode;
  sellerFreightStates: string[];
  freightDropCharge: number | null;
}

export interface ListingSellingRules
  extends ListingSellingRulePreferences {
  automaticMarkdownStartedAt: Date | null;
  automaticMarkdownCurrentStep: number;
  automaticMarkdownLastAppliedAt: Date | null;
}

export interface SellerListingPreferenceDefaults {
  canSplitLots: boolean;
  partialQuantityMarkupPercent: number | null;
  automaticMarkdownEnabled: boolean;
  automaticMarkdownFloorPercent: number | null;
  automaticMarkdownIntervalDays: number | null;
  defaultAllowOffers: boolean;
  allowSampleRequests: boolean;
  sellingTerritoryMode: SellingTerritoryMode;
  allowedDestinationStates: string[];
  freightPaymentMode: FreightPaymentMode;
  sellerFreightStates: string[];
  freightDropCharge: number | null;
  taxRegisteredStates: string[];
}

type SellerListingPreferenceDefaultsSource = {
  canSplitLots?: boolean | null;
  partialQuantityMarkupPercent?: number | null;
  automaticMarkdownEnabled?: boolean | null;
  automaticMarkdownFloorPercent?: number | null;
  automaticMarkdownIntervalDays?: number | null;
  defaultAllowOffers?: boolean | null;
  allowSampleRequests?: boolean | null;
  sellingTerritoryMode?: string | null;
  freightPaymentMode?: string | null;
  freightDropCharge?: number | null;
  allowedDestinationStates?: readonly string[] | null;
  sellerFreightStates?: readonly string[] | null;
  taxRegisteredStates?: readonly string[] | null;
};

export const DEFAULT_LISTING_SELLING_RULE_PREFERENCES: ListingSellingRulePreferences =
  {
    fullLotOnly: false,
    partialQuantityMarkupPercent: null,
    automaticMarkdownEnabled: false,
    automaticMarkdownFloorPercent: null,
    automaticMarkdownIntervalDays: null,
    pricingRulesVersion: PRICING_RULES_VERSION,
    allowSampleRequests: false,
    territoryMode: "unrestricted",
    allowedDestinationStates: [],
    freightPaymentMode: "buyer_pays",
    sellerFreightStates: [],
    freightDropCharge: null,
  };

export const DEFAULT_LISTING_SELLING_RULES: ListingSellingRules = {
  ...DEFAULT_LISTING_SELLING_RULE_PREFERENCES,
  automaticMarkdownStartedAt: null,
  automaticMarkdownCurrentStep: 0,
  automaticMarkdownLastAppliedAt: null,
};

export const DEFAULT_SELLER_LISTING_PREFERENCE_DEFAULTS: SellerListingPreferenceDefaults =
  {
    canSplitLots: true,
    partialQuantityMarkupPercent: null,
    automaticMarkdownEnabled: false,
    automaticMarkdownFloorPercent: null,
    automaticMarkdownIntervalDays: null,
    defaultAllowOffers: true,
    allowSampleRequests: false,
    sellingTerritoryMode: "unrestricted",
    allowedDestinationStates: [],
    freightPaymentMode: "buyer_pays" as FreightPaymentMode,
    sellerFreightStates: [],
    freightDropCharge: null,
    taxRegisteredStates: [],
  };

function toDate(value: MaybeDate): Date | null {
  if (!value) {
    return null;
  }

  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function clampMarkdownStep(value: number | null | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(AUTOMATIC_MARKDOWN_STEP_COUNT, Math.trunc(value ?? 0)),
  );
}

function cloneList(values?: readonly string[] | null): string[] {
  return values != null ? [...values] : [];
}

export function getSellerListingPreferenceDefaults(
  settings?: SellerListingPreferenceDefaultsSource | null,
): SellerListingPreferenceDefaults {
  return {
    canSplitLots:
      settings?.canSplitLots ??
      DEFAULT_SELLER_LISTING_PREFERENCE_DEFAULTS.canSplitLots,
    partialQuantityMarkupPercent:
      settings?.partialQuantityMarkupPercent ??
      DEFAULT_SELLER_LISTING_PREFERENCE_DEFAULTS.partialQuantityMarkupPercent,
    automaticMarkdownEnabled:
      settings?.automaticMarkdownEnabled ??
      DEFAULT_SELLER_LISTING_PREFERENCE_DEFAULTS.automaticMarkdownEnabled,
    automaticMarkdownFloorPercent:
      settings?.automaticMarkdownFloorPercent ??
      DEFAULT_SELLER_LISTING_PREFERENCE_DEFAULTS.automaticMarkdownFloorPercent,
    automaticMarkdownIntervalDays:
      settings?.automaticMarkdownIntervalDays ??
      DEFAULT_SELLER_LISTING_PREFERENCE_DEFAULTS.automaticMarkdownIntervalDays,
    defaultAllowOffers:
      settings?.defaultAllowOffers ??
      DEFAULT_SELLER_LISTING_PREFERENCE_DEFAULTS.defaultAllowOffers,
    allowSampleRequests:
      settings?.allowSampleRequests ??
      DEFAULT_SELLER_LISTING_PREFERENCE_DEFAULTS.allowSampleRequests,
    sellingTerritoryMode:
      settings?.sellingTerritoryMode === "allowed_states"
        ? "allowed_states"
        : DEFAULT_SELLER_LISTING_PREFERENCE_DEFAULTS.sellingTerritoryMode,
    allowedDestinationStates:
      settings?.allowedDestinationStates != null
        ? cloneList(settings.allowedDestinationStates)
        : cloneList(
            DEFAULT_SELLER_LISTING_PREFERENCE_DEFAULTS.allowedDestinationStates,
          ),
    sellerFreightStates:
      settings?.sellerFreightStates != null
        ? cloneList(settings.sellerFreightStates)
        : cloneList(
            DEFAULT_SELLER_LISTING_PREFERENCE_DEFAULTS.sellerFreightStates,
          ),
    freightPaymentMode:
      settings?.freightPaymentMode === "seller_pays"
        ? "seller_pays"
        : "buyer_pays",
    freightDropCharge:
      settings?.freightDropCharge ??
      DEFAULT_SELLER_LISTING_PREFERENCE_DEFAULTS.freightDropCharge,
    taxRegisteredStates:
      settings?.taxRegisteredStates != null
        ? cloneList(settings.taxRegisteredStates)
        : cloneList(
            DEFAULT_SELLER_LISTING_PREFERENCE_DEFAULTS.taxRegisteredStates,
          ),
  };
}

export function applyUserPreferenceDefaultsToListing<
  T extends Partial<ListingSellingRulePreferences>,
>(
  input: T,
  settings?: SellerListingPreferenceDefaultsSource | null,
): T & ListingSellingRulePreferences {
  const defaults = getSellerListingPreferenceDefaults(settings);

  return {
    ...input,
    fullLotOnly: input.fullLotOnly ?? !defaults.canSplitLots,
    partialQuantityMarkupPercent:
      input.partialQuantityMarkupPercent ??
      defaults.partialQuantityMarkupPercent,
    automaticMarkdownEnabled:
      input.automaticMarkdownEnabled ?? defaults.automaticMarkdownEnabled,
    automaticMarkdownFloorPercent:
      input.automaticMarkdownFloorPercent ??
      defaults.automaticMarkdownFloorPercent,
    automaticMarkdownIntervalDays:
      input.automaticMarkdownIntervalDays ??
      defaults.automaticMarkdownIntervalDays,
    allowSampleRequests:
      input.allowSampleRequests ?? defaults.allowSampleRequests,
    territoryMode: input.territoryMode ?? defaults.sellingTerritoryMode,
    allowedDestinationStates:
      input.allowedDestinationStates ?? defaults.allowedDestinationStates,
    freightPaymentMode:
      input.freightPaymentMode ?? defaults.freightPaymentMode,
    sellerFreightStates:
      input.sellerFreightStates ?? defaults.sellerFreightStates,
    freightDropCharge:
      input.freightDropCharge ?? defaults.freightDropCharge,
    pricingRulesVersion: PRICING_RULES_VERSION,
  };
}

export function resolveAutomaticMarkdownPersistence(input: {
  existing?: {
    askPricePerSqFt?: number | null;
    automaticMarkdownEnabled?: boolean | null;
    automaticMarkdownFloorPercent?: number | null;
    automaticMarkdownIntervalDays?: number | null;
    automaticMarkdownStartedAt?: MaybeDate;
    automaticMarkdownCurrentStep?: number | null;
    automaticMarkdownLastAppliedAt?: MaybeDate;
  } | null;
  next: {
    askPricePerSqFt: number;
    automaticMarkdownEnabled: boolean;
    automaticMarkdownFloorPercent: number | null;
    automaticMarkdownIntervalDays: number | null;
  };
  now?: MaybeDate;
}): Pick<
  ListingSellingRules,
  | "automaticMarkdownStartedAt"
  | "automaticMarkdownCurrentStep"
  | "automaticMarkdownLastAppliedAt"
> {
  const now = toDate(input.now) ?? new Date();

  if (!input.next.automaticMarkdownEnabled) {
    return {
      automaticMarkdownStartedAt: null,
      automaticMarkdownCurrentStep: 0,
      automaticMarkdownLastAppliedAt: null,
    };
  }

  const existing = input.existing;
  const shouldReset =
    !existing?.automaticMarkdownEnabled ||
    existing.askPricePerSqFt !== input.next.askPricePerSqFt ||
    existing.automaticMarkdownFloorPercent !==
      input.next.automaticMarkdownFloorPercent ||
    existing.automaticMarkdownIntervalDays !==
      input.next.automaticMarkdownIntervalDays;

  if (shouldReset) {
    return {
      automaticMarkdownStartedAt: now,
      automaticMarkdownCurrentStep: 0,
      automaticMarkdownLastAppliedAt: null,
    };
  }

  return {
    automaticMarkdownStartedAt:
      toDate(existing.automaticMarkdownStartedAt) ?? now,
    automaticMarkdownCurrentStep: clampMarkdownStep(
      existing.automaticMarkdownCurrentStep,
    ),
    automaticMarkdownLastAppliedAt: toDate(
      existing.automaticMarkdownLastAppliedAt,
    ),
  };
}
