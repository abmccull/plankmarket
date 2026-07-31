import {
  PRICING_RULES_VERSION,
  resolveAutomaticMarkdownPersistence,
} from "@/lib/selling-rules";
import { listingSellingRulesSchema } from "@/lib/validators/listing";
import type { SellerCommercialDefaults } from "@/lib/validators/preferences";

type MaybeDate = Date | string | null | undefined;

export type ActiveListingCommercialState = {
  id: string;
  askPricePerSqFt: number;
  allowOffers: boolean;
  fullLotOnly: boolean;
  partialQuantityMarkupPercent: number | null;
  automaticMarkdownEnabled: boolean;
  automaticMarkdownFloorPercent: number | null;
  automaticMarkdownIntervalDays: number | null;
  automaticMarkdownStartedAt: MaybeDate;
  automaticMarkdownCurrentStep: number;
  automaticMarkdownLastAppliedAt: MaybeDate;
  pricingRulesVersion: number;
  allowSampleRequests: boolean;
  territoryMode: "unrestricted" | "allowed_states";
  allowedDestinationStates: string[] | null;
  freightPaymentMode: "buyer_pays" | "seller_pays";
  sellerFreightStates: string[] | null;
  freightDropCharge: number | null;
};

export type ListingCommercialRuleSnapshot = {
  allowOffers: boolean;
  fullLotOnly: boolean;
  partialQuantityMarkupPercent: number | null;
  automaticMarkdownEnabled: boolean;
  automaticMarkdownFloorPercent: number | null;
  automaticMarkdownIntervalDays: number | null;
  automaticMarkdownStartedAt: Date | null;
  automaticMarkdownCurrentStep: number;
  automaticMarkdownLastAppliedAt: Date | null;
  pricingRulesVersion: number;
  allowSampleRequests: boolean;
  territoryMode: "unrestricted" | "allowed_states";
  allowedDestinationStates: string[];
  freightPaymentMode: "buyer_pays" | "seller_pays";
  sellerFreightStates: string[];
  freightDropCharge: number | null;
};

export type SellerDefaultsListingResolution =
  | {
      changed: false;
      listingId: string;
      before: ListingCommercialRuleSnapshot;
      after: ListingCommercialRuleSnapshot;
      update: null;
    }
  | {
      changed: true;
      listingId: string;
      before: ListingCommercialRuleSnapshot;
      after: ListingCommercialRuleSnapshot;
      update: ListingCommercialRuleSnapshot;
    };

function toDate(value: MaybeDate): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizedList(values: readonly string[] | null | undefined): string[] {
  return [...new Set(values ?? [])].sort();
}

function snapshotsMatch(
  left: ListingCommercialRuleSnapshot,
  right: ListingCommercialRuleSnapshot,
): boolean {
  return (
    left.allowOffers === right.allowOffers &&
    left.fullLotOnly === right.fullLotOnly &&
    left.partialQuantityMarkupPercent ===
      right.partialQuantityMarkupPercent &&
    left.automaticMarkdownEnabled === right.automaticMarkdownEnabled &&
    left.automaticMarkdownFloorPercent ===
      right.automaticMarkdownFloorPercent &&
    left.automaticMarkdownIntervalDays ===
      right.automaticMarkdownIntervalDays &&
    left.automaticMarkdownStartedAt?.getTime() ===
      right.automaticMarkdownStartedAt?.getTime() &&
    left.automaticMarkdownCurrentStep ===
      right.automaticMarkdownCurrentStep &&
    left.automaticMarkdownLastAppliedAt?.getTime() ===
      right.automaticMarkdownLastAppliedAt?.getTime() &&
    left.allowSampleRequests === right.allowSampleRequests &&
    left.territoryMode === right.territoryMode &&
    JSON.stringify(normalizedList(left.allowedDestinationStates)) ===
      JSON.stringify(normalizedList(right.allowedDestinationStates)) &&
    left.freightPaymentMode === right.freightPaymentMode &&
    JSON.stringify(normalizedList(left.sellerFreightStates)) ===
      JSON.stringify(normalizedList(right.sellerFreightStates)) &&
    left.freightDropCharge === right.freightDropCharge
  );
}

