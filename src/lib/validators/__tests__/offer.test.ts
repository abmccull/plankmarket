import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/content-filter/index", () => ({
  analyzeContent: () => ({
    allowed: true,
    detections: [],
    highConfidenceDetections: [],
  }),
  getBlockedContentMessage: () => "Blocked",
}));

import {
  createOfferSchema,
  counterOfferSchema,
  acceptOfferSchema,
  respondToOfferSchema,
} from "../offer";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("createOfferSchema", () => {
  it("accepts valid input", () => {
    const result = createOfferSchema.safeParse({
      listingId: VALID_UUID,
      offerPricePerSqFt: 5.5,
      quantitySqFt: 200,
      message: "Interested in this listing",
    });

    expect(result.success).toBe(true);
  });

  it("rejects negative price", () => {
    const result = createOfferSchema.safeParse({
      listingId: VALID_UUID,
      offerPricePerSqFt: -1,
      quantitySqFt: 200,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const priceIssue = result.error.issues.find(
        (i) => i.path[0] === "offerPricePerSqFt"
      );
      expect(priceIssue).toBeDefined();
    }
  });

  it("rejects price above 1000", () => {
    const result = createOfferSchema.safeParse({
      listingId: VALID_UUID,
      offerPricePerSqFt: 1001,
      quantitySqFt: 200,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const priceIssue = result.error.issues.find(
        (i) => i.path[0] === "offerPricePerSqFt"
      );
      expect(priceIssue).toBeDefined();
    }
  });

  it("rejects missing listingId", () => {
    const result = createOfferSchema.safeParse({
      offerPricePerSqFt: 5.5,
      quantitySqFt: 200,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const idIssue = result.error.issues.find(
        (i) => i.path[0] === "listingId"
      );
      expect(idIssue).toBeDefined();
    }
  });
});

describe("counterOfferSchema", () => {
  it("accepts valid counter offer", () => {
    const result = counterOfferSchema.safeParse({
      offerId: VALID_UUID,
      pricePerSqFt: 7.25,
      message: "How about this price?",
    });

    expect(result.success).toBe(true);
  });
});

describe("respondToOfferSchema", () => {
  it("accepts accept action without counterPricePerSqFt", () => {
    const result = respondToOfferSchema.safeParse({
      offerId: VALID_UUID,
      action: "accept",
    });

    expect(result.success).toBe(true);
  });

  it("rejects counter action without counterPricePerSqFt", () => {
    const result = respondToOfferSchema.safeParse({
      offerId: VALID_UUID,
      action: "counter",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const counterPriceIssue = result.error.issues.find(
        (i) => i.path.includes("counterPricePerSqFt")
      );
      expect(counterPriceIssue).toBeDefined();
      expect(counterPriceIssue?.message).toBe(
        "Counter price is required when countering an offer"
      );
    }
  });

  it("accepts counter action with counterPricePerSqFt", () => {
    const result = respondToOfferSchema.safeParse({
      offerId: VALID_UUID,
      action: "counter",
      counterPricePerSqFt: 8.0,
      counterMessage: "Let me counter with this",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid action value", () => {
    const result = respondToOfferSchema.safeParse({
      offerId: VALID_UUID,
      action: "negotiate",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const actionIssue = result.error.issues.find(
        (i) => i.path[0] === "action"
      );
      expect(actionIssue).toBeDefined();
    }
  });
});

describe("acceptOfferSchema", () => {
  it("rejects non-UUID offerId", () => {
    const result = acceptOfferSchema.safeParse({
      offerId: "not-a-uuid",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const idIssue = result.error.issues.find(
        (i) => i.path[0] === "offerId"
      );
      expect(idIssue).toBeDefined();
    }
  });
});
