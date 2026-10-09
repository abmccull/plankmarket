import { inngest } from "../client";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema/notifications";
import { applyVerifiedProExpiry } from "@/server/services/subscription-lifecycle-identity";

interface SubscriptionEvent {
  data: {
    userId: string;
  };
}

/**
 * Triggered when a user subscribes to Pro.
 */
export const proWelcome = inngest.createFunction(
  { id: "pro-welcome", name: "Pro Welcome" },
  { event: "subscription/activated" },
  async ({ event, step }) => {
    const { userId } = event.data as SubscriptionEvent["data"];
    await step.run("notify-pro-activated", async () => {
      await db.insert(notifications).values({
        userId,
        type: "system",
        title: "PlankMarket Pro is active",
        message:
          "Your Pro tools are ready. Review your agent and saved-search settings before enabling automation.",
        data: { subscriptionEvent: "activated" },
      });
    });
  }
);

/**
 * Triggered when a subscription payment fails.
 */
export const proPaymentFailed = inngest.createFunction(
  { id: "pro-payment-failed", name: "Pro Payment Failed" },
  { event: "subscription/payment-failed" },
  async ({ event, step }) => {
    const { userId } = event.data as SubscriptionEvent["data"];
    await step.run("notify-payment-failed", async () => {
      await db.insert(notifications).values({
        userId,
        type: "system",
        title: "Pro payment needs attention",
        message:
          "Stripe could not renew your Pro subscription. Update your payment method to avoid losing access.",
        data: { subscriptionEvent: "payment_failed" },
      });
    });
  }
);

/**
 * Triggered when a subscription is fully expired/deleted.
 * Disables all agent automation and notifies the user.
 */
export const proExpired = inngest.createFunction(
  { id: "pro-expired", name: "Pro Expired" },
  { event: "subscription/expired" },
  async ({ event, step }) => {
    return step.run("apply-verified-pro-expiry-v1", () =>
      applyVerifiedProExpiry(db, event),
    );
  },
);
