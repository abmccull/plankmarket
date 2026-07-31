import { createHmac, timingSafeEqual } from "crypto";

export const VERIFICATION_WEBHOOK_MAX_BODY_BYTES = 16 * 1024;
export const VERIFICATION_WEBHOOK_MAX_SKEW_SECONDS = 5 * 60;
export const VERIFICATION_WEBHOOK_REPLAY_TTL_SECONDS = 24 * 60 * 60;

type WebhookBody = string | Uint8Array;

export function createVerificationWebhookSignature(
  secret: string,
  timestamp: string,
  body: WebhookBody,
): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(timestamp);
  hmac.update(".");
  hmac.update(body);
  return `v1=${hmac.digest("hex")}`;
}

export function verifyVerificationWebhookSignature(params: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: WebhookBody;
  nowMs?: number;
}): boolean {
  const {
    secret,
    timestamp,
    signature,
    body,
    nowMs = Date.now(),
  } = params;
  if (
    !timestamp ||
    !/^\d{10}$/.test(timestamp) ||
    !signature ||
    !/^v1=[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const timestampMs = Number(timestamp) * 1_000;
  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(nowMs - timestampMs) >
      VERIFICATION_WEBHOOK_MAX_SKEW_SECONDS * 1_000
  ) {
    return false;
  }

  const expected = Buffer.from(
    createVerificationWebhookSignature(secret, timestamp, body).slice(3),
    "hex",
  );
  const provided = Buffer.from(signature.slice(3), "hex");
  return (
    expected.length === provided.length &&
    timingSafeEqual(expected, provided)
  );
}

export function verificationWebhookReplayKey(deliveryId: string): string {
  return `webhook:verification:${deliveryId}`;
}
