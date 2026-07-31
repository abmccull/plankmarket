import { describe, expect, it } from "vitest";
import { calculateOrderFees } from "@/lib/fees";

describe("calculateOrderFees", () => {
  it("matches the baseline fee split example", () => {
    const fees = calculateOrderFees(750, 250);

    expect(fees.buyerFee).toBe(37.5);
    expect(fees.totalCharge).toBe(1037.5);
    expect(fees.sellerFee).toBe(37.5);
    expect(fees.sellerStripeFee).toBe(22.05);
    expect(fees.totalStripeFee).toBe(30.39);
    expect(fees.platformStripeFee).toBe(8.34);
    expect(fees.sellerPayout).toBe(690.45);
  });

  it("handles small subtotal rounding correctly", () => {
    const fees = calculateOrderFees(0.5, 0.25);

    expect(fees.buyerFee).toBe(0.03);
    expect(fees.totalCharge).toBe(0.78);
    expect(fees.sellerFee).toBe(0.03);
    expect(fees.sellerStripeFee).toBe(0.31);
    expect(fees.totalStripeFee).toBe(0.32);
    expect(fees.platformStripeFee).toBe(0.01);
    expect(fees.sellerPayout).toBe(0.16);
  });

  it("handles large totals", () => {
    const fees = calculateOrderFees(150000, 8000);

    expect(fees.buyerFee).toBe(7500);
    expect(fees.totalCharge).toBe(165500);
    expect(fees.sellerFee).toBe(7500);
    expect(fees.sellerStripeFee).toBe(4350.3);
    expect(fees.totalStripeFee).toBe(4799.8);
    expect(fees.platformStripeFee).toBe(449.5);
    expect(fees.sellerPayout).toBe(138149.7);
  });

  it("keeps platform stripe fee non-negative", () => {
    const fees = calculateOrderFees(0, 0);

    expect(fees.totalStripeFee).toBe(0.3);
    expect(fees.sellerStripeFee).toBe(0.3);
    expect(fees.platformStripeFee).toBeGreaterThanOrEqual(0);
  });

  it("charges only buyer-funded freight and deducts seller-funded freight", () => {
    const fees = calculateOrderFees(5_000, 150, 600);

    expect(fees.buyerFee).toBe(250);
    expect(fees.totalCharge).toBe(5_400);
    expect(fees.sellerFee).toBe(250);
    expect(fees.sellerStripeFee).toBe(145.3);
    expect(fees.totalStripeFee).toBe(156.9);
    expect(fees.platformStripeFee).toBe(11.6);
    expect(fees.sellerPayout).toBe(4_004.7);
  });
});
