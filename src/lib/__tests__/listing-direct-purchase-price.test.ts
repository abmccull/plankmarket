import { describe, expect, it } from "vitest";
import { getDirectPurchaseUnitPrice } from "../listing-pricing";

describe("getDirectPurchaseUnitPrice", () => {
  it("uses buy-now pricing for direct checkout when configured", () => {
    expect(
      getDirectPurchaseUnitPrice({
        askPricePerSqFt: 3.5,
        buyNowPrice: 3.1,
      }),
    ).toBe(3.1);
  });

  it("falls back to the seller ask when there is no buy-now price", () => {
    expect(
      getDirectPurchaseUnitPrice({
        askPricePerSqFt: 3.5,
        buyNowPrice: null,
      }),
    ).toBe(3.5);
  });
});
