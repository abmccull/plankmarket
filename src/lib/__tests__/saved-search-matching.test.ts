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
  sellerVerificationStatus: "verified",
  businessAddress: "123 Market St",
  phone: "5551234567",
  locationCity: "Denver",
  locationZip: "80202",
  freightClass: "70",
  totalPallets: 10,
  sqFtPerBox: 20,
  boxesPerPallet: 25,
  palletWeight: 1800,
  palletLength: 48,
  palletWidth: 40,
  palletHeight: 60,
  fullLotOnly: true,
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

  it("matches seller verification, freight readiness, and lot-mode booleans exactly", () => {
    expect(
      listingMatchesSavedSearch(listing, {
        sellerVerified: true,
        freightReady: true,
        fullLotOnly: true,
      }),
    ).toBe(true);

    expect(
      listingMatchesSavedSearch(listing, {
        sellerVerified: false,
      }),
    ).toBe(true);

    expect(
      listingMatchesSavedSearch(
        {
          ...listing,
          sellerVerificationStatus: "pending",
          businessAddress: null,
          fullLotOnly: false,
        },
        {
          sellerVerified: true,
          freightReady: true,
          fullLotOnly: false,
        },
      ),
    ).toBe(false);
  });
});
