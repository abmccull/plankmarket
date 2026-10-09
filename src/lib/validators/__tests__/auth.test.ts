// src/lib/validators/__tests__/auth.test.ts
import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  saveVerificationDraftSchema,
  submitVerificationSchema,
  getVerificationSubmissionSchema,
  updateProfileSchema,
} from "@/lib/validators/auth";

// ---------------------------------------------------------------------------
// registerSchema
// ---------------------------------------------------------------------------
describe("registerSchema", () => {
  const validInput = {
    email: "jane@example.com",
    password: "secureP@ss1",
    name: "Jane Doe",
    role: "buyer" as const,
    businessName: "Doe Lumber Co",
    zipCode: "97201",
  };

  it("accepts valid input", () => {
    const result = registerSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects missing email", () => {
    const result = registerSchema.safeParse({ ...validInput, email: undefined });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({
      ...validInput,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const emailError = result.error.issues.find((i) =>
        i.path.includes("email"),
      );
      expect(emailError).toBeDefined();
    }
  });

  it("rejects password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const pwError = result.error.issues.find((i) =>
        i.path.includes("password"),
      );
      expect(pwError).toBeDefined();
    }
  });

  it("rejects password longer than 72 characters", () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: "a".repeat(73),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const pwError = result.error.issues.find((i) =>
        i.path.includes("password"),
      );
      expect(pwError).toBeDefined();
    }
  });

  it("rejects invalid zip code", () => {
    const result = registerSchema.safeParse({
      ...validInput,
      zipCode: "9720",
    });
    expect(result.success).toBe(false);

    const resultAlpha = registerSchema.safeParse({
      ...validInput,
      zipCode: "abcde",
    });
    expect(resultAlpha.success).toBe(false);
  });

  it("accepts valid US phone and rejects invalid phone", () => {
    const validPhone = registerSchema.safeParse({
      ...validInput,
      phone: "+12025551234",
    });
    expect(validPhone.success).toBe(true);

    const invalidPhone = registerSchema.safeParse({
      ...validInput,
      phone: "12345",
    });
    expect(invalidPhone.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loginSchema
// ---------------------------------------------------------------------------
describe("loginSchema", () => {
  it("accepts valid input", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "any-password",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing password", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// submitVerificationSchema
// ---------------------------------------------------------------------------
describe("submitVerificationSchema", () => {
  const validInput = {
    einTaxId: "12-3456789",
    verificationDocUrl: "https://storage.example.com/docs/ein-letter.pdf",
    businessAddress: "123 Mill Rd",
    businessCity: "Portland",
    businessState: "OR",
    businessZip: "97201",
  };

  it("accepts valid input", () => {
    const result = submitVerificationSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts conventional EIN entry and rejects malformed values", () => {
    const missingDash = submitVerificationSchema.safeParse({
      ...validInput,
      einTaxId: "123456789",
    });
    expect(missingDash.success).toBe(true);
    if (missingDash.success) expect(missingDash.data.einTaxId).toBe("12-3456789");

    const tooFewDigits = submitVerificationSchema.safeParse({
      ...validInput,
      einTaxId: "12-345678",
    });
    expect(tooFewDigits.success).toBe(false);

    const letters = submitVerificationSchema.safeParse({
      ...validInput,
      einTaxId: "AB-CDEFGHI",
    });
    expect(letters.success).toBe(false);
  });

  it("normalizes a business domain while rejecting malformed or non-web URLs", () => {
    const result = submitVerificationSchema.safeParse({ ...validInput, businessWebsite: " example.com " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.businessWebsite).toBe("https://example.com");
    for (const businessWebsite of ["not a website", "javascript:alert(1)", "ftp://example.com", "https://"]) {
      expect(submitVerificationSchema.safeParse({ ...validInput, businessWebsite }).success).toBe(false);
    }
  });

  it("requires the seller website at its field while keeping it optional for buyers", () => {
    const seller = getVerificationSubmissionSchema("seller").safeParse({ ...validInput, businessWebsite: " " });
    expect(seller.success).toBe(false);
    if (!seller.success) expect(seller.error.issues[0]?.path).toEqual(["businessWebsite"]);
    expect(getVerificationSubmissionSchema("buyer").safeParse({ ...validInput, businessWebsite: "" }).success).toBe(true);
    expect(getVerificationSubmissionSchema("seller").safeParse({ ...validInput, businessWebsite: "example.com" }).success).toBe(true);
  });
});

describe("saveVerificationDraftSchema", () => {
  it("accepts an incomplete step so users can resume later", () => {
    const result = saveVerificationDraftSchema.safeParse({
      expectedOwnerId: "11111111-1111-4111-8111-111111111111", expectedUpdatedAt: null, currentStep: 2,
      einTaxId: "12-",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid steps and oversized sensitive input", () => {
    expect(
      saveVerificationDraftSchema.safeParse({ expectedOwnerId: "11111111-1111-4111-8111-111111111111", expectedUpdatedAt: null, currentStep: 4 }).success,
    ).toBe(false);
    expect(
      saveVerificationDraftSchema.safeParse({
        expectedOwnerId: "11111111-1111-4111-8111-111111111111", expectedUpdatedAt: null, currentStep: 2,
        einTaxId: "1".repeat(12),
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateProfileSchema
// ---------------------------------------------------------------------------
describe("updateProfileSchema", () => {
  it("accepts a partial update with only name", () => {
    const result = updateProfileSchema.safeParse({
      name: "Updated Name",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Updated Name");
    }
  });
});
