import { describe, expect, it } from "vitest";
import { calculateOrderFees } from "@/lib/fees";

describe("calculateOrderFees", () => {
  it("matches the baseline fee split example", () => {
    const fees = calculateOrderFees(750, 250);

    expect(fees.buyerFee).toBe(30);
    expect(fees.totalCharge).toBe(1030);
    expect(fees.sellerFee).toBe(15);
    expect(fees.sellerStripeFee).toBe(22.05);
    expect(fees.totalStripeFee).toBe(30.17);
    expect(fees.platformStripeFee).toBe(8.12);
    expect(fees.sellerPayout).toBe(712.95);
  });

  it("handles small subtotal rounding correctly", () => {
    const fees = calculateOrderFees(0.5, 0.25);

    expect(fees.buyerFee).toBe(0.02);
    expect(fees.totalCharge).toBe(0.77);
    expect(fees.sellerFee).toBe(0.01);
    expect(fees.sellerStripeFee).toBe(0.31);
    expect(fees.totalStripeFee).toBe(0.32);
    expect(fees.platformStripeFee).toBe(0.01);
    expect(fees.sellerPayout).toBe(0.18);
  });

  it("handles large totals", () => {
    const fees = calculateOrderFees(150000, 8000);

    expect(fees.buyerFee).toBe(4740);
    expect(fees.totalCharge).toBe(162740);
    expect(fees.sellerFee).toBe(3000);
    expect(fees.sellerStripeFee).toBe(4350.3);
    expect(fees.totalStripeFee).toBe(4719.76);
    expect(fees.platformStripeFee).toBe(369.46);
    expect(fees.sellerPayout).toBe(142649.7);
  });

  it("keeps platform stripe fee non-negative", () => {
    const fees = calculateOrderFees(0, 0);

    expect(fees.totalStripeFee).toBe(0.3);
    expect(fees.sellerStripeFee).toBe(0.3);
    expect(fees.platformStripeFee).toBeGreaterThanOrEqual(0);
  });
});
