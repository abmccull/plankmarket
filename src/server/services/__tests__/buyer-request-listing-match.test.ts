import { describe, expect, it } from "vitest";

import {
  resolveBuyerRequestListingMatch,
  selectBuyerRequestAlertTargets,
} from "@/server/services/buyer-request-listing-match";

describe("buyer request listing territory matching", () => {
  it("allows unrestricted listings without depending on ZIP resolution", () => {
    expect(
      resolveBuyerRequestListingMatch({
        destinationZip: "00000",
        territoryMode: "unrestricted",
      }),
    ).toEqual({
      eligible: true,
      destinationState: null,
      reason: "unrestricted",
    });
  });

  it("allows a restricted listing when the request ZIP resolves to an allowed state", () => {
    expect(
      resolveBuyerRequestListingMatch({
        destinationZip: "80202",
        territoryMode: "allowed_states",
        allowedDestinationStates: ["CO", "WY"],
      }),
    ).toEqual({
      eligible: true,
      destinationState: "CO",
      reason: "destination_allowed",
    });
  });

  it("blocks a restricted listing outside its allowed territory", () => {
    expect(
      resolveBuyerRequestListingMatch({
        destinationZip: "97201",
        territoryMode: "allowed_states",
        allowedDestinationStates: ["CO", "WY"],
      }),
    ).toEqual({
      eligible: false,
      destinationState: "OR",
      reason: "destination_blocked",
    });
  });

  it("fails closed when a restricted listing destination cannot be resolved", () => {
    expect(
      resolveBuyerRequestListingMatch({
        destinationZip: "00000",
        territoryMode: "allowed_states",
        allowedDestinationStates: ["CO"],
      }),
    ).toEqual({
      eligible: false,
      destinationState: null,
      reason: "destination_zip_unresolved",
    });
  });

  it("fails closed when a restricted listing has malformed territory rules", () => {
    expect(
      resolveBuyerRequestListingMatch({
        destinationZip: "80202",
        territoryMode: "allowed_states",
        allowedDestinationStates: ["CO", "XX"],
      }),
    ).toEqual({
      eligible: false,
      destinationState: "CO",
      reason: "territory_invalid",
    });
  });

  it("targets only territory-eligible sellers and deduplicates their matching listings", () => {
    expect(
      selectBuyerRequestAlertTargets({
        destinationZip: "80202",
        candidates: [
          {
            listingId: "listing-unrestricted",
            sellerId: "seller-a",
            sellerEmail: "a@example.test",
            sellerName: "Seller A",
            territoryMode: "unrestricted",
          },
          {
            listingId: "listing-colorado",
            sellerId: "seller-a",
            sellerEmail: "a@example.test",
            sellerName: "Seller A",
            territoryMode: "allowed_states",
            allowedDestinationStates: ["CO"],
          },
          {
            listingId: "listing-oregon",
            sellerId: "seller-b",
            sellerEmail: "b@example.test",
            sellerName: "Seller B",
            territoryMode: "allowed_states",
            allowedDestinationStates: ["OR"],
          },
        ],
      }),
    ).toEqual([
      {
        sellerId: "seller-a",
        sellerEmail: "a@example.test",
        sellerName: "Seller A",
        matchingListingIds: [
          "listing-unrestricted",
          "listing-colorado",
        ],
      },
    ]);
  });
});
