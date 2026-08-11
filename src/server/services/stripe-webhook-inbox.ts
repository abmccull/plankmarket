import type Stripe from "stripe";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { stripeWebhookEvents } from "@/server/db/schema";
import { STRIPE_WEBHOOK_PROCESSING_LEASE_MS } from "./stripe-webhook-policy";

export type StripeWebhookClaim =
  | { state: "claimed"; event: Stripe.Event; startedAt: Date }
  | { state: "completed" }
  | { state: "busy" }
  | { state: "missing" };

function serializeEvent(event: Stripe.Event): Record<string, unknown> {
  return JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
}

export async function receiveStripeWebhookEvent(event: Stripe.Event): Promise<{
  completed: boolean;
}> {
  const receivedAt = new Date();
  const payload = serializeEvent(event);
  const inserted = await db
    .insert(stripeWebhookEvents)
    .values({
      id: event.id,
      eventType: event.type,
      processedAt: receivedAt,
      receivedAt,
      eventCreatedAt: new Date(event.created * 1_000),
      payload,
      status: "pending",
      attemptCount: 0,
      processingStartedAt: null,
      completedAt: null,
      lastError: null,
    })
    .onConflictDoNothing()
    .returning({ id: stripeWebhookEvents.id });
  if (inserted.length > 0) return { completed: false };

  const existing = await db.query.stripeWebhookEvents.findFirst({
    where: eq(stripeWebhookEvents.id, event.id),
    columns: { status: true },
  });
  if (existing?.status === "completed") return { completed: true };

  await db
    .update(stripeWebhookEvents)
    .set({
      eventType: event.type,
      receivedAt,
      eventCreatedAt: new Date(event.created * 1_000),
      payload,
      status: "pending",
      processingStartedAt: null,
      completedAt: null,
      lastError: null,
    })
    .where(
      and(
        eq(stripeWebhookEvents.id, event.id),
        or(
          eq(stripeWebhookEvents.status, "pending"),
          eq(stripeWebhookEvents.status, "failed"),
        ),
      ),
    );
  return { completed: false };
}

export async function claimStripeWebhookEvent(
  eventId: string,
): Promise<StripeWebhookClaim> {
  const startedAt = new Date();
  const staleBefore = new Date(
    startedAt.getTime() - STRIPE_WEBHOOK_PROCESSING_LEASE_MS,
  );

  const claimed = await db
    .update(stripeWebhookEvents)
    .set({
      status: "processing",
      attemptCount: sql`${stripeWebhookEvents.attemptCount} + 1`,
      processingStartedAt: startedAt,
      completedAt: null,
      lastError: null,
    })
    .where(
      and(
        eq(stripeWebhookEvents.id, eventId),
        or(
          eq(stripeWebhookEvents.status, "pending"),
          eq(stripeWebhookEvents.status, "failed"),
          and(
            eq(stripeWebhookEvents.status, "processing"),
            or(
              isNull(stripeWebhookEvents.processingStartedAt),
              lt(stripeWebhookEvents.processingStartedAt, staleBefore),
            ),
          ),
        ),
      ),
    )
    .returning({ payload: stripeWebhookEvents.payload });

  if (claimed[0]?.payload) {
    return {
      state: "claimed",
      event: claimed[0].payload as unknown as Stripe.Event,
      startedAt,
    };
  }

  const existing = await db.query.stripeWebhookEvents.findFirst({
    where: eq(stripeWebhookEvents.id, eventId),
    columns: { status: true, payload: true },
  });
  if (!existing) return { state: "missing" };
  if (existing.status === "completed") return { state: "completed" };
  if (!existing.payload) return { state: "missing" };
  return { state: "busy" };
}

export async function completeStripeWebhookEvent(
  eventId: string,
  startedAt: Date,
): Promise<void> {
  const [completed] = await db
    .update(stripeWebhookEvents)
    .set({
      status: "completed",
      completedAt: new Date(),
      processingStartedAt: null,
      lastError: null,
    })
    .where(
      and(
        eq(stripeWebhookEvents.id, eventId),
        eq(stripeWebhookEvents.status, "processing"),
        eq(stripeWebhookEvents.processingStartedAt, startedAt),
      ),
    )
    .returning({ id: stripeWebhookEvents.id });
  if (!completed) throw new Error("Stripe webhook processing lease was lost");
}

export async function failStripeWebhookEvent(
  eventId: string,
  startedAt: Date,
  error: unknown,
): Promise<void> {
  await db
    .update(stripeWebhookEvents)
    .set({
      status: "failed",
      processingStartedAt: null,
      completedAt: null,
      lastError:
        error instanceof Error
          ? `${error.name}: ${error.message}`.slice(0, 1_000)
          : "UnknownError",
    })
    .where(
      and(
        eq(stripeWebhookEvents.id, eventId),
        eq(stripeWebhookEvents.status, "processing"),
        eq(stripeWebhookEvents.processingStartedAt, startedAt),
      ),
    );
}
