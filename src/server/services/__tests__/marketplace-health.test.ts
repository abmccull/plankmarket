import { describe, expect, it } from "vitest";
import { calculateMarketplaceHealth } from "../marketplace-health";

describe("calculateMarketplaceHealth", () => {
  it("calculates marketplace liquidity and operating rates from auditable rows", () => {
    const result = calculateMarketplaceHealth({
      windowDays: 30,
      activeListings: 12,
      activeSupplySqFt: 120_000,
      openBuyerRequests: 4,
      openDemandSqFt: 30_000,
      requests: {
        total: 2,
        responded: 1,
        matched: 1,
        averageHoursToResponse: 2,
      },
      listings: { total: 3, withOffers: 2 },
      offers: { total: 2, responded: 1, averageHoursToResponse: 1 },
      orders: {
        paid: 2,
        delivered: 1,
        withIssues: 1,
        averageHoursToPickup: 24,
      },
    });

    expect(result.supplyCoverage).toBe(4);
    expect(result.requestResponseRate).toBe(50);
    expect(result.requestMatchRate).toBe(50);
    expect(result.averageHoursToRequestResponse).toBe(2);
    expect(result.listingOfferRate).toBe(66.7);
    expect(result.offerResponseRate).toBe(50);
    expect(result.averageHoursToOfferResponse).toBe(1);
    expect(result.orderCompletionRate).toBe(50);
    expect(result.averageHoursToPickup).toBe(24);
    expect(result.transactionIssueRate).toBe(50);
  });

  it("returns null rates when a cohort has no denominator", () => {
    const result = calculateMarketplaceHealth({
      windowDays: 30,
      activeListings: 0,
      activeSupplySqFt: 0,
      openBuyerRequests: 0,
      openDemandSqFt: 0,
      requests: {
        total: 0,
        responded: 0,
        matched: 0,
        averageHoursToResponse: null,
      },
      listings: { total: 0, withOffers: 0 },
      offers: { total: 0, responded: 0, averageHoursToResponse: null },
      orders: {
        paid: 0,
        delivered: 0,
        withIssues: 0,
        averageHoursToPickup: null,
      },
    });

    expect(result.supplyCoverage).toBeNull();
    expect(result.requestResponseRate).toBeNull();
    expect(result.requestMatchRate).toBeNull();
    expect(result.listingOfferRate).toBeNull();
    expect(result.offerResponseRate).toBeNull();
    expect(result.orderCompletionRate).toBeNull();
    expect(result.averageHoursToPickup).toBeNull();
    expect(result.transactionIssueRate).toBeNull();
  });
});
