import { describe, expect, it } from "vitest";
import {
  buildEmailIdempotencyKey,
  EmailDeliveryError,
  isAmbiguousEmailAcceptanceFailure,
  isTransactionalEmailCategory,
  normalizeRecipientEmail,
  requireResendAcceptance,
} from "../delivery-policy";

describe("email delivery policy", () => {
  it("builds stable, bounded keys and changes them with logical identity", () => {
    const first = buildEmailIdempotencyKey(
      "paid order/buyer",
      "order-123",
      "buyer@example.com",
    );
    const retry = buildEmailIdempotencyKey(
      "paid order/buyer",
      "order-123",
      "buyer@example.com",
    );
    const different = buildEmailIdempotencyKey(
      "paid order/buyer",
      "order-124",
      "buyer@example.com",
    );

    expect(first).toBe(retry);
    expect(first).not.toBe(different);
    expect(first).toMatch(/^pm\/paid_order_buyer\/[a-f0-9]{64}$/);
    expect(first.length).toBeLessThanOrEqual(256);
  });

  it("throws when Resend resolves with an API error", () => {
    expect(() =>
      requireResendAcceptance({
        data: null,
        error: {
          name: "rate_limit_exceeded",
          message: "Too many requests",
          statusCode: 429,
        },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<EmailDeliveryError>>({
        name: "EmailDeliveryError",
        code: "rate_limit_exceeded",
        statusCode: 429,
      }),
    );
  });

  it("requires a provider message ID before reporting acceptance", () => {
    expect(() =>
      requireResendAcceptance({
        data: { id: "" },
        error: null,
      }),
    ).toThrow("Resend did not return a provider message ID");
  });

  it("returns the accepted provider message ID", () => {
    expect(
      requireResendAcceptance({
        data: { id: "email_123" },
        error: null,
      }),
    ).toEqual({ id: "email_123" });
  });

  it("normalizes bare and display-name recipient addresses", () => {
    expect(normalizeRecipientEmail(" Buyer@Example.COM ")).toBe(
      "buyer@example.com",
    );
    expect(normalizeRecipientEmail("Buyer <Buyer@Example.COM>")).toBe(
      "buyer@example.com",
    );
  });

  it("routes money and account lifecycle failures to operations", () => {
    expect(isTransactionalEmailCategory("refund")).toBe(true);
    expect(isTransactionalEmailCategory("paid_order_seller")).toBe(true);
    expect(isTransactionalEmailCategory("saved_search_alert")).toBe(false);
  });

  it("distinguishes ambiguous transport failures from explicit API rejection", () => {
    expect(
      isAmbiguousEmailAcceptanceFailure(
        new EmailDeliveryError("Network request failed", {
          code: "application_error",
          statusCode: null,
        }),
      ),
    ).toBe(true);
    expect(
      isAmbiguousEmailAcceptanceFailure(
        new EmailDeliveryError("Provider unavailable", {
          code: "internal_server_error",
          statusCode: 500,
        }),
      ),
    ).toBe(false);
  });
});
