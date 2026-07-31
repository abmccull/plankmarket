import { inngest } from "../client";
import { db } from "@/server/db";
import { agentConfigs } from "@/server/db/schema/agent-configs";
import { notifications } from "@/server/db/schema/notifications";
import { eq } from "drizzle-orm";

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
    const { userId } = event.data as SubscriptionEvent["data"];

    await step.run("disable-agent", async () => {
      await db
        .update(agentConfigs)
        .set({
          offerAutoEnabled: false,
          monitorEnabled: false,
          repricingEnabled: false,
          updatedAt: new Date(),
        })
        .where(eq(agentConfigs.userId, userId));
    });

    await step.run("notify-pro-expired", async () => {
      await db.insert(notifications).values({
        userId,
        type: "system",
        title: "PlankMarket Pro ended",
        message:
          "Your Pro subscription has ended and agent automation is now disabled. Your marketplace account and saved data remain available.",
        data: { subscriptionEvent: "expired" },
      });
    });
  }
);
