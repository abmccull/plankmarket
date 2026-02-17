// src/server/services/__tests__/fee-calculation.test.ts
//
// These tests verify the fee calculation formulas used inside order.ts
// without hitting the database. The formulas are:
//
//   subtotal    = Math.round(quantitySqFt * pricePerSqFt * 100) / 100
//   buyerFee    = calculateBuyerFee(subtotal)          → Math.round(subtotal * 0.03 * 100) / 100
//   sellerFee   = calculateSellerFee(subtotal)         → Math.round(subtotal * 0.02 * 100) / 100
//   totalPrice  = Math.round((subtotal + buyerFee + shippingPrice) * 100) / 100
//   sellerPayout= Math.round((subtotal - sellerFee) * 100) / 100

import { describe, it, expect } from "vitest";
import { calculateBuyerFee, calculateSellerFee } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Inline pure helpers that mirror the formulas in order.ts
// ---------------------------------------------------------------------------

function calculateSubtotal(quantitySqFt: number, pricePerSqFt: number): number {
  return Math.round(quantitySqFt * pricePerSqFt * 100) / 100;
}

function calculateTotalPrice(subtotal: number, buyerFee: number, shippingPrice: number): number {
  return Math.round((subtotal + buyerFee + shippingPrice) * 100) / 100;
}

