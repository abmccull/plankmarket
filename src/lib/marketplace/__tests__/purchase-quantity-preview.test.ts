import { describe, expect, it } from "vitest";
import { getPurchaseQuantityPreview } from "../purchase-quantity-preview";

const lot = {
  totalSqFt: 1200, askPricePerSqFt: 3, buyNowPrice: 2, moq: 100, moqUnit: "sqft" as const,
  purchaseTerms: { fullLotOnly: false, partialQuantityMarkupPercent: null as number | null, sqFtPerBox: 20 as number | null, boxesPerPallet: 30 as number | null },
};

describe("buyer job quantity comparison", () => {
  it("prices the actual split quantity with buy-now price and buyer fee", () => {
    expect(getPurchaseQuantityPreview(lot, 500)).toMatchObject({ status: "ready", quantitySqFt: 500, extraSqFt: 0, unitPrice: 2, subtotal: 1000, buyerFee: 50, totalBeforeShippingAndTax: 1050, adjustments: [] });
  });
  it("discloses minimum-order excess", () => {
    expect(getPurchaseQuantityPreview({ ...lot, moq: 600 }, 500)).toMatchObject({ status: "ready", quantitySqFt: 600, extraSqFt: 100, totalBeforeShippingAndTax: 1260, adjustments: ["minimum"] });
  });
  it("discloses a mandatory whole-lot purchase", () => {
    expect(getPurchaseQuantityPreview({ ...lot, purchaseTerms: { ...lot.purchaseTerms, fullLotOnly: true } }, 500)).toMatchObject({ status: "ready", quantitySqFt: 1200, extraSqFt: 700, totalBeforeShippingAndTax: 2520, adjustments: ["full_lot"] });
  });
  it("rounds the requested area upward to complete cartons", () => {
    expect(getPurchaseQuantityPreview(lot, 501)).toMatchObject({ status: "ready", quantitySqFt: 520, extraSqFt: 19, totalBeforeShippingAndTax: 1092, adjustments: ["boxes"] });
  });
  it("combines minimum and carton requirements", () => {
    expect(getPurchaseQuantityPreview({ ...lot, moq: 501 }, 400)).toMatchObject({ status: "ready", quantitySqFt: 520, adjustments: ["minimum", "boxes"] });
  });
  it("converts only known pallet quantities", () => {
    expect(getPurchaseQuantityPreview({ ...lot, totalSqFt: 1800, moq: 2, moqUnit: "pallets" }, 500)).toMatchObject({ status: "ready", quantitySqFt: 1200, extraSqFt: 700, totalBeforeShippingAndTax: 2520 });
  });
  it.each(["sqFtPerBox", "boxesPerPallet"] as const)("does not invent missing %s for pallet MOQ", key => {
    expect(getPurchaseQuantityPreview({ ...lot, moq: 1, moqUnit: "pallets", purchaseTerms: { ...lot.purchaseTerms, [key]: null } }, 500)).toMatchObject({ status: "needs_details" });
  });
  it("applies partial markup to the unit price before subtotal and fees", () => {
    expect(getPurchaseQuantityPreview({ ...lot, purchaseTerms: { ...lot.purchaseTerms, partialQuantityMarkupPercent: 25 } }, 500)).toMatchObject({ status: "ready", unitPrice: 2.5, subtotal: 1250, buyerFee: 62.5, totalBeforeShippingAndTax: 1312.5, partialMarkupPercent: 25 });
  });
  it("does not mark up a full-lot purchase", () => {
    expect(getPurchaseQuantityPreview({ ...lot, purchaseTerms: { ...lot.purchaseTerms, partialQuantityMarkupPercent: 25 } }, 1200)).toMatchObject({ status: "ready", unitPrice: 2, totalBeforeShippingAndTax: 2520, partialMarkupPercent: 0 });
  });
  it("preserves decimal box quantities and cents rounding", () => {
    expect(getPurchaseQuantityPreview({ ...lot, buyNowPrice: 1.99, moq: 1, purchaseTerms: { ...lot.purchaseTerms, sqFtPerBox: 21.43, partialQuantityMarkupPercent: 20 } }, 64)).toMatchObject({ status: "ready", quantitySqFt: 64.29, unitPrice: 2.39, subtotal: 153.65, buyerFee: 7.68, totalBeforeShippingAndTax: 161.33 });
  });
  it("does not add a carton because of binary rounding", () => {
    expect(getPurchaseQuantityPreview({ ...lot, moq: 0, purchaseTerms: { ...lot.purchaseTerms, sqFtPerBox: 0.1 } }, 0.1 + 0.2)).toMatchObject({ status: "ready", quantitySqFt: 0.3 });
  });
  it.each([{ requested: 1300 }, { requested: 500, moq: 1300 }, { requested: 501, totalSqFt: 510 }])("does not quote an impossible order %j", change => {
    expect(getPurchaseQuantityPreview({ ...lot, ...change }, change.requested)).toMatchObject({ status: "unavailable" });
  });
  it("requires correction for a full lot that cannot satisfy carton rules", () => {
    expect(getPurchaseQuantityPreview({ ...lot, totalSqFt: 1010, purchaseTerms: { ...lot.purchaseTerms, fullLotOnly: true } }, 500)).toMatchObject({ status: "needs_details" });
  });
  it("does not assume omitted cached purchase terms", () => {
    expect(getPurchaseQuantityPreview({ ...lot, purchaseTerms: undefined }, 500)).toMatchObject({ status: "needs_details" });
  });
  it.each([NaN, Infinity, 0, -1, undefined])("ignores invalid/absent job quantity %s", requested => {
    expect(getPurchaseQuantityPreview(lot, requested)).toBeNull();
  });
  it.each([NaN, 0, -1])("does not invent a valid price from %s", buyNowPrice => {
    const preview = getPurchaseQuantityPreview({ ...lot, buyNowPrice }, 500);
    expect(preview).toMatchObject({ status: "needs_details" });
    expect(preview).not.toHaveProperty("totalBeforeShippingAndTax");
  });
  it("does not fabricate an unknown minimum unit", () => {
    expect(getPurchaseQuantityPreview({ ...lot, moqUnit: null }, 500)).toMatchObject({ status: "needs_details" });
  });
  it("does not substitute a lower box quantity for an exact minimum", () => {
    expect(getPurchaseQuantityPreview({ ...lot, moq: 500.005 }, 400)).toMatchObject({ status: "ready", quantitySqFt: 520 });
  });
  it("uses current persisted prices without advancing a markdown schedule", () => {
    expect(getPurchaseQuantityPreview({ ...lot, buyNowPrice: 1.8 }, 500)).toMatchObject({ status: "ready", unitPrice: 1.8, totalBeforeShippingAndTax: 945 });
  });
  it("falls back to the current ask only when buy-now price is absent", () => {
    expect(getPurchaseQuantityPreview({ ...lot, buyNowPrice: null }, 500)).toMatchObject({ status: "ready", unitPrice: 3, totalBeforeShippingAndTax: 1575 });
  });
  it("does not impose whole-pallet increments above a pallet minimum", () => {
    expect(getPurchaseQuantityPreview({ ...lot, totalSqFt: 1800, moq: 1, moqUnit: "pallets" }, 700)).toMatchObject({ status: "ready", quantitySqFt: 700 });
  });
  it("permits an area-based order without carton data where current checkout does", () => {
    expect(getPurchaseQuantityPreview({ ...lot, purchaseTerms: { ...lot.purchaseTerms, sqFtPerBox: null } }, 501)).toMatchObject({ status: "ready", quantitySqFt: 501, totalBeforeShippingAndTax: 1052.1 });
  });
});
