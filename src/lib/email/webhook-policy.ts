import type { WebhookEventPayload } from "resend";
import type { EmailDeliveryStatus } from "@/server/db/schema/email-deliveries";

export type EmailWebhookEvent = Extract<
  WebhookEventPayload,
  { type: `email.${string}` }
>;

export interface ResendWebhookTransition {
  status: EmailDeliveryStatus;
  failureReason: string | null;
  suppressReason: "bounced" | "complained" | "suppressed" | null;
}
export function getResendWebhookTransition(
  event: EmailWebhookEvent,
): ResendWebhookTransition | null {
  switch (event.type) {
    case "email.scheduled":
      return {
        status: "scheduled",
        failureReason: null,
        suppressReason: null,
      };
    case "email.sent":
      return {
        status: "sent",
        failureReason: null,
        suppressReason: null,
      };
    case "email.delivered":
      return {
        status: "delivered",
        failureReason: null,
        suppressReason: null,
      };
    case "email.delivery_delayed":
      return {
        status: "delivery_delayed",
        failureReason: "Provider reported a delivery delay",
        suppressReason: null,
      };
    case "email.bounced": {
      const permanent =
        event.data.bounce.type.toLowerCase() === "permanent";
      return {
        status: "bounced",
        failureReason: event.data.bounce.message,
        suppressReason: permanent ? "bounced" : null,
      };
    }
    case "email.complained":
      return {
        status: "complained",
        failureReason: "Recipient reported the message as spam",
        suppressReason: "complained",
      };
    case "email.failed":
      return {
        status: "failed",
        failureReason: event.data.failed.reason,
        suppressReason: null,
      };
    case "email.suppressed":
      return {
        status: "suppressed",
        failureReason: event.data.suppressed.message,
        suppressReason: "suppressed",
      };
    case "email.opened":
    case "email.clicked":
    case "email.received":
      return null;
  }
}
