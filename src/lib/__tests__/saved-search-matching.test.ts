import { describe, expect, it } from "vitest";
import { listingMatchesSavedSearch } from "../saved-search-matching";

const listing = {
  title: "Select White Oak Closeout",
  description: "Wire-brushed commercial flooring",
  materialType: "hardwood",
  species: "oak",
  colorFamily: "light",
  finish: "wire_brushed",
  width: 5,
  thickness: 0.75,
  wearLayer: null,
  askPricePerSqFt: 4.5,
  buyNowPrice: 3.25,
  condition: "closeout",
  locationState: "CO",
  locationLat: 39.7392,
  locationLng: -104.9903,
  certifications: ["fsc", "carb2"],
  totalSqFt: 5_000,
  brand: "Acme",
};

describe("listingMatchesSavedSearch", () => {
  it("matches price filters against buy-now when ask and direct price differ", () => {
    expect(
      listingMatchesSavedSearch(listing, {
        priceMin: 3,
        priceMax: 3.5,
      }),
    ).toBe(true);

    expect(
      listingMatchesSavedSearch(listing, {
        priceMin: 4,
      }),
    ).toBe(false);
  });

  it("matches the flooring facets and any requested certification", () => {
    expect(
      listingMatchesSavedSearch(listing, {
        query: "white oak",
        materialType: ["hardwood"],
        species: ["oak"],
        colorFamily: ["light"],
        finishType: ["wire_brushed"],
        width: [5.05],
        thickness: [0.75],
        condition: ["closeout"],
        certifications: ["fsc"],
        minLotSize: 4_000,
        maxLotSize: 6_000,
        state: ["CO"],
      }),
    ).toBe(true);

    expect(
      listingMatchesSavedSearch(listing, {
        certifications: ["floorscore"],
      }),
    ).toBe(false);
  });

  it("applies an exact ZIP-radius check when the saved search requests one", () => {
    expect(
      listingMatchesSavedSearch(listing, {
        buyerZip: "80202",
        maxDistance: 25,
      }),
    ).toBe(true);

    expect(
      listingMatchesSavedSearch(listing, {
        buyerZip: "10001",
        maxDistance: 25,
      }),
    ).toBe(false);
  });
});
