import { describe, expect, it } from "vitest";
import {
  US_STATE_CODES,
  isUsStateCode,
  normalizeUsStateCode,
  normalizeUsStateCodeList,
  resolveSellingTerritoryEligibility,
} from "@/lib/selling-territory";

describe("selling territory primitives", () => {
  it("exposes the canonical 50 US state codes", () => {
    expect(US_STATE_CODES).toHaveLength(50);
    expect(US_STATE_CODES[0]).toBe("AL");
    expect(US_STATE_CODES[49]).toBe("WY");
  });

  it("normalizes valid state codes and rejects invalid input", () => {
    expect(normalizeUsStateCode(" tx ")).toBe("TX");
    expect(normalizeUsStateCode("ca")).toBe("CA");
    expect(normalizeUsStateCode("PR")).toBeNull();
    expect(normalizeUsStateCode("")).toBeNull();
    expect(normalizeUsStateCode(undefined)).toBeNull();
  });

  it("validates state codes through a predicate", () => {
    expect(isUsStateCode("wa")).toBe(true);
    expect(isUsStateCode("XX")).toBe(false);
    expect(isUsStateCode(null)).toBe(false);
  });

  it("normalizes lists, dedupes codes, and reports invalid entries", () => {
    expect(
      normalizeUsStateCodeList([" tx ", "TX", "co", " PR ", "", null, "  "]),
    ).toEqual({
      codes: ["TX", "CO"],
      invalidCodes: ["PR"],
    });
  });

  it("allows unrestricted destinations once the destination state is valid", () => {
    expect(
      resolveSellingTerritoryEligibility({
        destinationState: " nj ",
        mode: "unrestricted",
      }),
    ).toEqual({
      eligible: true,
      mode: "unrestricted",
      reason: "unrestricted",
      normalizedDestinationState: "NJ",
      normalizedAllowedStates: [],
      invalidAllowedStates: [],
    });
  });

  it("fails closed when the destination state is missing or invalid", () => {
    expect(
      resolveSellingTerritoryEligibility({
        destinationState: " ",
        mode: "unrestricted",
      }),
    ).toMatchObject({
      eligible: false,
      reason: "destination_missing",
      normalizedDestinationState: null,
    });

    expect(
      resolveSellingTerritoryEligibility({
        destinationState: "puerto rico",
        mode: "allowed_states",
        allowedStates: ["CA", "NV"],
      }),
    ).toMatchObject({
      eligible: false,
      reason: "destination_invalid",
      normalizedDestinationState: null,
      normalizedAllowedStates: ["CA", "NV"],
    });
  });

  it("fails closed when an allowed-state policy is empty", () => {
    expect(
      resolveSellingTerritoryEligibility({
        destinationState: "CA",
        mode: "allowed_states",
        allowedStates: [],
      }),
    ).toEqual({
      eligible: false,
      mode: "allowed_states",
      reason: "territory_empty",
      normalizedDestinationState: "CA",
      normalizedAllowedStates: [],
      invalidAllowedStates: [],
    });
  });

  it("fails closed when the configured territory contains invalid state codes", () => {
    expect(
      resolveSellingTerritoryEligibility({
        destinationState: "CA",
        mode: "allowed_states",
        allowedStates: ["CA", "XX", "NV"],
      }),
    ).toEqual({
      eligible: false,
      mode: "allowed_states",
      reason: "territory_invalid",
      normalizedDestinationState: "CA",
      normalizedAllowedStates: ["CA", "NV"],
      invalidAllowedStates: ["XX"],
    });
  });

  it("allows only configured states under an allowed-state policy", () => {
    expect(
      resolveSellingTerritoryEligibility({
        destinationState: "co",
        mode: "allowed_states",
        allowedStates: ["AZ", "CO", "NM"],
      }),
    ).toEqual({
      eligible: true,
      mode: "allowed_states",
      reason: "destination_allowed",
      normalizedDestinationState: "CO",
      normalizedAllowedStates: ["AZ", "CO", "NM"],
      invalidAllowedStates: [],
    });

    expect(
      resolveSellingTerritoryEligibility({
        destinationState: "UT",
        mode: "allowed_states",
        allowedStates: ["AZ", "CO", "NM"],
      }),
    ).toEqual({
      eligible: false,
      mode: "allowed_states",
      reason: "destination_blocked",
      normalizedDestinationState: "UT",
      normalizedAllowedStates: ["AZ", "CO", "NM"],
      invalidAllowedStates: [],
    });
  });
});
