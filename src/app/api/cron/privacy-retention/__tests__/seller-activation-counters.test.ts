/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ runPrivacyRetentionSweep: vi.fn() }));
vi.mock("@/env", () => ({ env: { CRON_SECRET: "0123456789abcdef0123456789abcdef" } }));
vi.mock("@/server/services/privacy-retention", () => ({ runPrivacyRetentionSweep: mocks.runPrivacyRetentionSweep }));
const { GET } = await import("@/app/api/cron/privacy-retention/route");
describe("seller activation retention is operationally visible", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it.each(["sellerActivationProviderDeletionFailed", "sellerActivationProviderRetentionBlocked"])("returns 409 when only %s remains due", async counter => {
    const result = {
      verificationDraftsDeleted: 0, verificationDraftProviderDeletionFailed: 0,
      verificationDraftProviderRetentionBlocked: 0, verificationEvidencePurged: 0,
      verificationProviderDeletionFailed: 0, verificationProviderRetentionBlocked: 0,
      sampleRequestsPurged: 0, shippingAddressesDeleted: 0, sellerActivationsExpired: 1,
      sellerActivationEvidencePurged: 0, sellerActivationProviderDeletionFailed: 0,
      sellerActivationProviderRetentionBlocked: 0, [counter]: 1,
    };
    mocks.runPrivacyRetentionSweep.mockResolvedValue(result);
    const response = await GET(new NextRequest("http://127.0.0.1/api/cron/privacy-retention", { headers: { authorization: "Bearer 0123456789abcdef0123456789abcdef" } }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Privacy retention sweep incomplete", result });
  });
});
