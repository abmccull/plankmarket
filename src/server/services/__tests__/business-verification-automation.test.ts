import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditEvents, notifications } from "@/server/db/schema";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  transaction: vi.fn(),
  verifyBusiness: vi.fn(),
  getUserById: vi.fn(),
  sendApproved: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: { query: { users: { findFirst: mocks.findUser } }, transaction: mocks.transaction },
}));
vi.mock("@/server/services/ai-verification", () => ({ verifyBusiness: mocks.verifyBusiness }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({ auth: { admin: { getUserById: mocks.getUserById } } }),
}));
vi.mock("@/lib/email/send", () => ({ sendVerificationApprovedEmail: mocks.sendApproved }));

const { processBusinessVerification } = await import("@/server/services/business-verification");

const userId = "11111111-1111-4111-8111-111111111111";
const submissionId = "22222222-2222-4222-8222-222222222222";
const user = {
  id: userId,
  authId: "auth-user-1",
  role: "seller",
  active: true,
  name: "Alex Owner",
  email: "ops@acmeflooring.com",
  businessName: "Acme Flooring LLC",
  einTaxId: "12-3456789",
  businessWebsite: "https://acmeflooring.com",
  businessAddress: "123 Main St",
  businessState: "CO",
  verificationDocUrl: "verification-document:33333333-3333-4333-8333-333333333333",
  verificationNotes: null,
};
const positiveResult = {
  score: 98,
  approved: true,
  reasoning: "Evidence appears consistent.",
  documentAttached: true,
  checks: {
    einFormat: { pass: true, note: "Formatted" },
    websiteAnalysis: { pass: true, note: "Plausible" },
    documentAnalysis: { pass: true, note: "Legible" },
    crossReference: { pass: true, note: "Consistent" },
    redFlags: { found: false, note: "None" },
  },
  documentEvidence: {
    documentType: "business_license",
    businessName: "Acme Flooring LLC",
    einLast4: "6789",
    state: "CO",
    issuer: "Colorado Secretary of State",
    expiresAt: "2027-12-31",
    legible: true,
    possibleTampering: false,
  },
};

function transactionStub(wins = true) {
  const set = vi.fn();
  const returning = vi.fn().mockResolvedValue(wins ? [{ id: userId }] : []);
  const where = vi.fn(() => ({ returning }));
  set.mockImplementation(() => ({ where }));
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  const tx = {
    update: vi.fn(() => ({ set })),
    insert,
    query: { users: { findMany: vi.fn().mockResolvedValue([{ id: "admin-1" }]) } },
  };
  mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
  return { tx, set, where, returning, insert, values };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TYPESAFE_VERIFICATION_ENABLED", "true");
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  vi.stubEnv("ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS", "true");
  vi.stubEnv("VERIFICATION_AUTO_APPROVAL_ENABLED", "true");
  vi.stubEnv("VERIFICATION_DOCUMENT_EGRESS_APPROVAL_REFERENCE", "privacy-review");
  vi.stubEnv("VERIFICATION_AUTO_APPROVAL_EVALUATION_REFERENCE", "labeled-evaluation");
  mocks.findUser.mockResolvedValue(user);
  mocks.verifyBusiness.mockResolvedValue(positiveResult);
  mocks.getUserById.mockResolvedValue({
    data: { user: { email_confirmed_at: "2026-01-01", email: user.email } },
    error: null,
  });
  mocks.sendApproved.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      model: "jev-1.13.0",
      answers: {
        domainFit: { type: "noul", noul: 0.99 },
        issuerFit: { type: "noul", noul: 0.99 },
        concern: { type: "noul", noul: 0.01 },
      },
    }),
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("verification workflow decisions", () => {
  it("commits one approval with an audit event and a user notification", async () => {
    mocks.verifyBusiness.mockResolvedValueOnce({
      ...positiveResult,
      reasoning: "Document says 12-3456789 and names Alex Owner",
      checks: {
        ...positiveResult.checks,
        documentAnalysis: { pass: true, note: "Full EIN 12-3456789" },
      },
    });
    const { set, insert, values } = transactionStub();
    const result = await processBusinessVerification({ userId, submissionId });
    expect(result.state).toBe("auto_approved");
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      verificationStatus: "verified",
      verified: true,
    }));
    const persisted = set.mock.calls[0][0];
    expect(persisted.aiVerificationNotes).not.toContain("einLast4");
    expect(persisted.aiVerificationNotes).not.toContain("Colorado Secretary of State");
    expect(persisted.aiVerificationNotes).not.toContain("12-3456789");
    expect(persisted.aiVerificationNotes).not.toContain("Alex Owner");
    expect(insert).toHaveBeenCalledWith(auditEvents);
    expect(insert).toHaveBeenCalledWith(notifications);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      action: "verification.auto_approved",
      idempotencyKey: `verification-triage:${submissionId}`,
    }));
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      title: "Account Verified",
    }));
    expect(mocks.sendApproved).toHaveBeenCalledTimes(1);
  });

  it("leaves an unclear document pending and alerts admins", async () => {
    mocks.verifyBusiness.mockResolvedValue({ ...positiveResult, documentAttached: false });
    const { set, values } = transactionStub();
    const result = await processBusinessVerification({ userId, submissionId });
    expect(result.state).toBe("pending_review");
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      verificationStatus: "pending",
      verified: false,
    }));
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      action: "verification.manual_review_flagged",
    }));
    expect(values).toHaveBeenCalledWith([expect.objectContaining({
      title: "Verification Ready for Review",
    })]);
    expect(mocks.sendApproved).not.toHaveBeenCalled();
  });

  it("does not create side effects when an admin or retry won the submission race", async () => {
    const { insert } = transactionStub(false);
    const result = await processBusinessVerification({ userId, submissionId });
    expect(result.state).toBe("stale_or_processed");
    expect(insert).not.toHaveBeenCalled();
    expect(mocks.sendApproved).not.toHaveBeenCalled();
  });
});