function snapshotFromListing(
  listing: ActiveListingCommercialState,
): ListingCommercialRuleSnapshot {
  return {
    allowOffers: listing.allowOffers,
    fullLotOnly: listing.fullLotOnly,
    partialQuantityMarkupPercent: listing.partialQuantityMarkupPercent,
    automaticMarkdownEnabled: listing.automaticMarkdownEnabled,
    automaticMarkdownFloorPercent:
      listing.automaticMarkdownFloorPercent,
    automaticMarkdownIntervalDays: listing.automaticMarkdownIntervalDays,
    automaticMarkdownStartedAt: toDate(listing.automaticMarkdownStartedAt),
    automaticMarkdownCurrentStep: listing.automaticMarkdownCurrentStep,
    automaticMarkdownLastAppliedAt: toDate(
      listing.automaticMarkdownLastAppliedAt,
    ),
    pricingRulesVersion: listing.pricingRulesVersion,
    allowSampleRequests: listing.allowSampleRequests,
    territoryMode: listing.territoryMode,
    allowedDestinationStates: normalizedList(
      listing.allowedDestinationStates,
    ),
    freightPaymentMode: listing.freightPaymentMode,
    sellerFreightStates: normalizedList(listing.sellerFreightStates),
    freightDropCharge: listing.freightDropCharge,
  };
}

/**
 * Resolves a complete, validated listing update for an explicit seller-default
 * fan-out. The returned update is deliberately restricted to commercial rule
 * fields: price, quantity, inventory, status, and trust fields are never
 * included.
 */
export function resolveSellerDefaultsListingUpdate(input: {
  listing: ActiveListingCommercialState;
  defaults: SellerCommercialDefaults;
  now?: Date;
}): SellerDefaultsListingResolution {
  const { listing, defaults } = input;
  const now = input.now ?? new Date();
  const before = snapshotFromListing(listing);
  const markdown = resolveAutomaticMarkdownPersistence({
    existing: listing,
    next: {
      askPricePerSqFt: listing.askPricePerSqFt,
      automaticMarkdownEnabled: defaults.automaticMarkdownEnabled,
      automaticMarkdownFloorPercent:
        defaults.automaticMarkdownFloorPercent,
      automaticMarkdownIntervalDays:
        defaults.automaticMarkdownIntervalDays,
    },
    now,
  });

  const validated = listingSellingRulesSchema.parse({
    fullLotOnly: !defaults.canSplitLots,
    partialQuantityMarkupPercent: defaults.canSplitLots
      ? defaults.partialQuantityMarkupPercent
      : null,
    automaticMarkdownEnabled: defaults.automaticMarkdownEnabled,
    automaticMarkdownFloorPercent:
      defaults.automaticMarkdownFloorPercent,
    automaticMarkdownIntervalDays:
      defaults.automaticMarkdownIntervalDays,
    ...markdown,
    pricingRulesVersion: PRICING_RULES_VERSION,
    allowSampleRequests: defaults.allowSampleRequests,
    territoryMode: defaults.sellingTerritoryMode,
    allowedDestinationStates:
      defaults.sellingTerritoryMode === "allowed_states"
        ? defaults.allowedDestinationStates
        : [],
    freightPaymentMode: defaults.freightPaymentMode,
    sellerFreightStates:
      defaults.freightPaymentMode === "seller_pays"
        ? defaults.sellerFreightStates
        : [],
    freightDropCharge:
      defaults.freightPaymentMode === "seller_pays"
        ? defaults.freightDropCharge
        : null,
  });

  const candidate: ListingCommercialRuleSnapshot = {
    allowOffers: defaults.defaultAllowOffers,
    fullLotOnly: validated.fullLotOnly,
    partialQuantityMarkupPercent:
      validated.partialQuantityMarkupPercent,
    automaticMarkdownEnabled: validated.automaticMarkdownEnabled,
    automaticMarkdownFloorPercent:
      validated.automaticMarkdownFloorPercent,
    automaticMarkdownIntervalDays:
      validated.automaticMarkdownIntervalDays,
    automaticMarkdownStartedAt:
      validated.automaticMarkdownStartedAt ?? null,
    automaticMarkdownCurrentStep:
      validated.automaticMarkdownCurrentStep,
    automaticMarkdownLastAppliedAt:
      validated.automaticMarkdownLastAppliedAt ?? null,
    pricingRulesVersion: validated.pricingRulesVersion,
    allowSampleRequests: validated.allowSampleRequests,
    territoryMode: validated.territoryMode,
    allowedDestinationStates: normalizedList(
      validated.allowedDestinationStates,
    ),
    freightPaymentMode: validated.freightPaymentMode,
    sellerFreightStates: normalizedList(validated.sellerFreightStates),
    freightDropCharge: validated.freightDropCharge,
  };

  if (snapshotsMatch(before, candidate)) {
    return {
      changed: false,
      listingId: listing.id,
      before,
      after: before,
      update: null,
    };
  }

  const after: ListingCommercialRuleSnapshot = {
    ...candidate,
    pricingRulesVersion: Math.max(
      PRICING_RULES_VERSION,
      listing.pricingRulesVersion + 1,
    ),
  };

  return {
    changed: true,
    listingId: listing.id,
    before,
    after,
    update: after,
  };
}