function calculateSellerPayout(subtotal: number, sellerFee: number): number {
  return Math.round((subtotal - sellerFee) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Buyer fee (3%)
// ---------------------------------------------------------------------------
describe("Buyer fee (3%)", () => {
  it("should be 3% of a round subtotal", () => {
    expect(calculateBuyerFee(100)).toBe(3);
  });

  it("should be 0 when subtotal is 0", () => {
    expect(calculateBuyerFee(0)).toBe(0);
  });

  it("should round correctly for non-round inputs", () => {
    // 3% of 33.33 = 0.9999 → rounds to 1.00
    expect(calculateBuyerFee(33.33)).toBe(1);
  });

  it("should handle large subtotals accurately", () => {
    // 3% of 10,000 = 300
    expect(calculateBuyerFee(10000)).toBe(300);
  });

  it("should round up half-cent amounts", () => {
    // 3% of 0.50 = 0.015 → Math.round(0.015 * 100) / 100 = Math.round(1.5) / 100 = 2/100 = 0.02
    expect(calculateBuyerFee(0.5)).toBe(0.02);
  });
});

// ---------------------------------------------------------------------------
// Seller fee (2%)
// ---------------------------------------------------------------------------
describe("Seller fee (2%)", () => {
  it("should be 2% of a round subtotal", () => {
    expect(calculateSellerFee(100)).toBe(2);
  });

  it("should be 0 when subtotal is 0", () => {
    expect(calculateSellerFee(0)).toBe(0);
  });

  it("should round correctly for non-round inputs", () => {
    // 2% of 33.33 = 0.6666 → rounds to 0.67
    expect(calculateSellerFee(33.33)).toBe(0.67);
  });

  it("should handle large subtotals accurately", () => {
    // 2% of 10,000 = 200
    expect(calculateSellerFee(10000)).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Subtotal calculation (quantity × pricePerSqFt)
// ---------------------------------------------------------------------------
describe("Subtotal calculation", () => {
  it("should multiply quantity by price per sqft", () => {
    expect(calculateSubtotal(100, 2.5)).toBe(250);
  });

  it("should round to two decimal places", () => {
    // 3 * 1.111 = 3.333 → rounds to 3.33
    expect(calculateSubtotal(3, 1.111)).toBe(3.33);
  });

  it("should return 0 for zero quantity", () => {
    expect(calculateSubtotal(0, 5)).toBe(0);
  });

  it("should return 0 for zero price", () => {
    expect(calculateSubtotal(500, 0)).toBe(0);
  });

  it("should handle large quantity and price", () => {
    // 10,000 sq ft at $5.75 = $57,500
    expect(calculateSubtotal(10000, 5.75)).toBe(57500);
  });

  it("should handle fractional quantities", () => {
    expect(calculateSubtotal(1.5, 10)).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Total price (subtotal + buyerFee + shipping)
// ---------------------------------------------------------------------------
describe("Total price calculation", () => {
  it("should sum subtotal, buyer fee, and shipping", () => {
    const subtotal = 100;
    const buyerFee = calculateBuyerFee(subtotal); // 3
    const shipping = 25;
    expect(calculateTotalPrice(subtotal, buyerFee, shipping)).toBe(128);
  });

  it("should handle zero shipping", () => {
    const subtotal = 200;
    const buyerFee = calculateBuyerFee(subtotal); // 6
    expect(calculateTotalPrice(subtotal, buyerFee, 0)).toBe(206);
  });

  it("should round the total to two decimal places", () => {
    // subtotal=33.33, buyerFee=1.00, shipping=10 → 44.33
    const subtotal = 33.33;
    const buyerFee = calculateBuyerFee(subtotal); // 1.00
    expect(calculateTotalPrice(subtotal, buyerFee, 10)).toBe(44.33);
  });

  it("should handle zero subtotal and zero shipping", () => {
    expect(calculateTotalPrice(0, 0, 0)).toBe(0);
  });

  it("should handle large amounts without floating-point drift", () => {
    const subtotal = 100000;
    const buyerFee = calculateBuyerFee(subtotal); // 3000
    const shipping = 150.75;
    expect(calculateTotalPrice(subtotal, buyerFee, shipping)).toBe(103150.75);
  });
});

// ---------------------------------------------------------------------------
// Seller payout (subtotal − sellerFee)
// ---------------------------------------------------------------------------
describe("Seller payout calculation", () => {
  it("should subtract seller fee from subtotal", () => {
    const subtotal = 100;
    const sellerFee = calculateSellerFee(subtotal); // 2
    expect(calculateSellerPayout(subtotal, sellerFee)).toBe(98);
  });

  it("should return 0 for a zero subtotal", () => {
    expect(calculateSellerPayout(0, 0)).toBe(0);
  });

  it("should round to two decimal places", () => {
    // subtotal=33.33, sellerFee=0.67 → payout=32.66
    const subtotal = 33.33;
    const sellerFee = calculateSellerFee(subtotal); // 0.67
    expect(calculateSellerPayout(subtotal, sellerFee)).toBe(32.66);
  });

  it("should handle large amounts", () => {
    const subtotal = 10000;
    const sellerFee = calculateSellerFee(subtotal); // 200
    expect(calculateSellerPayout(subtotal, sellerFee)).toBe(9800);
  });

  it("payout and total price should account for the correct parties", () => {
    // Buyer pays: subtotal + 3% fee; Seller receives: subtotal - 2% fee
    // Platform earns: buyerFee + sellerFee = 5% of subtotal (plus any shipping margin)
    const subtotal = 1000;
    const buyerFee = calculateBuyerFee(subtotal);    // 30
    const sellerFee = calculateSellerFee(subtotal);  // 20
    const sellerPayout = calculateSellerPayout(subtotal, sellerFee); // 980
    const totalBuyerPays = calculateTotalPrice(subtotal, buyerFee, 0); // 1030

    expect(buyerFee).toBe(30);
    expect(sellerFee).toBe(20);
    expect(sellerPayout).toBe(980);
    expect(totalBuyerPays).toBe(1030);
    // Platform gross margin on order = buyerFee + sellerFee = 50
    expect(buyerFee + sellerFee).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Shipping margin calculation (mirrors order.ts line 128)
// ---------------------------------------------------------------------------
describe("Shipping margin calculation", () => {
  it("should compute margin as shippingPrice minus carrierRate, rounded to 2 decimals", () => {
    const shippingPrice = 50;
    const carrierRate = 37.5;
    const margin = Math.round((shippingPrice - carrierRate) * 100) / 100;
    expect(margin).toBe(12.5);
  });

  it("should return 0 margin when shipping price equals carrier rate", () => {
    const margin = Math.round((25 - 25) * 100) / 100;
    expect(margin).toBe(0);
  });

  it("should handle fractional rates without drift", () => {
    const shippingPrice = 30.33;
    const carrierRate = 22.17;
    const margin = Math.round((shippingPrice - carrierRate) * 100) / 100;
    expect(margin).toBe(8.16);
  });
});
