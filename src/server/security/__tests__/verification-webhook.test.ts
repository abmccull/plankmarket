import { describe, expect, it } from "vitest";
import {
  createVerificationWebhookSignature,
  verificationWebhookReplayKey,
  verifyVerificationWebhookSignature,
} from "@/server/security/verification-webhook";

const SECRET = "verification-webhook-secret-at-least-32-chars";
const TIMESTAMP = "1785434400";
const NOW_MS = Number(TIMESTAMP) * 1_000;
const BODY =
  '{"userId":"11111111-1111-4111-8111-111111111111","submissionId":"22222222-2222-4222-8222-222222222222"}';

describe("business verification webhook authentication", () => {
  it("accepts an untampered, current signed body", () => {
    const signature = createVerificationWebhookSignature(
      SECRET,
      TIMESTAMP,
      BODY,
    );

    expect(
      verifyVerificationWebhookSignature({
        secret: SECRET,
        timestamp: TIMESTAMP,
        signature,
        body: BODY,
        nowMs: NOW_MS,
      }),
    ).toBe(true);
  });

  it("rejects body tampering and malformed signatures", () => {
    const signature = createVerificationWebhookSignature(
      SECRET,
      TIMESTAMP,
      BODY,
    );

    expect(
      verifyVerificationWebhookSignature({
        secret: SECRET,
        timestamp: TIMESTAMP,
        signature,
        body: `${BODY} `,
        nowMs: NOW_MS,
      }),
    ).toBe(false);
    expect(
      verifyVerificationWebhookSignature({
        secret: SECRET,
        timestamp: TIMESTAMP,
        signature: "v1=not-a-signature",
        body: BODY,
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  it("rejects signatures outside the five-minute replay window", () => {
    const signature = createVerificationWebhookSignature(
      SECRET,
      TIMESTAMP,
      BODY,
    );

    expect(
      verifyVerificationWebhookSignature({
        secret: SECRET,
        timestamp: TIMESTAMP,
        signature,
        body: BODY,
        nowMs: NOW_MS + 5 * 60 * 1_000 + 1,
      }),
    ).toBe(false);
  });

  it("names replay keys by opaque delivery ID", () => {
    expect(
      verificationWebhookReplayKey(
        "33333333-3333-4333-8333-333333333333",
      ),
    ).toBe(
      "webhook:verification:33333333-3333-4333-8333-333333333333",
    );
  });
});
