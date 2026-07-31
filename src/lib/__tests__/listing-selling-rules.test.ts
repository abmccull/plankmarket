import { describe, expect, it } from "vitest";
import {
  applyUserPreferenceDefaultsToListing,
  getSellerListingPreferenceDefaults,
  PRICING_RULES_VERSION,
  resolveAutomaticMarkdownPersistence,
} from "@/lib/selling-rules";
import {
  listingFormSchema,
} from "@/lib/validators/listing";
import { sellerPreferencesSchema } from "@/lib/validators/preferences";

describe("listing selling rules validation", () => {
  it("normalizes valid state codes and lists on listing form input", () => {
    const result = listingFormSchema.safeParse({
      title: "Verified engineered oak closeout lot",
      materialType: "engineered",
      totalSqFt: 2000,
      totalPallets: 10,
      moq: 500,
      moqUnit: "sqft",
      palletWeight: 1200,
      palletLength: 48,
      palletWidth: 40,
      palletHeight: 60,
      locationState: " tx ",
      locationZip: "75001",
      askPricePerSqFt: 2.49,
      allowOffers: true,
      condition: "closeout",
      fullLotOnly: false,
      territoryMode: "allowed_states",
      allowedDestinationStates: [" co ", "TX", "co"],
      freightPaymentMode: "seller_pays",
      sellerFreightStates: ["az", " nm "],
      freightDropCharge: 95,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.locationState).toBe("TX");
    expect(result.data.allowedDestinationStates).toEqual(["CO", "TX"]);
    expect(result.data.sellerFreightStates).toEqual(["AZ", "NM"]);
    expect(result.data.pricingRulesVersion).toBe(PRICING_RULES_VERSION);
  });

  it("fails closed on conflicting selling-rule combinations", () => {
    const result = listingFormSchema.safeParse({
      title: "Verified engineered oak closeout lot",
      materialType: "engineered",
      totalSqFt: 2000,
      totalPallets: 10,
      moq: 500,
      moqUnit: "sqft",
      palletWeight: 1200,
      palletLength: 48,
      palletWidth: 40,
      palletHeight: 60,
      locationZip: "75001",
      askPricePerSqFt: 2.49,
      allowOffers: true,
      condition: "closeout",
      fullLotOnly: true,
      partialQuantityMarkupPercent: 20,
      territoryMode: "allowed_states",
      allowedDestinationStates: [],
      freightPaymentMode: "buyer_pays",
      sellerFreightStates: ["TX"],
      freightDropCharge: 80,
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    const paths = result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("partialQuantityMarkupPercent");
    expect(paths).toContain("allowedDestinationStates");
    expect(paths).toContain("sellerFreightStates");
    expect(paths).toContain("freightDropCharge");
  });

  it("normalizes seller preference defaults metadata", () => {
    const result = sellerPreferencesSchema.safeParse({
      canSplitLots: true,
      automaticMarkdownEnabled: true,
      automaticMarkdownFloorPercent: 60,
      automaticMarkdownIntervalDays: 21,
      allowSampleRequests: true,
      sellingTerritoryMode: "allowed_states",
      allowedDestinationStates: ["CA", "NV"],
      freightPaymentMode: "seller_pays",
      sellerFreightStates: ["OR", "WA"],
      freightDropCharge: 125,
      taxRegisteredStates: ["TX", "CO"],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.allowedDestinationStates).toEqual(["CA", "NV"]);
    expect(result.data.sellerFreightStates).toEqual(["OR", "WA"]);
    expect(result.data.taxRegisteredStates).toEqual(["TX", "CO"]);
  });
});

describe("listing selling-rule helpers", () => {
  it("applies user preference defaults only where listing input omits them", () => {
    const merged = applyUserPreferenceDefaultsToListing(
      {
        fullLotOnly: true,
        freightPaymentMode: "seller_pays",
      },
      {
        canSplitLots: false,
        allowSampleRequests: true,
        sellingTerritoryMode: "allowed_states",
        allowedDestinationStates: ["CO"],
      },
    );

    expect(merged.fullLotOnly).toBe(true);
    expect(merged.allowSampleRequests).toBe(true);
    expect(merged.territoryMode).toBe("allowed_states");
    expect(merged.allowedDestinationStates).toEqual(["CO"]);
    expect(merged.freightPaymentMode).toBe("seller_pays");
    expect(merged.pricingRulesVersion).toBe(PRICING_RULES_VERSION);
  });

  it("resets automatic markdown state when pricing rules change", () => {
    const result = resolveAutomaticMarkdownPersistence({
      existing: {
        askPricePerSqFt: 2.99,
        automaticMarkdownEnabled: true,
        automaticMarkdownFloorPercent: 60,
        automaticMarkdownIntervalDays: 21,
        automaticMarkdownStartedAt: "2026-06-01T00:00:00.000Z",
        automaticMarkdownCurrentStep: 2,
        automaticMarkdownLastAppliedAt: "2026-07-01T00:00:00.000Z",
      },
      next: {
        askPricePerSqFt: 2.89,
        automaticMarkdownEnabled: true,
        automaticMarkdownFloorPercent: 60,
        automaticMarkdownIntervalDays: 21,
      },
      now: "2026-07-30T00:00:00.000Z",
    });

    expect(result.automaticMarkdownCurrentStep).toBe(0);
    expect(result.automaticMarkdownLastAppliedAt).toBeNull();
    expect(result.automaticMarkdownStartedAt?.toISOString()).toBe(
      "2026-07-30T00:00:00.000Z",
    );
  });

  it("returns merged seller preference defaults", () => {
    const result = getSellerListingPreferenceDefaults({
      allowSampleRequests: true,
      taxRegisteredStates: ["TX"],
    });

    expect(result.allowSampleRequests).toBe(true);
    expect(result.taxRegisteredStates).toEqual(["TX"]);
    expect(result.canSplitLots).toBe(true);
  });
});
