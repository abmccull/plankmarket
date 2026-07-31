import { describe, expect, it } from "vitest";
import { resolveSellerDefaultsListingUpdate } from "@/lib/seller-defaults-apply";
import { sellerCommercialDefaultsSchema } from "@/lib/validators/preferences";

const STARTED_AT = new Date("2026-06-01T00:00:00.000Z");
const LAST_APPLIED_AT = new Date("2026-07-01T00:00:00.000Z");
const NOW = new Date("2026-07-30T00:00:00.000Z");

const baseListing = {
  id: "11111111-1111-4111-8111-111111111111",
  askPricePerSqFt: 2.99,
  allowOffers: true,
  fullLotOnly: false,
  partialQuantityMarkupPercent: 20,
  automaticMarkdownEnabled: true,
  automaticMarkdownFloorPercent: 60,
  automaticMarkdownIntervalDays: 21,
  automaticMarkdownStartedAt: STARTED_AT,
  automaticMarkdownCurrentStep: 2,
  automaticMarkdownLastAppliedAt: LAST_APPLIED_AT,
  pricingRulesVersion: 3,
  allowSampleRequests: true,
  territoryMode: "allowed_states" as const,
  allowedDestinationStates: ["TX", "CO"],
  freightPaymentMode: "seller_pays" as const,
  sellerFreightStates: ["TX"],
  freightDropCharge: 95,
};

const matchingDefaults = sellerCommercialDefaultsSchema.parse({
  canSplitLots: true,
  partialQuantityMarkupPercent: 20,
  automaticMarkdownEnabled: true,
  automaticMarkdownFloorPercent: 60,
  automaticMarkdownIntervalDays: 21,
  defaultAllowOffers: true,
  allowSampleRequests: true,
  sellingTerritoryMode: "allowed_states",
  allowedDestinationStates: ["CO", "TX"],
  freightPaymentMode: "seller_pays",
  sellerFreightStates: ["TX"],
  freightDropCharge: 95,
});

describe("seller active-listing default resolution", () => {
  it("leaves an already-matching listing untouched and preserves its markdown schedule", () => {
    const result = resolveSellerDefaultsListingUpdate({
      listing: baseListing,
      defaults: matchingDefaults,
      now: NOW,
    });

    expect(result.changed).toBe(false);
    expect(result.update).toBeNull();
    expect(result.after.automaticMarkdownStartedAt).toEqual(STARTED_AT);
    expect(result.after.automaticMarkdownCurrentStep).toBe(2);
    expect(result.after.automaticMarkdownLastAppliedAt).toEqual(
      LAST_APPLIED_AT,
    );
  });

  it("resets markdown timing, bumps the rule version, and never emits price, quantity, or status fields", () => {
    const defaults = sellerCommercialDefaultsSchema.parse({
      ...matchingDefaults,
      automaticMarkdownIntervalDays: 14,
    });
    const result = resolveSellerDefaultsListingUpdate({
      listing: baseListing,
      defaults,
      now: NOW,
    });

    expect(result.changed).toBe(true);
    if (!result.changed) return;

    expect(result.update.automaticMarkdownStartedAt).toEqual(NOW);
    expect(result.update.automaticMarkdownCurrentStep).toBe(0);
    expect(result.update.automaticMarkdownLastAppliedAt).toBeNull();
    expect(result.update.pricingRulesVersion).toBe(4);
    expect(result.update).not.toHaveProperty("askPricePerSqFt");
    expect(result.update).not.toHaveProperty("totalSqFt");
    expect(result.update).not.toHaveProperty("status");
  });

  it("clears hidden contradictory fields when parent controls are disabled", () => {
    const defaults = sellerCommercialDefaultsSchema.parse({
      canSplitLots: false,
      partialQuantityMarkupPercent: 40,
      automaticMarkdownEnabled: false,
      automaticMarkdownFloorPercent: 50,
      automaticMarkdownIntervalDays: 7,
      defaultAllowOffers: false,
      allowSampleRequests: false,
      sellingTerritoryMode: "unrestricted",
      allowedDestinationStates: ["TX"],
      freightPaymentMode: "buyer_pays",
      sellerFreightStates: ["TX"],
      freightDropCharge: 125,
    });
    const result = resolveSellerDefaultsListingUpdate({
      listing: baseListing,
      defaults,
      now: NOW,
    });

    expect(result.changed).toBe(true);
    if (!result.changed) return;

    expect(result.update.fullLotOnly).toBe(true);
    expect(result.update.partialQuantityMarkupPercent).toBeNull();
    expect(result.update.automaticMarkdownFloorPercent).toBeNull();
    expect(result.update.automaticMarkdownIntervalDays).toBeNull();
    expect(result.update.automaticMarkdownStartedAt).toBeNull();
    expect(result.update.automaticMarkdownCurrentStep).toBe(0);
    expect(result.update.automaticMarkdownLastAppliedAt).toBeNull();
    expect(result.update.allowedDestinationStates).toEqual([]);
    expect(result.update.sellerFreightStates).toEqual([]);
    expect(result.update.freightDropCharge).toBeNull();
  });

  it("preserves markdown progress when only offer and sample defaults change", () => {
    const defaults = sellerCommercialDefaultsSchema.parse({
      ...matchingDefaults,
      defaultAllowOffers: false,
      allowSampleRequests: false,
    });
    const result = resolveSellerDefaultsListingUpdate({
      listing: baseListing,
      defaults,
      now: NOW,
    });

    expect(result.changed).toBe(true);
    if (!result.changed) return;

    expect(result.update.automaticMarkdownStartedAt).toEqual(STARTED_AT);
    expect(result.update.automaticMarkdownCurrentStep).toBe(2);
    expect(result.update.automaticMarkdownLastAppliedAt).toEqual(
      LAST_APPLIED_AT,
    );
  });
});

describe("seller commercial default validation", () => {
  it("requires a complete automatic-markdown schedule", () => {
    const result = sellerCommercialDefaultsSchema.safeParse({
      ...matchingDefaults,
      automaticMarkdownFloorPercent: null,
    });

    expect(result.success).toBe(false);
  });

  it("requires at least one state for a restricted territory", () => {
    const result = sellerCommercialDefaultsSchema.safeParse({
      ...matchingDefaults,
      allowedDestinationStates: [],
    });

    expect(result.success).toBe(false);
  });
});
