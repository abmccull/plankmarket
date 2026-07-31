import { describe, expect, it } from "vitest";
import {
  applyBasisPoints,
  applyShippingMarkup,
  assertCommercialPolicy,
  captureCommercialPolicy,
  CURRENT_COMMERCIAL_POLICY,
} from "@/lib/commercial-policy";

describe("commercial policy", () => {
  it("uses the launch 5/5 marketplace fee policy", () => {
    expect(applyBasisPoints(5_000, 500)).toBe(250);
    expect(CURRENT_COMMERCIAL_POLICY.buyerMarketplaceFeeBps).toBe(500);
    expect(CURRENT_COMMERCIAL_POLICY.sellerMarketplaceFeeBps).toBe(500);
  });

  it("applies the configured freight markup with cent rounding", () => {
    expect(applyShippingMarkup(799.99)).toBe(999.99);
    expect(applyShippingMarkup(1_000)).toBe(1_250);
  });

  it("captures a stable policy version for an order", () => {
    expect(
      captureCommercialPolicy(new Date("2026-07-30T12:00:00.000Z")),
    ).toEqual({
      ...CURRENT_COMMERCIAL_POLICY,
      capturedAt: "2026-07-30T12:00:00.000Z",
    });
  });

  it("rejects invalid or silently unbounded policy values", () => {
    expect(() =>
      assertCommercialPolicy({
        ...CURRENT_COMMERCIAL_POLICY,
        shippingMarkupBps: 10_001,
      }),
    ).toThrow("Commercial policy contains invalid rates.");
  });
});
