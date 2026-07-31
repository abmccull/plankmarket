import { describe, expect, it } from "vitest";
import {
  toConversationParty,
  toPublicListing,
  toPublicReview,
  type PublicListingSource,
  type PublicReviewSource,
} from "@/server/security/public-data";

const listingSource = {
  id: "00000000-0000-4000-8000-000000000001",
  sellerId: "00000000-0000-4000-8000-000000000002",
  title: "Oak overstock",
  slug: "oak-overstock",
  description: "Public description",
  status: "active",
  materialType: "hardwood",
  species: "Oak",
  finish: "matte",
  grade: "select",
  color: "Natural",
  colorFamily: "brown",
  thickness: 0.75,
  width: 5,
  length: 72,
  wearLayer: null,
  brand: "Example",
  modelNumber: "OAK-1",
  sqFtPerBox: 20,
  boxesPerPallet: 40,
  totalSqFt: 800,
  totalPallets: 1,
  moq: 400,
  moqUnit: "sqft",
  palletWeight: 1_200,
  palletLength: 48,
  palletWidth: 40,
  palletHeight: 48,
  nmfcCode: "12345",
  freightClass: "70",
  locationCity: "Denver",
  locationState: "CO",
  askPricePerSqFt: 3.25,
  buyNowPrice: null,
  allowOffers: true,
  condition: "new_overstock",
  reasonCode: "overproduction",
  certifications: ["fsc"],
  viewsCount: 10,
  watchlistCount: 2,
  offerCount: 1,
  promotionTier: null,
  promotionExpiresAt: null,
  qualityScore: 90,
  shipReady: true,
  lastConfirmedAt: new Date("2026-07-29T00:00:00Z"),
  confirmationDueAt: new Date("2026-08-12T00:00:00Z"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
  expiresAt: new Date("2026-04-01T00:00:00Z"),
  floorPrice: 2.5,
  originalAskPricePerSqFt: 4.5,
  originalTotalSqFt: 1_000,
  locationZip: "80202",
  locationLat: 39.75,
  locationLng: -104.99,
  media: [
    {
      id: "00000000-0000-4000-8000-000000000003",
      url: "https://example.ufs.sh/f/file-key",
      altText: "Oak flooring",
      sortOrder: 0,
      key: "file-key",
    },
  ],
  seller: {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Real Seller Name",
    role: "seller",
    businessCity: "Denver",
    businessState: "CO",
    businessAddress: "123 Private Warehouse Road",
    phone: "555-0100",
    verificationStatus: "verified",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    stripeOnboardingComplete: true,
  },
};

describe("public marketplace DTOs", () => {
  it("drops confidential pricing, exact location, upload keys, and real names", () => {
    const result = toPublicListing(
      listingSource as unknown as PublicListingSource,
    );

    expect(result).not.toHaveProperty("floorPrice");
    expect(result).not.toHaveProperty("originalAskPricePerSqFt");
    expect(result).not.toHaveProperty("originalTotalSqFt");
    expect(result).not.toHaveProperty("locationZip");
    expect(result).not.toHaveProperty("locationLat");
    expect(result).not.toHaveProperty("locationLng");
    expect(result.freightEstimateStatus).toBe("quote_request_ready");
    expect(result.freshnessStatus).toBe("fresh");
    expect(result.lastConfirmedAt).toEqual(new Date("2026-07-29T00:00:00Z"));
    expect(result.media[0]).not.toHaveProperty("key");
    expect(result.seller).not.toHaveProperty("name");
    expect(result.seller).not.toHaveProperty("businessAddress");
    expect(result.seller).not.toHaveProperty("phone");
    expect(result.seller?.displayName).toMatch(
      /^Verified (Seller|Supplier) in Denver, CO$/,
    );
  });

  it("reveals a conversation name only after the server authorizes it", () => {
    const party = {
      id: "00000000-0000-4000-8000-000000000004",
      name: "Jane Contractor",
      role: "buyer" as const,
      businessCity: "Boulder",
      businessState: "CO",
      verificationStatus: "verified",
    };

    expect(toConversationParty(party, false)).toMatchObject({
      name: null,
      identityRevealed: false,
    });
    expect(toConversationParty(party, false).displayName).toMatch(
      /^Verified (Buyer|Professional) in Boulder, CO$/,
    );
    expect(toConversationParty(party, true)).toMatchObject({
      name: "Jane Contractor",
      identityRevealed: true,
      displayName: "Jane Contractor",
    });
  });

  it("keeps public reviews free of order and relationship identifiers", () => {
    const result = toPublicReview({
      id: "00000000-0000-4000-8000-000000000005",
      direction: "buyer_to_seller",
      rating: 5,
      title: "Accurate listing",
      comment: "The lot matched the description.",
      communicationRating: 5,
      accuracyRating: 5,
      shippingRating: 4,
      sellerResponse: "Thank you.",
      sellerRespondedAt: new Date("2026-07-29T00:00:00Z"),
      createdAt: new Date("2026-07-28T00:00:00Z"),
      orderId: "00000000-0000-4000-8000-000000000006",
      reviewerId: "00000000-0000-4000-8000-000000000007",
      sellerId: "00000000-0000-4000-8000-000000000008",
      revieweeId: "00000000-0000-4000-8000-000000000008",
    } as unknown as PublicReviewSource);

    expect(result).toMatchObject({
      id: "00000000-0000-4000-8000-000000000005",
      direction: "buyer_to_seller",
      rating: 5,
    });
    expect(result).not.toHaveProperty("orderId");
    expect(result).not.toHaveProperty("reviewerId");
    expect(result).not.toHaveProperty("sellerId");
    expect(result).not.toHaveProperty("revieweeId");
  });
});
