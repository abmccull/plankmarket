import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { inngest } from "../client";
import { PLANKMARKET_EVENTS } from "../events";
import { db } from "@/server/db";
import { stripeWebhookEvents } from "@/server/db/schema";
import { processStripeWebhookEvent } from "@/app/api/webhooks/stripe/route";
import { STRIPE_WEBHOOK_PROCESSING_LEASE_MS } from "@/server/services/stripe-webhook-policy";

const STRIPE_WEBHOOK_RECOVERY_BATCH_SIZE = 50;

export const stripeWebhookProcessor = inngest.createFunction(
  {
    id: "stripe-webhook-processor",
    retries: 8,
    concurrency: { limit: 10 },
  },
  { event: PLANKMARKET_EVENTS.stripeWebhookReceived },
  async ({ event, step }) =>
    step.run(`process-${event.data.eventId}`, () =>
      processStripeWebhookEvent(event.data.eventId),
    ),
);

export const stripeWebhookRecovery = inngest.createFunction(
  {
    id: "stripe-webhook-recovery",
    retries: 2,
    concurrency: { limit: 1 },
  },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const staleBefore = new Date(
      Date.now() - STRIPE_WEBHOOK_PROCESSING_LEASE_MS,
    );
    const candidates = await step.run("load-recoverable-webhooks", () =>
      db
        .select({ id: stripeWebhookEvents.id })
        .from(stripeWebhookEvents)
        .where(
          or(
            inArray(stripeWebhookEvents.status, ["pending", "failed"]),
            and(
              eq(stripeWebhookEvents.status, "processing"),
              or(
                isNull(stripeWebhookEvents.processingStartedAt),
                lt(stripeWebhookEvents.processingStartedAt, staleBefore),
              ),
            ),
          ),
        )
        .orderBy(asc(stripeWebhookEvents.receivedAt), asc(stripeWebhookEvents.id))
        .limit(STRIPE_WEBHOOK_RECOVERY_BATCH_SIZE),
    );

    let processed = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        const result = await step.run(`recover-${candidate.id}`, () =>
          processStripeWebhookEvent(candidate.id),
        );
        if (result.processed) processed += 1;
      } catch {
        failed += 1;
      }
    }
    return { selected: candidates.length, processed, failed };
  },
);
