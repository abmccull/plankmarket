import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  process: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    RESEND_WEBHOOK_SECRET: "whsec_test",
  },
}));

vi.mock("@/lib/email/client", () => ({
  resend: {
    webhooks: {
      verify: mocks.verify,
    },
  },
}));

vi.mock("@/lib/email/webhook", () => ({
  processVerifiedResendWebhook: mocks.process,
}));

import { POST } from "../route";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers,
    body: '{"type":"email.delivered"}',
  });
}

describe("Resend webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockReturnValue({
      type: "email.delivered",
      created_at: "2026-07-30T20:00:00.000Z",
      data: {
        email_id: "email_123",
        created_at: "2026-07-30T19:59:59.000Z",
        from: "sender@example.com",
        to: ["buyer@example.com"],
        subject: "Delivered",
      },
    });
    mocks.process.mockResolvedValue({
      processed: true,
      duplicate: false,
    });
  });

  it("rejects requests missing signed webhook headers", async () => {
    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("verifies the raw payload with all Svix headers", async () => {
    const response = await POST(
      request({
        "svix-id": "msg_123",
        "svix-timestamp": "1785441600",
        "svix-signature": "v1,signature",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledWith({
      payload: '{"type":"email.delivered"}',
      headers: {
        id: "msg_123",
        timestamp: "1785441600",
        signature: "v1,signature",
      },
      webhookSecret: "whsec_test",
    });
    expect(mocks.process).toHaveBeenCalledWith(
      expect.objectContaining({ webhookId: "msg_123" }),
    );
  });

  it("rejects a failed signature verification", async () => {
    mocks.verify.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    const response = await POST(
      request({
        "svix-id": "msg_123",
        "svix-timestamp": "1785441600",
        "svix-signature": "v1,bad",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("returns a retryable failure when persistence fails", async () => {
    mocks.process.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(
      request({
        "svix-id": "msg_123",
        "svix-timestamp": "1785441600",
        "svix-signature": "v1,signature",
      }),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("retry-after")).toBe("5");
  });
});
