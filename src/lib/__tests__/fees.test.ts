import { describe, it, expect } from "vitest";
import { calculateOrderFees } from "@/lib/fees";

describe("calculateOrderFees - edge cases", () => {
  // ---------------------------------------------------------------------------
  // Rounding edge cases
  // ---------------------------------------------------------------------------
  describe("rounding edge cases", () => {
    it("rounds correctly when buyer fee lands on half-cent boundary", () => {
      // 0.03 * 1.6667 = 0.050001 -> rounds to 0.05, not 0.06
      const fees = calculateOrderFees(1.6667, 0);

      expect(fees.buyerFee).toBe(0.05);
      expect(fees.totalCharge).toBe(1.72);
      expect(fees.sellerFee).toBe(0.03);
      expect(fees.sellerStripeFee).toBe(0.35);
      expect(fees.totalStripeFee).toBe(0.35);
      expect(fees.platformStripeFee).toBe(0);
      expect(fees.sellerPayout).toBe(1.29);
    });

    it("handles a $0.01 subtotal with $0 shipping without NaN", () => {
      const fees = calculateOrderFees(0.01, 0);

      expect(fees.buyerFee).toBe(0);
      expect(fees.totalCharge).toBe(0.01);
      expect(fees.sellerFee).toBe(0);
      expect(fees.sellerStripeFee).toBe(0.3);
      expect(fees.totalStripeFee).toBe(0.3);
      expect(fees.platformStripeFee).toBe(0);
      expect(fees.sellerPayout).toBe(-0.29);

      // No field should be NaN
      for (const value of Object.values(fees)) {
        expect(Number.isNaN(value)).toBe(false);
      }
    });

    it("handles near-zero subtotal $0.001", () => {
      const fees = calculateOrderFees(0.001, 0);

      // 0.03 * 0.001 = 0.00003 -> rounds to 0
      expect(fees.buyerFee).toBe(0);
      // 0.001 + 0 + 0 = 0.001 -> rounds to 0
      expect(fees.totalCharge).toBe(0);
      expect(fees.sellerFee).toBe(0);
      // 0.029 * 0.001 + 0.30 = 0.300029 -> rounds to 0.30
      expect(fees.sellerStripeFee).toBe(0.3);
      expect(fees.totalStripeFee).toBe(0.3);
      expect(fees.platformStripeFee).toBe(0);
      expect(fees.sellerPayout).toBe(-0.3);
    });

    it("handles fractional-cent inputs (subtotal=$99.99, shipping=$49.99)", () => {
      const fees = calculateOrderFees(99.99, 49.99);

      expect(fees.buyerFee).toBe(4.5);
      expect(fees.totalCharge).toBe(154.48);
      expect(fees.sellerFee).toBe(2);
      expect(fees.sellerStripeFee).toBe(3.2);
      expect(fees.totalStripeFee).toBe(4.78);
      expect(fees.platformStripeFee).toBe(1.58);
      expect(fees.sellerPayout).toBe(94.79);
    });
  });

  // ---------------------------------------------------------------------------
  // Negative input safety
  // ---------------------------------------------------------------------------
  describe("negative input safety", () => {
    it("treats negative subtotal as 0", () => {
      const fees = calculateOrderFees(-50, 10);
      const feesZero = calculateOrderFees(0, 10);

      // Negative subtotal should produce the same result as subtotal=0
      expect(fees).toEqual(feesZero);

      // Verify specific values with subtotal clamped to 0
      expect(fees.buyerFee).toBe(0.3);
      expect(fees.totalCharge).toBe(10.3);
      expect(fees.sellerFee).toBe(0);
      expect(fees.sellerStripeFee).toBe(0.3);
      expect(fees.sellerPayout).toBe(-0.3);
    });

    it("treats negative shipping as 0", () => {
      const fees = calculateOrderFees(100, -20);
      const feesZero = calculateOrderFees(100, 0);

      // Negative shipping should produce the same result as shipping=0
      expect(fees).toEqual(feesZero);

      expect(fees.buyerFee).toBe(3);
      expect(fees.totalCharge).toBe(103);
      expect(fees.sellerFee).toBe(2);
      expect(fees.sellerStripeFee).toBe(3.2);
      expect(fees.sellerPayout).toBe(94.8);
    });
  });

  // ---------------------------------------------------------------------------
  // Large values
  // ---------------------------------------------------------------------------
  describe("large values", () => {
    it("handles $1,000,000 subtotal with $50,000 shipping without overflow", () => {
      const fees = calculateOrderFees(1_000_000, 50_000);

      expect(fees.buyerFee).toBe(31_500);
      expect(fees.totalCharge).toBe(1_081_500);
      expect(fees.sellerFee).toBe(20_000);
      expect(fees.sellerStripeFee).toBe(29_000.3);
      expect(fees.totalStripeFee).toBe(31_363.8);
      expect(fees.platformStripeFee).toBe(2_363.5);
      expect(fees.sellerPayout).toBe(950_999.7);

      // No field should be Infinity or NaN
      for (const value of Object.values(fees)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    });

    it("handles near-max subtotal $999,999.99", () => {
      const fees = calculateOrderFees(999_999.99, 0);

      expect(fees.buyerFee).toBe(30_000);
      expect(fees.totalCharge).toBe(1_029_999.99);
      expect(fees.sellerFee).toBe(20_000);
      expect(fees.sellerStripeFee).toBe(29_000.3);
      expect(fees.totalStripeFee).toBe(29_870.3);
      expect(fees.platformStripeFee).toBe(870);
      expect(fees.sellerPayout).toBe(950_999.69);

      for (const value of Object.values(fees)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Fee relationship invariants
  // ---------------------------------------------------------------------------
  describe("fee relationship invariants", () => {
    const testCases: [number, number][] = [
      [0, 0],
      [0.01, 0],
      [1.6667, 0],
      [99.99, 49.99],
      [750, 250],
      [150_000, 8_000],
      [1_000_000, 50_000],
    ];

    it("buyerFee is always 3% of (subtotal + shipping), rounded", () => {
      for (const [subtotal, shipping] of testCases) {
        const fees = calculateOrderFees(subtotal, shipping);
        const expected = Math.round(0.03 * (subtotal + shipping) * 100) / 100;
        expect(fees.buyerFee).toBe(expected);
      }
    });

    it("sellerFee is always 2% of subtotal, rounded", () => {
      for (const [subtotal, shipping] of testCases) {
        const fees = calculateOrderFees(subtotal, shipping);
        const expected = Math.round(0.02 * subtotal * 100) / 100;
        expect(fees.sellerFee).toBe(expected);
      }
    });

    it("totalCharge equals subtotal + shipping + buyerFee", () => {
      for (const [subtotal, shipping] of testCases) {
        const fees = calculateOrderFees(subtotal, shipping);
        const expected =
          Math.round((subtotal + shipping + fees.buyerFee) * 100) / 100;
        expect(fees.totalCharge).toBe(expected);
      }
    });

    it("platformStripeFee is never negative", () => {
      for (const [subtotal, shipping] of testCases) {
        const fees = calculateOrderFees(subtotal, shipping);
        expect(fees.platformStripeFee).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Payout consistency
  // ---------------------------------------------------------------------------
  describe("payout consistency", () => {
    it("sellerPayout equals subtotal minus sellerFee minus sellerStripeFee", () => {
      const testCases: [number, number][] = [
        [0.01, 0],
        [99.99, 49.99],
        [750, 250],
        [1_000_000, 50_000],
      ];

      for (const [subtotal, shipping] of testCases) {
        const fees = calculateOrderFees(subtotal, shipping);
        const expected =
          Math.round(
            (subtotal - fees.sellerFee - fees.sellerStripeFee) * 100,
          ) / 100;
        expect(fees.sellerPayout).toBe(expected);
      }
    });

    it("sellerPayout can be negative for very small subtotals due to Stripe base fee", () => {
      // $0.01 subtotal: payout = 0.01 - 0 - 0.30 = -0.29
      const fees = calculateOrderFees(0.01, 0);
      expect(fees.sellerPayout).toBeLessThan(0);
      expect(fees.sellerPayout).toBe(-0.29);
    });

    it("sellerPayout is -$0.30 for $0 subtotal and $0 shipping", () => {
      // 0 - 0 - 0.30 = -0.30 (the Stripe base fee makes payout negative)
      const fees = calculateOrderFees(0, 0);
      expect(fees.sellerPayout).toBe(-0.3);
      expect(fees.sellerStripeFee).toBe(0.3);
      expect(fees.sellerFee).toBe(0);
    });
  });
});
