import type {
  EmailBouncedEvent,
  EmailDeliveredEvent,
  EmailFailedEvent,
  EmailSuppressedEvent,
} from "resend";
import { describe, expect, it } from "vitest";
import { getResendWebhookTransition } from "../webhook-policy";

const baseData = {
  created_at: "2026-07-30T20:00:00.000Z",
  email_id: "email_123",
  from: "PlankMarket <noreply@plankmarket.com>",
  to: ["buyer@example.com"],
  subject: "Order confirmed",
};

describe("Resend webhook policy", () => {
  it("marks a delivered email without suppressing the recipient", () => {
    const event: EmailDeliveredEvent = {
      type: "email.delivered",
      created_at: "2026-07-30T20:01:00.000Z",
      data: baseData,
    };

    expect(getResendWebhookTransition(event)).toEqual({
      status: "delivered",
      failureReason: null,
      suppressReason: null,
    });
  });

  it("suppresses recipients only for permanent bounces", () => {
    const permanent: EmailBouncedEvent = {
      type: "email.bounced",
      created_at: "2026-07-30T20:01:00.000Z",
      data: {
        ...baseData,
        bounce: {
          message: "Mailbox does not exist",
          type: "Permanent",
          subType: "General",
        },
      },
    };
    const transient: EmailBouncedEvent = {
      ...permanent,
      data: {
        ...permanent.data,
        bounce: {
          ...permanent.data.bounce,
          type: "Transient",
        },
      },
    };

    expect(getResendWebhookTransition(permanent)?.suppressReason).toBe(
      "bounced",
    );
    expect(getResendWebhookTransition(transient)?.suppressReason).toBeNull();
  });

  it("records provider failure and suppression reasons", () => {
    const failed: EmailFailedEvent = {
      type: "email.failed",
      created_at: "2026-07-30T20:01:00.000Z",
      data: {
        ...baseData,
        failed: { reason: "upstream unavailable" },
      },
    };
    const suppressed: EmailSuppressedEvent = {
      type: "email.suppressed",
      created_at: "2026-07-30T20:01:00.000Z",
      data: {
        ...baseData,
        suppressed: {
          message: "Address is on the suppression list",
          type: "SuppressionList",
        },
      },
    };

    expect(getResendWebhookTransition(failed)).toEqual({
      status: "failed",
      failureReason: "upstream unavailable",
      suppressReason: null,
    });
    expect(getResendWebhookTransition(suppressed)).toEqual({
      status: "suppressed",
      failureReason: "Address is on the suppression list",
      suppressReason: "suppressed",
    });
  });
});
