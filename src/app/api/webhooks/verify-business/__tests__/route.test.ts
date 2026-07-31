import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createVerificationWebhookSignature } from "@/server/security/verification-webhook";

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  del: vi.fn(),
  processBusinessVerification: vi.fn(),
}));

vi.mock("@/lib/redis/client", () => ({
  getRedisClient: () => ({
    set: mocks.set,
    del: mocks.del,
  }),
}));

vi.mock("@/server/services/business-verification", () => ({
  processBusinessVerification: mocks.processBusinessVerification,
}));

const { POST } = await import("@/app/api/webhooks/verify-business/route");

const SECRET = "verification-webhook-secret-at-least-32-chars";
const DELIVERY_ID = "33333333-3333-4333-8333-333333333333";
const body = JSON.stringify({
  userId: "11111111-1111-4111-8111-111111111111",
  submissionId: "22222222-2222-4222-8222-222222222222",
});

function createSignedRequest(extraHeaders: Record<string, string> = {}) {
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  return new NextRequest(
    "https://plankmarket.com/api/webhooks/verify-business",
    {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-plankmarket-delivery-id": DELIVERY_ID,
        "x-plankmarket-timestamp": timestamp,
        "x-plankmarket-signature": createVerificationWebhookSignature(
          SECRET,
          timestamp,
          body,
        ),
        ...extraHeaders,
      },
    },
  );
}

describe("business verification webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERIFICATION_WEBHOOK_SECRET = SECRET;
    mocks.set.mockResolvedValue("OK");
    mocks.del.mockResolvedValue(1);
    mocks.processBusinessVerification.mockResolvedValue({
      processed: true,
      status: "manual_review",
    });
  });

  it("requires a current raw-body HMAC instead of the legacy static header", async () => {
    const request = new NextRequest(
      "https://plankmarket.com/api/webhooks/verify-business",
      {
        method: "POST",
        body,
        headers: {
          "content-type": "application/json",
          "x-webhook-secret": SECRET,
        },
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(mocks.processBusinessVerification).not.toHaveBeenCalled();
  });

  it("processes one authenticated delivery and records completion", async () => {
    const response = await POST(createSignedRequest());

    expect(response.status).toBe(200);
    expect(mocks.processBusinessVerification).toHaveBeenCalledWith({
      userId: "11111111-1111-4111-8111-111111111111",
      submissionId: "22222222-2222-4222-8222-222222222222",
    });
    expect(mocks.set).toHaveBeenNthCalledWith(
      1,
      `webhook:verification:${DELIVERY_ID}`,
      "processing",
      expect.objectContaining({ nx: true }),
    );
    expect(mocks.set).toHaveBeenNthCalledWith(
      2,
      `webhook:verification:${DELIVERY_ID}`,
      "completed",
      expect.any(Object),
    );
  });

  it("acknowledges a duplicate delivery without running it again", async () => {
    mocks.set.mockResolvedValueOnce(null);

    const response = await POST(createSignedRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      replayed: true,
    });
    expect(mocks.processBusinessVerification).not.toHaveBeenCalled();
  });
});
