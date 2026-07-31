import { describe, expect, it } from "vitest";

import {
  FREIGHT_FUNDING_MODES,
  resolveFreightFunding,
} from "@/lib/freight-funding";

describe("freight funding", () => {
  it("exposes the supported freight funding modes", () => {
    expect(FREIGHT_FUNDING_MODES).toEqual([
      "buyer_pays",
      "seller_pays",
      "seller_pays_selected_states",
    ]);
  });

  it("charges the buyer the full freight quote in buyer-pays mode", () => {
    expect(
      resolveFreightFunding({
        mode: "buyer_pays",
        fullFreightCharge: 875.42,
        buyerDropCharge: 125,
      }),
    ).toEqual({
      requestedMode: "buyer_pays",
      appliedMode: "buyer_pays",
      reason: "buyer_pays",
      fullFreightCharge: 875.42,
      buyerFreightCharge: 875.42,
      sellerFreightContribution: 0,
      sponsorshipApplied: false,
      requestedBuyerDropCharge: 125,
      appliedBuyerDropCharge: 125,
      normalizedDestinationState: null,
      normalizedSellerSponsoredStates: [],
      invalidSellerSponsoredStates: [],
    });
  });

  it("lets the seller fully sponsor freight when seller-pays mode has no drop charge", () => {
    expect(
      resolveFreightFunding({
        mode: "seller_pays",
        fullFreightCharge: 1000,
      }),
    ).toEqual({
      requestedMode: "seller_pays",
      appliedMode: "seller_pays",
      reason: "seller_pays",
      fullFreightCharge: 1000,
      buyerFreightCharge: 0,
      sellerFreightContribution: 1000,
      sponsorshipApplied: true,
      requestedBuyerDropCharge: null,
      appliedBuyerDropCharge: 0,
      normalizedDestinationState: null,
      normalizedSellerSponsoredStates: [],
      invalidSellerSponsoredStates: [],
    });
  });

  it("splits freight correctly when seller-pays mode includes a buyer drop charge", () => {
    expect(
      resolveFreightFunding({
        mode: "seller_pays",
        fullFreightCharge: 850,
        buyerDropCharge: 175,
      }),
    ).toEqual({
      requestedMode: "seller_pays",
      appliedMode: "seller_pays",
      reason: "seller_pays_with_drop_charge",
      fullFreightCharge: 850,
      buyerFreightCharge: 175,
      sellerFreightContribution: 675,
      sponsorshipApplied: true,
      requestedBuyerDropCharge: 175,
      appliedBuyerDropCharge: 175,
      normalizedDestinationState: null,
      normalizedSellerSponsoredStates: [],
      invalidSellerSponsoredStates: [],
    });
  });

  it("caps the buyer drop charge at the full freight quote", () => {
    expect(
      resolveFreightFunding({
        mode: "seller_pays",
        fullFreightCharge: 400,
        buyerDropCharge: 999,
      }),
    ).toMatchObject({
      reason: "seller_pays_with_drop_charge",
      fullFreightCharge: 400,
      buyerFreightCharge: 400,
      sellerFreightContribution: 0,
      sponsorshipApplied: false,
      requestedBuyerDropCharge: 999,
      appliedBuyerDropCharge: 400,
    });
  });

  it("applies selected-state sponsorship when the destination is eligible", () => {
    expect(
      resolveFreightFunding({
        mode: "seller_pays_selected_states",
        fullFreightCharge: 725.55,
        destinationState: " co ",
        sellerSponsoredStates: ["TX", "co", " CO ", "nm"],
        buyerDropCharge: 75.55,
      }),
    ).toEqual({
      requestedMode: "seller_pays_selected_states",
      appliedMode: "seller_pays_selected_states",
      reason: "seller_pays_selected_states_applied_with_drop_charge",
      fullFreightCharge: 725.55,
      buyerFreightCharge: 75.55,
      sellerFreightContribution: 650,
      sponsorshipApplied: true,
      requestedBuyerDropCharge: 75.55,
      appliedBuyerDropCharge: 75.55,
      normalizedDestinationState: "CO",
      normalizedSellerSponsoredStates: ["TX", "CO", "NM"],
      invalidSellerSponsoredStates: [],
    });
  });

  it("falls back to buyer pays when the destination is outside the sponsored states", () => {
    expect(
      resolveFreightFunding({
        mode: "seller_pays_selected_states",
        fullFreightCharge: 612.34,
        destinationState: "UT",
        sellerSponsoredStates: ["AZ", "CO", "NM"],
        buyerDropCharge: 150,
      }),
    ).toEqual({
      requestedMode: "seller_pays_selected_states",
      appliedMode: "buyer_pays",
      reason: "selected_states_destination_blocked",
      fullFreightCharge: 612.34,
      buyerFreightCharge: 612.34,
      sellerFreightContribution: 0,
      sponsorshipApplied: false,
      requestedBuyerDropCharge: 150,
      appliedBuyerDropCharge: 150,
      normalizedDestinationState: "UT",
      normalizedSellerSponsoredStates: ["AZ", "CO", "NM"],
      invalidSellerSponsoredStates: [],
    });
  });

  it("fails closed to buyer pays when the destination state is missing", () => {
    expect(
      resolveFreightFunding({
        mode: "seller_pays_selected_states",
        fullFreightCharge: 500,
        destinationState: " ",
        sellerSponsoredStates: ["CA", "NV"],
      }),
    ).toMatchObject({
      appliedMode: "buyer_pays",
      reason: "selected_states_destination_missing",
      buyerFreightCharge: 500,
      sellerFreightContribution: 0,
      sponsorshipApplied: false,
      normalizedDestinationState: null,
      normalizedSellerSponsoredStates: ["CA", "NV"],
    });
  });

  it("fails closed to buyer pays when the destination state is invalid", () => {
    expect(
      resolveFreightFunding({
        mode: "seller_pays_selected_states",
        fullFreightCharge: 500,
        destinationState: "PR",
        sellerSponsoredStates: ["CA", "NV"],
      }),
    ).toMatchObject({
      appliedMode: "buyer_pays",
      reason: "selected_states_destination_invalid",
      buyerFreightCharge: 500,
      sellerFreightContribution: 0,
      sponsorshipApplied: false,
      normalizedDestinationState: null,
      normalizedSellerSponsoredStates: ["CA", "NV"],
    });
  });

  it("fails closed to buyer pays when the selected-state config is empty", () => {
    expect(
      resolveFreightFunding({
        mode: "seller_pays_selected_states",
        fullFreightCharge: 500,
        destinationState: "CA",
        sellerSponsoredStates: [],
      }),
    ).toEqual({
      requestedMode: "seller_pays_selected_states",
      appliedMode: "buyer_pays",
      reason: "selected_states_config_empty",
      fullFreightCharge: 500,
      buyerFreightCharge: 500,
      sellerFreightContribution: 0,
      sponsorshipApplied: false,
      requestedBuyerDropCharge: null,
      appliedBuyerDropCharge: 0,
      normalizedDestinationState: "CA",
      normalizedSellerSponsoredStates: [],
      invalidSellerSponsoredStates: [],
    });
  });

  it("fails closed to buyer pays when the selected-state config contains invalid codes", () => {
    expect(
      resolveFreightFunding({
        mode: "seller_pays_selected_states",
        fullFreightCharge: 500,
        destinationState: "CA",
        sellerSponsoredStates: ["CA", "XX", "NV"],
      }),
    ).toEqual({
      requestedMode: "seller_pays_selected_states",
      appliedMode: "buyer_pays",
      reason: "selected_states_config_invalid",
      fullFreightCharge: 500,
      buyerFreightCharge: 500,
      sellerFreightContribution: 0,
      sponsorshipApplied: false,
      requestedBuyerDropCharge: null,
      appliedBuyerDropCharge: 0,
      normalizedDestinationState: "CA",
      normalizedSellerSponsoredStates: ["CA", "NV"],
      invalidSellerSponsoredStates: ["XX"],
    });
  });

  it("normalizes invalid or negative money inputs to a safe nonnegative result", () => {
    expect(
      resolveFreightFunding({
        mode: "seller_pays",
        fullFreightCharge: Number.NaN,
        buyerDropCharge: -25,
      }),
    ).toEqual({
      requestedMode: "seller_pays",
      appliedMode: "seller_pays",
      reason: "seller_pays",
      fullFreightCharge: 0,
      buyerFreightCharge: 0,
      sellerFreightContribution: 0,
      sponsorshipApplied: false,
      requestedBuyerDropCharge: 0,
      appliedBuyerDropCharge: 0,
      normalizedDestinationState: null,
      normalizedSellerSponsoredStates: [],
      invalidSellerSponsoredStates: [],
    });
  });

  it("maintains the accounting invariant across all supported modes", () => {
    const decisions = [
      resolveFreightFunding({
        mode: "buyer_pays",
        fullFreightCharge: 1000,
      }),
      resolveFreightFunding({
        mode: "seller_pays",
        fullFreightCharge: 1000,
        buyerDropCharge: 150,
      }),
      resolveFreightFunding({
        mode: "seller_pays_selected_states",
        fullFreightCharge: 1000,
        destinationState: "TX",
        sellerSponsoredStates: ["TX"],
        buyerDropCharge: 150,
      }),
      resolveFreightFunding({
        mode: "seller_pays_selected_states",
        fullFreightCharge: 1000,
        destinationState: "WA",
        sellerSponsoredStates: ["TX"],
        buyerDropCharge: 150,
      }),
    ];

    for (const decision of decisions) {
      expect(
        Number(
          (
            decision.buyerFreightCharge + decision.sellerFreightContribution
          ).toFixed(2),
        ),
      ).toBe(decision.fullFreightCharge);
      expect(decision.buyerFreightCharge).toBeGreaterThanOrEqual(0);
      expect(decision.sellerFreightContribution).toBeGreaterThanOrEqual(0);
      expect(decision.appliedBuyerDropCharge).toBeLessThanOrEqual(
        decision.fullFreightCharge,
      );
    }
  });
});
