import zipcodes from "zipcodes";

import {
  normalizeUsStateCode,
  resolveSellingTerritoryEligibility,
  type SellingTerritoryDecisionReason,
  type SellingTerritoryMode,
  type UsStateCode,
} from "@/lib/selling-territory";

export type BuyerRequestListingMatchDecision = {
  eligible: boolean;
  destinationState: UsStateCode | null;
  reason: SellingTerritoryDecisionReason | "destination_zip_unresolved";
};

export type BuyerRequestAlertListingCandidate = {
  listingId: string;
  sellerId: string;
  sellerEmail: string;
  sellerName: string | null;
  territoryMode: SellingTerritoryMode;
  allowedDestinationStates?: readonly (string | null | undefined)[] | null;
};

export type BuyerRequestAlertTarget = {
  sellerId: string;
  sellerEmail: string;
  sellerName: string | null;
  matchingListingIds: string[];
};

/**
 * Rechecks listing territory rules against the buyer-request destination.
 *
 * Unrestricted listings do not depend on ZIP lookup. Restricted listings fail
 * closed when the ZIP cannot be resolved or their state policy is malformed.
 */
export function resolveBuyerRequestListingMatch(input: {
  destinationZip: string;
  territoryMode: SellingTerritoryMode;
  allowedDestinationStates?: readonly (string | null | undefined)[] | null;
}): BuyerRequestListingMatchDecision {
  if (input.territoryMode === "unrestricted") {
    return {
      eligible: true,
      destinationState: null,
      reason: "unrestricted",
    };
  }

  const destinationState = normalizeUsStateCode(
    zipcodes.lookup(input.destinationZip.trim())?.state,
  );
  if (!destinationState) {
    return {
      eligible: false,
      destinationState: null,
      reason: "destination_zip_unresolved",
    };
  }

  const territoryDecision = resolveSellingTerritoryEligibility({
    destinationState,
    mode: input.territoryMode,
    allowedStates: input.allowedDestinationStates,
  });

  return {
    eligible: territoryDecision.eligible,
    destinationState,
    reason: territoryDecision.reason,
  };
}

/**
 * Filters candidate active/material-matched listings by destination territory
 * and returns one alert target per seller.
 */
export function selectBuyerRequestAlertTargets(input: {
  destinationZip: string;
  candidates: readonly BuyerRequestAlertListingCandidate[];
}): BuyerRequestAlertTarget[] {
  const targets = new Map<string, BuyerRequestAlertTarget>();

  for (const candidate of input.candidates) {
    const match = resolveBuyerRequestListingMatch({
      destinationZip: input.destinationZip,
      territoryMode: candidate.territoryMode,
      allowedDestinationStates: candidate.allowedDestinationStates,
    });
    if (!match.eligible) {
      continue;
    }

    const existing = targets.get(candidate.sellerId);
    if (existing) {
      existing.matchingListingIds.push(candidate.listingId);
      continue;
    }

    targets.set(candidate.sellerId, {
      sellerId: candidate.sellerId,
      sellerEmail: candidate.sellerEmail,
      sellerName: candidate.sellerName,
      matchingListingIds: [candidate.listingId],
    });
  }

  return [...targets.values()];
}
