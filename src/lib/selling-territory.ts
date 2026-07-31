const US_STATE_CODES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

const US_STATE_CODE_SET = new Set<string>(US_STATE_CODES);

export { US_STATE_CODES };

export type UsStateCode = (typeof US_STATE_CODES)[number];

export type SellingTerritoryMode = "unrestricted" | "allowed_states";

export type SellingTerritoryDecisionReason =
  | "destination_missing"
  | "destination_invalid"
  | "unrestricted"
  | "territory_invalid"
  | "territory_empty"
  | "destination_allowed"
  | "destination_blocked";

export type SellingTerritoryDecision = {
  eligible: boolean;
  mode: SellingTerritoryMode;
  reason: SellingTerritoryDecisionReason;
  normalizedDestinationState: UsStateCode | null;
  normalizedAllowedStates: UsStateCode[];
  invalidAllowedStates: string[];
};

export function normalizeUsStateCode(
  value: string | null | undefined,
): UsStateCode | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();

  if (!US_STATE_CODE_SET.has(normalized)) {
    return null;
  }

  return normalized as UsStateCode;
}

export function isUsStateCode(
  value: string | null | undefined,
): value is UsStateCode {
  return normalizeUsStateCode(value) !== null;
}

export function normalizeUsStateCodeList(
  values: readonly (string | null | undefined)[] | null | undefined,
): {
  codes: UsStateCode[];
  invalidCodes: string[];
} {
  if (!values?.length) {
    return {
      codes: [],
      invalidCodes: [],
    };
  }

  const codes: UsStateCode[] = [];
  const invalidCodes: string[] = [];
  const seen = new Set<UsStateCode>();

  for (const value of values) {
    const normalized = normalizeUsStateCode(value);

    if (!normalized) {
      if (typeof value === "string" && value.trim().length > 0) {
        invalidCodes.push(value.trim());
      }
      continue;
    }

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    codes.push(normalized);
  }

  return {
    codes,
    invalidCodes,
  };
}

export function resolveSellingTerritoryEligibility(input: {
  destinationState: string | null | undefined;
  mode: SellingTerritoryMode;
  allowedStates?: readonly (string | null | undefined)[] | null;
}): SellingTerritoryDecision {
  const normalizedDestinationState = normalizeUsStateCode(input.destinationState);
  const normalizedAllowed = normalizeUsStateCodeList(input.allowedStates);

  if (!input.destinationState || input.destinationState.trim().length === 0) {
    return {
      eligible: false,
      mode: input.mode,
      reason: "destination_missing",
      normalizedDestinationState: null,
      normalizedAllowedStates: normalizedAllowed.codes,
      invalidAllowedStates: normalizedAllowed.invalidCodes,
    };
  }

  if (!normalizedDestinationState) {
    return {
      eligible: false,
      mode: input.mode,
      reason: "destination_invalid",
      normalizedDestinationState: null,
      normalizedAllowedStates: normalizedAllowed.codes,
      invalidAllowedStates: normalizedAllowed.invalidCodes,
    };
  }

  if (input.mode === "unrestricted") {
    return {
      eligible: true,
      mode: input.mode,
      reason: "unrestricted",
      normalizedDestinationState,
      normalizedAllowedStates: normalizedAllowed.codes,
      invalidAllowedStates: normalizedAllowed.invalidCodes,
    };
  }

  if (normalizedAllowed.invalidCodes.length > 0) {
    return {
      eligible: false,
      mode: input.mode,
      reason: "territory_invalid",
      normalizedDestinationState,
      normalizedAllowedStates: normalizedAllowed.codes,
      invalidAllowedStates: normalizedAllowed.invalidCodes,
    };
  }

  if (normalizedAllowed.codes.length === 0) {
    return {
      eligible: false,
      mode: input.mode,
      reason: "territory_empty",
      normalizedDestinationState,
      normalizedAllowedStates: [],
      invalidAllowedStates: [],
    };
  }

  const eligible = normalizedAllowed.codes.includes(normalizedDestinationState);

  return {
    eligible,
    mode: input.mode,
    reason: eligible ? "destination_allowed" : "destination_blocked",
    normalizedDestinationState,
    normalizedAllowedStates: normalizedAllowed.codes,
    invalidAllowedStates: normalizedAllowed.invalidCodes,
  };
}
