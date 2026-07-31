import { describe, expect, it } from "vitest";
import {
  mergeVerificationDraftFields,
  parseVerificationDraftSubmission,
  type StoredVerificationDraftFields,
} from "../verification-draft";

const saved: StoredVerificationDraftFields = {
  businessWebsite: "https://example.com",
  einTaxId: "12-3456789",
  verificationDocUrl: "https://utfs.io/f/example-document",
  businessAddress: "123 Mill Road",
  businessCity: "Portland",
  businessState: "OR",
  businessZip: "97201",
};

describe("verification draft", () => {
  it("preserves fields from other steps during a partial save", () => {
    const merged = mergeVerificationDraftFields(saved, {
      currentStep: 2,
      businessAddress: " 456 Oak Avenue ",
    });

    expect(merged).toEqual({
      ...saved,
      businessAddress: "456 Oak Avenue",
    });
  });

  it("normalizes state and lets an explicit blank clear a draft field", () => {
    const merged = mergeVerificationDraftFields(saved, {
      currentStep: 1,
      businessState: "wa",
      businessWebsite: "   ",
    });

    expect(merged.businessState).toBe("WA");
    expect(merged.businessWebsite).toBeNull();
  });

  it("accepts a complete saved draft at the final submission gate", () => {
    expect(parseVerificationDraftSubmission(saved).success).toBe(true);
  });

  it("rejects an incomplete saved draft at the final submission gate", () => {
    expect(
      parseVerificationDraftSubmission({ ...saved, einTaxId: null }).success,
    ).toBe(false);
  });
});
