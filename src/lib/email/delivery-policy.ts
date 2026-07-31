import { createHash } from "crypto";
import type { ErrorResponse } from "resend";

const TRANSACTIONAL_EMAIL_CATEGORIES = new Set([
  "welcome",
  "paid_order_buyer",
  "paid_order_seller",
  "offer_accepted",
  "verification_approved",
  "verification_rejected",
  "refund",
  "seller_payout_released",
]);

export class EmailDeliveryError extends Error {
  readonly code: string;
  readonly statusCode: number | null;

  constructor(
    message: string,
    options: {
      code: string;
      statusCode?: number | null;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "EmailDeliveryError";
    this.code = options.code;
    this.statusCode = options.statusCode ?? null;
  }
}

export class EmailSuppressedError extends EmailDeliveryError {
  readonly recipient: string;

  constructor(recipient: string, reason: string) {
    super(`Email delivery to ${recipient} is suppressed (${reason})`, {
      code: "recipient_suppressed",
    });
    this.name = "EmailSuppressedError";
    this.recipient = recipient;
  }
}

export function buildEmailIdempotencyKey(
  category: string,
  ...identityParts: Array<string | number | null | undefined>
): string {
  const safeCategory =
    category.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "email";
  const identity = identityParts
    .map((part) => String(part ?? ""))
    .join("\u001f");
  const digest = createHash("sha256").update(identity).digest("hex");
  return `pm/${safeCategory}/${digest}`;
}

export function assertValidEmailIdempotencyKey(key: string): void {
  if (key.length < 1 || key.length > 256) {
    throw new EmailDeliveryError(
      "Email idempotency key must contain between 1 and 256 characters",
      { code: "invalid_idempotency_key" },
    );
  }
  if (!/^[\x20-\x7E]+$/.test(key)) {
    throw new EmailDeliveryError(
      "Email idempotency key must contain printable ASCII characters only",
      { code: "invalid_idempotency_key" },
    );
  }
}

export function requireResendAcceptance(response: {
  data: { id: string } | null;
  error: ErrorResponse | null;
}): { id: string } {
  if (response.error) {
    throw new EmailDeliveryError(response.error.message, {
      code: response.error.name,
      statusCode: response.error.statusCode,
    });
  }

  if (!response.data?.id) {
    throw new EmailDeliveryError(
      "Resend did not return a provider message ID",
      { code: "missing_provider_message_id" },
    );
  }

  return { id: response.data.id };
}

export function normalizeRecipientEmail(value: string): string {
  const angleAddress = value.match(/<([^<>]+)>/);
  return (angleAddress?.[1] ?? value).trim().toLowerCase();
}

export function isTransactionalEmailCategory(category: string): boolean {
  return TRANSACTIONAL_EMAIL_CATEGORIES.has(category);
}

export function isAmbiguousEmailAcceptanceFailure(error: unknown): boolean {
  return (
    error instanceof EmailDeliveryError &&
    (error.code === "missing_provider_message_id" ||
      error.code === "acceptance_persistence_failed" ||
      (error.code === "application_error" && error.statusCode === null))
  );
}
