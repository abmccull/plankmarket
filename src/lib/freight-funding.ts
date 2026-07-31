import {
  resolveSellingTerritoryEligibility,
  type UsStateCode,
} from "@/lib/selling-territory";

export const FREIGHT_FUNDING_MODES = [
  "buyer_pays",
  "seller_pays",
  "seller_pays_selected_states",
] as const;

export type FreightFundingMode = (typeof FREIGHT_FUNDING_MODES)[number];

export type FreightFundingDecisionReason =
  | "buyer_pays"
  | "seller_pays"
  | "seller_pays_with_drop_charge"
  | "seller_pays_selected_states_applied"
  | "seller_pays_selected_states_applied_with_drop_charge"
  | "selected_states_destination_blocked"
  | "selected_states_destination_missing"
  | "selected_states_destination_invalid"
  | "selected_states_config_empty"
  | "selected_states_config_invalid";

export interface ResolveFreightFundingInput {
  mode: FreightFundingMode;
  fullFreightCharge: number;
  destinationState?: string | null;
  sellerSponsoredStates?: readonly (string | null | undefined)[] | null;
  buyerDropCharge?: number | null;
}

export interface FreightFundingDecision {
  requestedMode: FreightFundingMode;
  appliedMode: FreightFundingMode | "buyer_pays";
  reason: FreightFundingDecisionReason;
  fullFreightCharge: number;
  buyerFreightCharge: number;
  sellerFreightContribution: number;
  sponsorshipApplied: boolean;
  requestedBuyerDropCharge: number | null;
  appliedBuyerDropCharge: number;
  normalizedDestinationState: UsStateCode | null;
  normalizedSellerSponsoredStates: UsStateCode[];
  invalidSellerSponsoredStates: string[];
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeMoney(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return roundCurrency(Math.max(0, value));
}

function normalizeOptionalMoney(value: number | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  return normalizeMoney(value);
}

function buildFundingSplit(input: {
  requestedMode: FreightFundingMode;
  appliedMode: FreightFundingMode | "buyer_pays";
  reason: FreightFundingDecisionReason;
  fullFreightCharge: number;
  requestedBuyerDropCharge: number | null;
  normalizedDestinationState: UsStateCode | null;
  normalizedSellerSponsoredStates: UsStateCode[];
  invalidSellerSponsoredStates: string[];
  sellerSponsored: boolean;
}): FreightFundingDecision {
  const cappedBuyerDropCharge = Math.min(
    input.fullFreightCharge,
    input.requestedBuyerDropCharge ?? 0,
  );
  const buyerFreightCharge = input.sellerSponsored
    ? cappedBuyerDropCharge
    : input.fullFreightCharge;
  const sellerFreightContribution = roundCurrency(
    input.fullFreightCharge - buyerFreightCharge,
  );

  return {
    requestedMode: input.requestedMode,
    appliedMode: input.appliedMode,
    reason: input.reason,
    fullFreightCharge: input.fullFreightCharge,
    buyerFreightCharge,
    sellerFreightContribution,
    sponsorshipApplied: sellerFreightContribution > 0,
    requestedBuyerDropCharge: input.requestedBuyerDropCharge,
    appliedBuyerDropCharge: cappedBuyerDropCharge,
    normalizedDestinationState: input.normalizedDestinationState,
    normalizedSellerSponsoredStates: input.normalizedSellerSponsoredStates,
    invalidSellerSponsoredStates: input.invalidSellerSponsoredStates,
  };
}

export function resolveFreightFunding(
  input: ResolveFreightFundingInput,
): FreightFundingDecision {
  const fullFreightCharge = normalizeMoney(input.fullFreightCharge);
  const requestedBuyerDropCharge = normalizeOptionalMoney(input.buyerDropCharge);

  if (input.mode === "buyer_pays") {
    return buildFundingSplit({
      requestedMode: input.mode,
      appliedMode: "buyer_pays",
      reason: "buyer_pays",
      fullFreightCharge,
      requestedBuyerDropCharge,
      normalizedDestinationState: null,
      normalizedSellerSponsoredStates: [],
      invalidSellerSponsoredStates: [],
      sellerSponsored: false,
    });
  }

  if (input.mode === "seller_pays") {
    return buildFundingSplit({
      requestedMode: input.mode,
      appliedMode: "seller_pays",
      reason:
        requestedBuyerDropCharge != null && requestedBuyerDropCharge > 0
          ? "seller_pays_with_drop_charge"
          : "seller_pays",
      fullFreightCharge,
      requestedBuyerDropCharge,
      normalizedDestinationState: null,
      normalizedSellerSponsoredStates: [],
      invalidSellerSponsoredStates: [],
      sellerSponsored: true,
    });
  }

  const territoryDecision = resolveSellingTerritoryEligibility({
    destinationState: input.destinationState,
    mode: "allowed_states",
    allowedStates: input.sellerSponsoredStates,
  });

  switch (territoryDecision.reason) {
    case "destination_allowed":
      return buildFundingSplit({
        requestedMode: input.mode,
        appliedMode: "seller_pays_selected_states",
        reason:
          requestedBuyerDropCharge != null && requestedBuyerDropCharge > 0
            ? "seller_pays_selected_states_applied_with_drop_charge"
            : "seller_pays_selected_states_applied",
        fullFreightCharge,
        requestedBuyerDropCharge,
        normalizedDestinationState: territoryDecision.normalizedDestinationState,
        normalizedSellerSponsoredStates:
          territoryDecision.normalizedAllowedStates,
        invalidSellerSponsoredStates: territoryDecision.invalidAllowedStates,
        sellerSponsored: true,
      });
    case "territory_invalid":
      return buildFundingSplit({
        requestedMode: input.mode,
        appliedMode: "buyer_pays",
        reason: "selected_states_config_invalid",
        fullFreightCharge,
        requestedBuyerDropCharge,
        normalizedDestinationState: territoryDecision.normalizedDestinationState,
        normalizedSellerSponsoredStates:
          territoryDecision.normalizedAllowedStates,
        invalidSellerSponsoredStates: territoryDecision.invalidAllowedStates,
        sellerSponsored: false,
      });
    case "territory_empty":
      return buildFundingSplit({
        requestedMode: input.mode,
        appliedMode: "buyer_pays",
        reason: "selected_states_config_empty",
        fullFreightCharge,
        requestedBuyerDropCharge,
        normalizedDestinationState: territoryDecision.normalizedDestinationState,
        normalizedSellerSponsoredStates:
          territoryDecision.normalizedAllowedStates,
        invalidSellerSponsoredStates: territoryDecision.invalidAllowedStates,
        sellerSponsored: false,
      });
    case "destination_missing":
      return buildFundingSplit({
        requestedMode: input.mode,
        appliedMode: "buyer_pays",
        reason: "selected_states_destination_missing",
        fullFreightCharge,
        requestedBuyerDropCharge,
        normalizedDestinationState: territoryDecision.normalizedDestinationState,
        normalizedSellerSponsoredStates:
          territoryDecision.normalizedAllowedStates,
        invalidSellerSponsoredStates: territoryDecision.invalidAllowedStates,
        sellerSponsored: false,
      });
    case "destination_invalid":
      return buildFundingSplit({
        requestedMode: input.mode,
        appliedMode: "buyer_pays",
        reason: "selected_states_destination_invalid",
        fullFreightCharge,
        requestedBuyerDropCharge,
        normalizedDestinationState: territoryDecision.normalizedDestinationState,
        normalizedSellerSponsoredStates:
          territoryDecision.normalizedAllowedStates,
        invalidSellerSponsoredStates: territoryDecision.invalidAllowedStates,
        sellerSponsored: false,
      });
    case "destination_blocked":
      return buildFundingSplit({
        requestedMode: input.mode,
        appliedMode: "buyer_pays",
        reason: "selected_states_destination_blocked",
        fullFreightCharge,
        requestedBuyerDropCharge,
        normalizedDestinationState: territoryDecision.normalizedDestinationState,
        normalizedSellerSponsoredStates:
          territoryDecision.normalizedAllowedStates,
        invalidSellerSponsoredStates: territoryDecision.invalidAllowedStates,
        sellerSponsored: false,
      });
    case "unrestricted":
      return buildFundingSplit({
        requestedMode: input.mode,
        appliedMode: "buyer_pays",
        reason: "selected_states_config_invalid",
        fullFreightCharge,
        requestedBuyerDropCharge,
        normalizedDestinationState: territoryDecision.normalizedDestinationState,
        normalizedSellerSponsoredStates:
          territoryDecision.normalizedAllowedStates,
        invalidSellerSponsoredStates: territoryDecision.invalidAllowedStates,
        sellerSponsored: false,
      });
    default:
      throw new Error(
        `Unhandled freight funding territory reason: ${String(
          territoryDecision.reason,
        )}`,
      );
  }
}
