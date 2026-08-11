/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  runPrivacyRetentionSweep: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    CRON_SECRET: "0123456789abcdef0123456789abcdef",
  },
}));

vi.mock("@/server/services/privacy-retention", () => ({
  runPrivacyRetentionSweep: mocks.runPrivacyRetentionSweep,
}));

const { GET } = await import("../route");

describe("GET /api/cron/privacy-retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthorized requests", async () => {
    const response = await GET(
      new NextRequest("https://www.plankmarket.com/api/cron/privacy-retention"),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(mocks.runPrivacyRetentionSweep).not.toHaveBeenCalled();
  });

  it("returns conflict when provider-backed records remain due", async () => {
    mocks.runPrivacyRetentionSweep.mockResolvedValue({
      verificationDraftsDeleted: 1,
      verificationDraftProviderDeletionFailed: 0,
      verificationDraftProviderRetentionBlocked: 1,
      verificationEvidencePurged: 2,
      verificationProviderDeletionFailed: 0,
      verificationProviderRetentionBlocked: 0,
      sampleRequestsPurged: 3,
      shippingAddressesDeleted: 4,
    });

    const response = await GET(
      new NextRequest("https://www.plankmarket.com/api/cron/privacy-retention", {
        headers: {
          authorization:
            "Bearer 0123456789abcdef0123456789abcdef",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: "Privacy retention sweep incomplete",
      result: {
        verificationDraftsDeleted: 1,
        verificationDraftProviderDeletionFailed: 0,
        verificationDraftProviderRetentionBlocked: 1,
        verificationEvidencePurged: 2,
        verificationProviderDeletionFailed: 0,
        verificationProviderRetentionBlocked: 0,
        sampleRequestsPurged: 3,
        shippingAddressesDeleted: 4,
      },
    });
  });

  it("returns success when retention finishes cleanly", async () => {
    mocks.runPrivacyRetentionSweep.mockResolvedValue({
      verificationDraftsDeleted: 1,
      verificationDraftProviderDeletionFailed: 0,
      verificationDraftProviderRetentionBlocked: 0,
      verificationEvidencePurged: 2,
      verificationProviderDeletionFailed: 0,
      verificationProviderRetentionBlocked: 0,
      sampleRequestsPurged: 3,
      shippingAddressesDeleted: 4,
    });

    const response = await GET(
      new NextRequest("https://www.plankmarket.com/api/cron/privacy-retention", {
        headers: {
          authorization:
            "Bearer 0123456789abcdef0123456789abcdef",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      verificationDraftsDeleted: 1,
      verificationDraftProviderDeletionFailed: 0,
      verificationDraftProviderRetentionBlocked: 0,
      verificationEvidencePurged: 2,
      verificationProviderDeletionFailed: 0,
      verificationProviderRetentionBlocked: 0,
      sampleRequestsPurged: 3,
      shippingAddressesDeleted: 4,
    });
  });
});
