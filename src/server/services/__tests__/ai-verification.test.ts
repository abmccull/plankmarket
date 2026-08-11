import { afterEach, describe, expect, it } from "vitest";
process.env.SKIP_ENV_VALIDATION = "1";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= "pk_test_123";

const {
  buildVerificationPromptText,
  buildVerificationReviewInput,
  isVerificationDocumentEgressEnabled,
} = await import("@/server/services/ai-verification");

describe("AI verification privacy minimization", () => {
  const originalEgressFlag =
    process.env.ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS;

  afterEach(() => {
    if (originalEgressFlag === undefined) {
      delete process.env.ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS;
    } else {
      process.env.ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS =
        originalEgressFlag;
    }
  });

  it("builds a minimized prompt without full EIN, contact email, name, address, or document URL", () => {
    delete process.env.ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS;

    const reviewInput = buildVerificationReviewInput({
      businessName: "Acme Flooring Supply",
      einTaxId: "12-3456789",
      businessWebsite: "https://www.acmeflooring.com/about?owner=jane",
      businessLicenseUrl: "https://utfs.io/f/verification-doc",
      role: "seller",
      name: "Jane Owner",
      email: "jane.owner@gmail.com",
      businessAddress: "123 Main Street, Denver, CO 80202",
    });

    const prompt = buildVerificationPromptText(reviewInput);

    expect(reviewInput).toMatchObject({
      einFormatPass: true,
      einLast4: "6789",
      businessWebsiteDomain: "acmeflooring.com",
      contactEmailDomain: "gmail.com",
      usesGenericEmailDomain: true,
      businessLicenseSubmitted: true,
      documentEgressEnabled: false,
    });
    expect(prompt).toContain("EIN Last 4: 6789");
    expect(prompt).toContain("Contact Email Domain: gmail.com");
    expect(prompt).toContain(
      "document egress is disabled for privacy",
    );
    expect(prompt).not.toContain("12-3456789");
    expect(prompt).not.toContain("jane.owner@gmail.com");
    expect(prompt).not.toContain("Jane Owner");
    expect(prompt).not.toContain("123 Main Street");
    expect(prompt).not.toContain("https://utfs.io/f/verification-doc");
    expect(prompt).not.toContain("/about?owner=jane");
  });

  it("enables document egress only when explicitly configured", () => {
    expect(isVerificationDocumentEgressEnabled()).toBe(false);

    process.env.ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS = "true";

    expect(isVerificationDocumentEgressEnabled()).toBe(true);
    expect(
      buildVerificationReviewInput({
        businessName: "Acme Flooring Supply",
        einTaxId: "12-3456789",
        businessWebsite: null,
        businessLicenseUrl: "https://utfs.io/f/verification-doc",
        role: "seller",
        name: null,
        email: "operations@acmeflooring.com",
        businessAddress: null,
      }).documentEgressEnabled,
    ).toBe(true);
  });
});
