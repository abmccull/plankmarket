// Written before product implementation; failure modes are in the product-reuse contract.
import { describe, expect, it } from "vitest";
import { getReusableProductDetails, replaceProductDetails } from "@/lib/marketplace/reusable-listing-product";

const product = { materialType: "engineered", species: "White oak", finish: "matte", grade: "select", color: "Natural", colorFamily: "brown", thickness: 0.5, width: 7, length: 72, wearLayer: 3, brand: "Test Mill", modelNumber: "OAK-7", sqFtPerBox: 28, installationMethod: "glue_down", waterResistance: "not_waterproof", certifications: ["fsc"] };

describe("reviewed product reuse", () => {
  it("returns product specifications only, without prior lot commitments or reviewed provenance", () => {
    const source = { ...product, title: "Old damaged lot", description: "Previous batch", condition: "slight_damage", reasonCode: "customer_return", lotNumber: "OLD", packagingType: "open_cartons", totalSqFt: 1234, askPricePerSqFt: 4, buyNowPrice: 3, floorPrice: 2, boxesPerPallet: 50, palletWeight: 2000, warehouseId: "private", mediaIds: ["photo"], specificationProvenance: "evidence_reviewed", specificationEvidenceId: "evidence", lastConfirmedAt: new Date(), automaticMarkdownEnabled: true };
    expect(getReusableProductDetails(source)).toEqual({ product, omittedFields: [] });
  });
  it("clears old product details missing from the selected product and preserves current lot edits", () => {
    const draft = { ...product, title: "New lot title", description: "Current lot", totalSqFt: 600, condition: "new_overstock" as const, askPricePerSqFt: 2.5, mediaIds: ["current-photo"], boxesPerPallet: 42, packagingType: "sealed_cartons" as const, warehouseId: "current-warehouse" };
    const next = replaceProductDetails(draft, { materialType: "vinyl_lvp", brand: "Different Mill" });
    expect(next).toMatchObject({ title: draft.title, description: draft.description, totalSqFt: 600, condition: "new_overstock", askPricePerSqFt: 2.5, mediaIds: ["current-photo"], boxesPerPallet: 42, packagingType: "sealed_cartons", warehouseId: "current-warehouse", materialType: "vinyl_lvp", brand: "Different Mill", certifications: [] });
    for (const field of ["species", "finish", "grade", "color", "colorFamily", "thickness", "width", "length", "wearLayer", "modelNumber", "sqFtPerBox", "installationMethod", "waterResistance"]) expect(next[field as keyof typeof next]).toBeUndefined();
    expect(draft.species).toBe("White oak");
  });
  it("does not use extra fields in an untrusted product response", () => {
    const next = replaceProductDetails({ title: "Keep current", totalSqFt: 500 }, { ...product, totalSqFt: 9000, title: "Overwrite", mediaIds: ["foreign"] });
    expect(next.title).toBe("Keep current"); expect(next.totalSqFt).toBe(500); expect(next.mediaIds).toBeUndefined();
  });
  it("does not turn nulls into numbers or preserve invalid legacy enum and dimensions", () => {
    const result = getReusableProductDetails({ ...product, finish: "unrecognized", width: -2, thickness: null, length: Infinity, sqFtPerBox: 0, certifications: null });
    expect(result.product).toMatchObject({ materialType: "engineered", certifications: [] });
    for (const field of ["finish", "width", "thickness", "length", "sqFtPerBox"]) expect(result.product[field as keyof typeof result.product]).toBeUndefined();
    expect(result.omittedFields.sort()).toEqual(["finish", "length", "sqFtPerBox", "width"].sort());
  });
  it("does not infer missing material or water resistance", () => {
    expect(getReusableProductDetails({ brand: "Test Mill" })).toEqual({ product: { brand: "Test Mill", certifications: [] }, omittedFields: [] });
  });
  it("copies arrays independently", () => {
    const result = getReusableProductDetails(product); result.product.certifications!.push("floorscore");
    expect(product.certifications).toEqual(["fsc"]);
  });
  it("does not reinterpret an unmatched historical wear-layer unit", () => {
    const result = getReusableProductDetails({ ...product, materialType: "vinyl_lvp", wearLayer: 22 });
    expect(result.product.wearLayer).toBeUndefined(); expect(result.omittedFields).toContain("wearLayer");
  });
  it("canonicalizes database float noise only for matching form presets", () => {
    const result = getReusableProductDetails({ ...product, materialType: "vinyl_lvp", thickness: 0.4699999988, width: 7.5, wearLayer: 0.3000000119 });
    expect(result.product).toMatchObject({ thickness: 0.47, width: 7.5, wearLayer: 0.3 });
  });
});
