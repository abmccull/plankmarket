import { inngest } from "../client";
import { db } from "@/server/db";
import { agentConfigs } from "@/server/db/schema/agent-configs";
import { eq } from "drizzle-orm";

interface SubscriptionEvent {
  data: {
    userId: string;
  };
}

/**
 * Triggered when a user subscribes to Pro.
 * TODO: Send welcome-to-pro email via Resend.
 */
export const proWelcome = inngest.createFunction(
  { id: "pro-welcome", name: "Pro Welcome" },
  { event: "subscription/activated" },
  async ({ event }) => {
    const { userId } = event.data as SubscriptionEvent["data"];
    console.log("Pro activated for user:", userId);
    // TODO: send welcome-to-pro email via Resend
  }
);

/**
 * Triggered when a subscription payment fails.
 * TODO: Send "please update payment" email via Resend.
 */
export const proPaymentFailed = inngest.createFunction(
  { id: "pro-payment-failed", name: "Pro Payment Failed" },
  { event: "subscription/payment-failed" },
  async ({ event }) => {
    const { userId } = event.data as SubscriptionEvent["data"];
    console.log("Pro payment failed for user:", userId);
    // TODO: send "please update your payment method" email via Resend
  }
);

/**
 * Triggered when a subscription is fully expired/deleted.
 * Disables all agent automation and sends a farewell notification.
 * TODO: Send "sorry to see you go" email via Resend.
 */
export const proExpired = inngest.createFunction(
  { id: "pro-expired", name: "Pro Expired" },
  { event: "subscription/expired" },
  async ({ event, step }) => {
    const { userId } = event.data as SubscriptionEvent["data"];
    console.log("Pro expired for user:", userId);
    // TODO: send "sorry to see you go" email via Resend

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
  }
);
