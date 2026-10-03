import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= "pk_test_123";

const mocks = vi.hoisted(() => ({
  createMessage: vi.fn(),
  readDocument: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mocks.createMessage };
  },
}));
vi.mock("@/server/services/verification-documents", () => ({
  readPrivateVerificationDocument: mocks.readDocument,
}));

const { verifyBusiness } = await import("@/server/services/ai-verification");
const userId = "11111111-1111-4111-8111-111111111111";
const reference = "verification-document:22222222-2222-4222-8222-222222222222";
const params = {
  userId,
  businessName: "Acme Flooring LLC",
  einTaxId: "12-3456789",
  businessWebsite: "https://acmeflooring.com",
  businessLicenseUrl: reference,
  role: "seller",
  name: "Alex Owner",
  email: "ops@acmeflooring.com",
  businessState: "CO",
};
const documentEvidence = {
  documentType: "business_license",
  businessName: "Acme Flooring LLC",
  einLast4: "6789",
  state: "CO",
  issuer: "Colorado Secretary of State",
  expiresAt: "2027-12-31",
  legible: true,
  possibleTampering: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
  vi.stubEnv("ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS", "true");
  vi.stubEnv("VERIFICATION_DOCUMENT_EGRESS_APPROVAL_REFERENCE", "privacy-review");
  mocks.readDocument.mockResolvedValue({
    row: { userId, purpose: "business_verification", mimeType: "application/pdf" },
    data: new Blob([new Uint8Array([37, 80, 68, 70, 45, 49])], { type: "application/pdf" }),
  });
  mocks.createMessage.mockResolvedValue({
    content: [{
      type: "text",
      text: JSON.stringify({
        score: 98,
        approved: true,
        reasoning: "Submitted fields appear consistent.",
        checks: {
          einFormat: { pass: true, note: "Formatted" },
          websiteAnalysis: { pass: true, note: "Plausible" },
          documentAnalysis: { pass: true, note: "Visible" },
          crossReference: { pass: true, note: "Consistent" },
          redFlags: { found: false, note: "None" },
        },
      }),
    }],
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("private document inspection", () => {
  it("attaches an owned PDF as a document block", async () => {
    mocks.createMessage.mockResolvedValueOnce({ content: [{
      type: "text", text: JSON.stringify(documentEvidence),
    }] });
    const result = await verifyBusiness(params);
    expect(result.documentAttached).toBe(true);
    expect(result.documentEvidence).toEqual(documentEvidence);
    const extractionRequest = mocks.createMessage.mock.calls[0][0];
    expect(extractionRequest.messages[0].content[0]).toMatchObject({
      type: "document",
      source: { type: "base64", media_type: "application/pdf" },
    });
    expect(JSON.stringify(extractionRequest)).not.toContain("Acme Flooring LLC");
    expect(JSON.stringify(extractionRequest)).not.toContain("6789");
  });

  it("does not attach another account's document", async () => {
    mocks.readDocument.mockResolvedValueOnce({
      row: { userId: "another-user", purpose: "business_verification", mimeType: "application/pdf" },
      data: new Blob([new Uint8Array([37, 80, 68, 70, 45])]),
    });
    const result = await verifyBusiness(params);
    expect(result.documentAttached).toBe(false);
    expect(mocks.createMessage.mock.calls[0][0].messages[0].content).toHaveLength(1);
  });

  it("attaches an owned PNG for extraction", async () => {
    mocks.readDocument.mockResolvedValueOnce({
      row: { userId, purpose: "business_verification", mimeType: "image/png" },
      data: new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
    });
    mocks.createMessage.mockResolvedValueOnce({ content: [{
      type: "text", text: JSON.stringify(documentEvidence),
    }] });
    const result = await verifyBusiness(params);
    expect(result.documentAttached).toBe(true);
    expect(mocks.createMessage.mock.calls[0][0].messages[0].content[0]).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/png" },
    });
  });

  it("keeps documents local when egress is disabled", async () => {
    vi.stubEnv("ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS", "false");
    const result = await verifyBusiness(params);
    expect(result.documentAttached).toBe(false);
    expect(mocks.readDocument).not.toHaveBeenCalled();
    expect(mocks.createMessage.mock.calls[0][0].messages[0].content).toHaveLength(1);
  });
});
