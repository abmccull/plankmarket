import { and, eq, isNull, lte, or } from "drizzle-orm";
import type { WebhookEventPayload } from "resend";
import {
  isTransactionalEmailCategory,
  normalizeRecipientEmail,
} from "./delivery-policy";
import {
  getResendWebhookTransition,
  type EmailWebhookEvent,
} from "./webhook-policy";
import { db } from "@/server/db";
import {
  emailDeliveries,
  emailRecipientSuppressions,
  resendWebhookEvents,
} from "@/server/db/schema/email-deliveries";
import {
  openReconciliationCase,
  resolveReconciliationCaseByKey,
} from "@/server/services/reconciliation-cases";

function isEmailWebhookEvent(
  event: WebhookEventPayload,
): event is EmailWebhookEvent {
  return (
    event.type.startsWith("email.") &&
    "email_id" in event.data &&
    typeof event.data.email_id === "string"
  );
}

function deliveryIdFromEvent(event: EmailWebhookEvent): string | null {
  if (!("tags" in event.data) || !event.data.tags) return null;
  const value = event.data.tags.pm_delivery_id;
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}

export async function processVerifiedResendWebhook(params: {
  webhookId: string;
  event: WebhookEventPayload;
}): Promise<
  | { processed: true; duplicate: boolean }
  | { processed: false; reason: "non_email_event" }
> {
  if (!isEmailWebhookEvent(params.event)) {
    return { processed: false, reason: "non_email_event" };
  }

  const event = params.event;
  const eventCreatedAt = new Date(event.created_at);
  if (!Number.isFinite(eventCreatedAt.getTime())) {
    throw new Error("Resend webhook contains an invalid event timestamp");
  }

  const processingResult = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(resendWebhookEvents)
      .values({
        id: params.webhookId,
        eventType: event.type,
        providerMessageId: event.data.email_id,
        eventCreatedAt,
        payload: event as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing()
      .returning({ id: resendWebhookEvents.id });

    if (inserted.length === 0) {
      return { processed: true, duplicate: true } as const;
    }

    const transition = getResendWebhookTransition(event);
    if (!transition) {
      return { processed: true, duplicate: false } as const;
    }

    const taggedDeliveryId = deliveryIdFromEvent(event);
    const taggedDelivery = taggedDeliveryId
      ? (
          await tx
            .select({
              id: emailDeliveries.id,
              providerMessageId: emailDeliveries.providerMessageId,
            })
            .from(emailDeliveries)
            .where(eq(emailDeliveries.id, taggedDeliveryId))
            .limit(1)
        )[0]
      : null;

    if (
      taggedDelivery?.providerMessageId &&
      taggedDelivery.providerMessageId !== event.data.email_id
    ) {
      throw new Error(
        "Resend webhook provider message ID conflicts with its tagged delivery",
      );
    }

    const deliveryId =
      taggedDelivery?.id ??
      (
        await tx
          .select({ id: emailDeliveries.id })
          .from(emailDeliveries)
          .where(
            eq(emailDeliveries.providerMessageId, event.data.email_id),
          )
          .limit(1)
      )[0]?.id;

    if (!deliveryId) {
      return { processed: true, duplicate: false } as const;
    }

    const [delivery] = await tx
      .update(emailDeliveries)
      .set({
        providerMessageId: event.data.email_id,
        status: transition.status,
        providerStatusAt: eventCreatedAt,
        deliveredAt:
          transition.status === "delivered" ? eventCreatedAt : null,
        failedAt:
          transition.failureReason !== null ? eventCreatedAt : null,
        lastError: transition.failureReason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailDeliveries.id, deliveryId),
          or(
            isNull(emailDeliveries.providerStatusAt),
            lte(emailDeliveries.providerStatusAt, eventCreatedAt),
          ),
        ),
      )
      .returning({
        id: emailDeliveries.id,
        recipientEmails: emailDeliveries.recipientEmails,
      });

    if (delivery && transition.suppressReason) {
      const recipients = (
        "to" in event.data && Array.isArray(event.data.to)
          ? event.data.to
          : delivery.recipientEmails
      ).map(normalizeRecipientEmail);

      for (const recipient of recipients) {
        await tx
          .insert(emailRecipientSuppressions)
          .values({
            email: recipient,
            reason: transition.suppressReason,
            sourceDeliveryId: delivery.id,
            providerMessageId: event.data.email_id,
            suppressedAt: eventCreatedAt,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: emailRecipientSuppressions.email,
            set: {
              reason: transition.suppressReason,
              sourceDeliveryId: delivery.id,
              providerMessageId: event.data.email_id,
              suppressedAt: eventCreatedAt,
              updatedAt: new Date(),
            },
          });
      }
    }

    return { processed: true, duplicate: false } as const;
  });

  const transition = getResendWebhookTransition(event);
  if (!transition) return processingResult;

  const [delivery] = await db
    .select({
      id: emailDeliveries.id,
      category: emailDeliveries.category,
      recipientEmails: emailDeliveries.recipientEmails,
    })
    .from(emailDeliveries)
    .where(eq(emailDeliveries.providerMessageId, event.data.email_id))
    .limit(1);

  if (!delivery) return processingResult;

  const caseKey = `email-delivery:${delivery.id}`;
  if (["sent", "delivered"].includes(transition.status)) {
    await resolveReconciliationCaseByKey(db, {
      caseKey,
      resolution: `Resend confirmed the transactional email was ${transition.status}`,
      details: {
        deliveryId: delivery.id,
        category: delivery.category,
        providerMessageId: event.data.email_id,
        providerStatus: transition.status,
      },
    });
    return processingResult;
  }

  const exceptionStatus = [
    "delivery_delayed",
    "bounced",
    "complained",
    "failed",
    "suppressed",
  ].includes(transition.status);
  const queueForOperator =
    exceptionStatus &&
    (isTransactionalEmailCategory(delivery.category) ||
      transition.status === "complained");

  if (queueForOperator) {
    const highSeverity =
      transition.status === "complained" ||
      [
        "paid_order_buyer",
        "paid_order_seller",
        "refund",
        "seller_payout_released",
      ].includes(delivery.category);
    await openReconciliationCase(db, {
      caseKey,
      type: "email_delivery",
      source: "resend",
      severity: highSeverity ? "high" : "medium",
      title: `Email ${transition.status.replace("_", " ")}`,
      summary: `${delivery.category} for ${delivery.recipientEmails.join(", ")} is ${transition.status}${transition.failureReason ? `: ${transition.failureReason}` : ""}`,
      externalReference: event.data.email_id,
      details: {
        deliveryId: delivery.id,
        category: delivery.category,
        recipients: delivery.recipientEmails,
        providerMessageId: event.data.email_id,
        providerStatus: transition.status,
        providerEventId: params.webhookId,
        providerEventCreatedAt: event.created_at,
        error: transition.failureReason,
      },
    });
  }

  return processingResult;
}
