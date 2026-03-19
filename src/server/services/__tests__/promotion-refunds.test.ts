import { describe, expect, it } from "vitest";
import {
  calculateProratedPromotionRefundCents,
  getPromotionEndedAt,
} from "../promotion-refunds";

describe("getPromotionEndedAt", () => {
  it("uses soldAt for sold listings", () => {
    const soldAt = new Date("2026-01-10T00:00:00.000Z");
    expect(
      getPromotionEndedAt({
        listingStatus: "sold",
        listingExpiresAt: new Date("2026-02-01T00:00:00.000Z"),
        listingSoldAt: soldAt,
      }),
    ).toEqual(soldAt);
  });

  it("uses expiresAt for expired listings", () => {
    const expiresAt = new Date("2026-02-01T00:00:00.000Z");
    expect(
      getPromotionEndedAt({
        listingStatus: "expired",
        listingExpiresAt: expiresAt,
        listingSoldAt: null,
      }),
    ).toEqual(expiresAt);
  });
});

describe("calculateProratedPromotionRefundCents", () => {
  it("refunds the unused portion when a listing sells early", () => {
    expect(
      calculateProratedPromotionRefundCents({
        pricePaid: 100,
        startsAt: "2026-01-01T00:00:00.000Z",
        promotionExpiresAt: "2026-01-11T00:00:00.000Z",
        listingStatus: "sold",
        listingExpiresAt: null,
        listingSoldAt: "2026-01-06T00:00:00.000Z",
      }),
    ).toBe(5000);
  });

  it("returns zero when the listing outlives the promotion", () => {
    expect(
      calculateProratedPromotionRefundCents({
        pricePaid: 100,
        startsAt: "2026-01-01T00:00:00.000Z",
        promotionExpiresAt: "2026-01-11T00:00:00.000Z",
        listingStatus: "expired",
        listingExpiresAt: "2026-01-12T00:00:00.000Z",
        listingSoldAt: null,
      }),
    ).toBe(0);
  });
});
