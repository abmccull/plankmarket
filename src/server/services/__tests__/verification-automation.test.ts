import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assessVerificationAutoApproval,
  getJevVerificationSignals,
  isVerificationAutoApprovalEnabled,
} from "@/server/services/verification-automation";

const documentReference = "verification-document:11111111-1111-4111-8111-111111111111";
const clearSignals = {
  model: "jev-1.13.0",
  domainFit: 0.99,
  issuerFit: 0.99,
  concern: 0.01,
};
const clearResult = {
  score: 98,
  approved: true,
  reasoning: "Fields appear consistent.",
  documentAttached: true,
  checks: {
    einFormat: { pass: true, note: "Formatted" },
    websiteAnalysis: { pass: true, note: "Plausible" },
    documentAnalysis: { pass: true, note: "Visible" },
    crossReference: { pass: true, note: "Consistent" },
    redFlags: { found: false, note: "None" },
  },
  documentEvidence: {
    documentType: "business_license" as const,
    businessName: "Acme Flooring LLC",
    einLast4: "6789",
    state: "CO",
    issuer: "Colorado Secretary of State",
    expiresAt: "2027-12-31",
    legible: true,
    possibleTampering: false,
  },
};

function submission(overrides: Record<string, unknown> = {}) {
  return {
    role: "buyer",
    businessName: "Acme Flooring LLC",
    einTaxId: "12-3456789",
    businessState: "CO",
    businessWebsite: "https://www.acmeflooring.com",
    email: "ops@acmeflooring.com",
    emailConfirmed: true,
    documentReference,
    result: clearResult,
    jev: clearSignals,
    now: new Date("2026-09-23T00:00:00Z"),
    enabled: true,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("document-based verification approval policy", () => {
  it.each(["buyer", "seller"])("can approve a %s only with every gate met", (role) => {
    expect(assessVerificationAutoApproval(submission({ role }))).toEqual({
      decision: "auto_approve",
      reasons: [],
    });
  });

  it("keeps unreadable, absent, mismatched, or expired evidence for manual review", () => {
    const cases = [
      submission({ result: { ...clearResult, documentAttached: false } }),
      submission({ documentReference: "https://example.com/claim.pdf" }),
      submission({ result: { ...clearResult, documentEvidence: { ...clearResult.documentEvidence, businessName: "Other Company" } } }),
      submission({ result: { ...clearResult, documentEvidence: { ...clearResult.documentEvidence, einLast4: "0000" } } }),
      submission({ result: { ...clearResult, documentEvidence: { ...clearResult.documentEvidence, expiresAt: "2025-01-01" } } }),
      submission({ result: { ...clearResult, documentEvidence: { ...clearResult.documentEvidence, possibleTampering: true } } }),
    ];
    for (const candidate of cases) {
      expect(assessVerificationAutoApproval(candidate).decision).toBe("manual_review");
    }
  });

  it("escalates domain, email confirmation, advisory, and Jev doubts", () => {
    const cases = [
      submission({ emailConfirmed: false }),
      submission({ email: "ops@gmail.com" }),
      submission({ result: { ...clearResult, score: 92, approved: true } }),
      submission({ jev: { ...clearSignals, concern: 0.2 } }),
      submission({ jev: null }),
    ];
    for (const candidate of cases) {
      expect(assessVerificationAutoApproval(candidate).decision).toBe("manual_review");
    }
  });

  it("defaults to manual review until egress and evaluation references are configured", () => {
    vi.stubEnv("VERIFICATION_AUTO_APPROVAL_ENABLED", "true");
    vi.stubEnv("TYPESAFE_VERIFICATION_ENABLED", "true");
    vi.stubEnv("ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS", "true");
    vi.stubEnv("VERIFICATION_DOCUMENT_EGRESS_APPROVAL_REFERENCE", "privacy-review");
    vi.stubEnv("VERIFICATION_AUTO_APPROVAL_EVALUATION_REFERENCE", "");
    expect(isVerificationAutoApprovalEnabled()).toBe(false);
    expect(assessVerificationAutoApproval(submission({ enabled: false })).reasons).toContain("automation_disabled");
    vi.stubEnv("VERIFICATION_AUTO_APPROVAL_EVALUATION_REFERENCE", "labeled-evaluation");
    expect(isVerificationAutoApprovalEnabled()).toBe(true);
  });
});

describe("Jev verification signals", () => {
  it("sends only a bounded business summary and parses typed answers", async () => {
    vi.stubEnv("TYPESAFE_VERIFICATION_ENABLED", "true");
    vi.stubEnv("VERIFICATION_DOCUMENT_EGRESS_APPROVAL_REFERENCE", "privacy-review");
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "jev-1.13.0",
        answers: {
          domainFit: { type: "noul", noul: 0.99 },
          issuerFit: { type: "noul", noul: 0.98 },
          concern: { type: "noul", noul: 0.02 },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await getJevVerificationSignals({
      businessName: "Acme Flooring LLC",
      websiteDomain: "acmeflooring.com",
      documentType: "business_license",
      issuer: "Colorado Secretary of State",
    })).toMatchObject({ domainFit: 0.99, issuerFit: 0.98, concern: 0.02 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe("jev-1.13.0");
    expect(JSON.stringify(body)).not.toContain("12-3456789");
    expect(JSON.stringify(body)).not.toContain("ops@acmeflooring.com");
    expect(JSON.stringify(body)).not.toContain("verification-document:");
  });

  it("returns no signal on malformed provider output", async () => {
    vi.stubEnv("TYPESAFE_VERIFICATION_ENABLED", "true");
    vi.stubEnv("VERIFICATION_DOCUMENT_EGRESS_APPROVAL_REFERENCE", "privacy-review");
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answers: {} }) }));
    expect(await getJevVerificationSignals({
      businessName: "Acme Flooring LLC",
      websiteDomain: "acmeflooring.com",
      documentType: "business_license",
      issuer: "Colorado Secretary of State",
    })).toBeNull();
  });
});
