import { describe, expect, it } from "vitest";
import { z } from "zod";
import { hasReviewedWaterproofSpecification, productSpecificationFields, sellerSpecificationProvenance, specificationReviewInvalidated } from "../product-specifications";

describe("product specification evidence", () => {
  it("never treats wear layer or seller claims as waterproof evidence", () => {
    expect(hasReviewedWaterproofSpecification({})).toBe(false);
    expect(hasReviewedWaterproofSpecification({ waterResistance: "waterproof", specificationProvenance: "seller_declared" })).toBe(false);
    expect(hasReviewedWaterproofSpecification({ waterResistance: "water_resistant", specificationProvenance: "evidence_reviewed", specificationReviewedAt: new Date(), specificationEvidenceId: "image" })).toBe(false);
    expect(hasReviewedWaterproofSpecification({ waterResistance: "waterproof", specificationProvenance: "evidence_reviewed", specificationReviewedAt: new Date(), specificationEvidenceId: "image" })).toBe(true);
  });
  it("does not allow sellers to submit a reviewed status", () => {
    const parsed = z.object(productSpecificationFields).parse({ waterResistance: "waterproof", specificationProvenance: "evidence_reviewed" });
    expect(parsed).not.toHaveProperty("specificationProvenance");
    expect(sellerSpecificationProvenance(parsed)).toBe("seller_declared");
    expect(sellerSpecificationProvenance({})).toBe("unknown");
  });
  it("invalidates review on spec changes while preserving unrelated edits", () => {
    const previous = { waterResistance: "waterproof", lotNumber: "A", title: "old" };
    expect(specificationReviewInvalidated(previous, { lotNumber: "B" })).toBe(true);
    expect(specificationReviewInvalidated(previous, { waterResistance: "unknown" })).toBe(true);
    expect(specificationReviewInvalidated(previous, { title: "new", lotNumber: "A" })).toBe(false);
  });
  it("keeps unknown carton counts absent and rejects invalid packaging", () => {
    expect(z.object(productSpecificationFields).parse({})).toEqual({});
    expect(z.object(productSpecificationFields).safeParse({ packagingType: "invented" }).success).toBe(false);
  });
});
