import { createHash } from "crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { CreateEmailOptions } from "resend";
import { resend } from "./client";
import {
  assertValidEmailIdempotencyKey,
  EmailDeliveryError,
  EmailSuppressedError,
  isAmbiguousEmailAcceptanceFailure,
  isTransactionalEmailCategory,
  normalizeRecipientEmail,
  requireResendAcceptance,
} from "./delivery-policy";
import { db } from "@/server/db";
import {
  emailDeliveries,
  emailRecipientSuppressions,
} from "@/server/db/schema/email-deliveries";
import {
  openReconciliationCase,
  resolveReconciliationCaseByKey,
} from "@/server/services/reconciliation-cases";

export interface SendEmailOrThrowInput {
  category: string;
  idempotencyKey: string;
  message: CreateEmailOptions & {
    from: string;
    subject: string;
  };
}

export interface AcceptedEmail {
  id: string;
  status: "accepted";
}

function recipientsFor(message: CreateEmailOptions): string[] {
  const recipients = Array.isArray(message.to) ? message.to : [message.to];
  return [...new Set(recipients.map(normalizeRecipientEmail))];
}

function fingerprintFor(input: SendEmailOrThrowInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        category: input.category,
        from: input.message.from,
        to: recipientsFor(input.message).sort(),
        subject: input.message.subject,
      }),
    )
    .digest("hex");
}

function boundedError(error: unknown): string {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : "Unknown email delivery error";
  return message.slice(0, 2_000);
}

function reconciliationCaseKey(deliveryId: string): string {
  return `email-delivery:${deliveryId}`;
}

const RESEND_SAFE_RETRY_WINDOW_MS = 23 * 60 * 60 * 1_000;

function emailFailureSeverity(
  category: string,
): "medium" | "high" {
  return [
    "paid_order_buyer",
    "paid_order_seller",
    "refund",
    "seller_payout_released",
  ].includes(category)
    ? "high"
    : "medium";
}

async function recordTransactionalEmailFailure(params: {
  deliveryId: string;
  category: string;
  recipients: string[];
  status: "failed" | "suppressed" | "acceptance_unknown";
  error: string;
  providerMessageId?: string | null;
}): Promise<void> {
  if (!isTransactionalEmailCategory(params.category)) return;

  try {
    await openReconciliationCase(db, {
      caseKey: reconciliationCaseKey(params.deliveryId),
      type: "email_delivery",
      source: "resend",
      severity: emailFailureSeverity(params.category),
      title: `Transactional email ${params.status.replace("_", " ")}`,
      summary: `${params.category} could not be delivered to ${params.recipients.join(", ")}: ${params.error}`,
      externalReference: params.providerMessageId ?? null,
      details: {
        deliveryId: params.deliveryId,
        category: params.category,
        recipients: params.recipients,
        status: params.status,
        error: params.error,
      },
    });
  } catch (caseError) {
    console.error("Failed to open email reconciliation case", {
      deliveryId: params.deliveryId,
      category: params.category,
      error:
        caseError instanceof Error
          ? `${caseError.name}: ${caseError.message}`.slice(0, 1_000)
          : "UnknownError",
    });
  }
}

async function resolveTransactionalEmailFailure(params: {
  deliveryId: string;
  category: string;
  providerMessageId: string;
}): Promise<void> {
  if (!isTransactionalEmailCategory(params.category)) return;

  try {
    await resolveReconciliationCaseByKey(db, {
      caseKey: reconciliationCaseKey(params.deliveryId),
      resolution: "Resend accepted the retried transactional email",
      details: {
        deliveryId: params.deliveryId,
        category: params.category,
        providerMessageId: params.providerMessageId,
      },
    });
  } catch (caseError) {
    console.error("Failed to resolve email reconciliation case", {
      deliveryId: params.deliveryId,
      category: params.category,
      error:
        caseError instanceof Error
          ? `${caseError.name}: ${caseError.message}`.slice(0, 1_000)
          : "UnknownError",
    });
  }
}

/**
 * Sends one logical email exactly once and requires provider acceptance.
 *
 * Resend only retains idempotency keys for 24 hours, so the local delivery row
 * remains the long-lived source of truth. A successful response is not exposed
 * to callers until Resend returns a provider message ID and that ID is stored.
 */
export async function sendEmailOrThrow(
  input: SendEmailOrThrowInput,
): Promise<AcceptedEmail> {
  assertValidEmailIdempotencyKey(input.idempotencyKey);

  const recipientEmails = recipientsFor(input.message);
  const payloadFingerprint = fingerprintFor(input);
  const now = new Date();

  const [existing] = await db
    .select({
      id: emailDeliveries.id,
      providerMessageId: emailDeliveries.providerMessageId,
      status: emailDeliveries.status,
      payloadFingerprint: emailDeliveries.payloadFingerprint,
      lastError: emailDeliveries.lastError,
      lastAttemptAt: emailDeliveries.lastAttemptAt,
    })
    .from(emailDeliveries)
    .where(eq(emailDeliveries.idempotencyKey, input.idempotencyKey))
    .limit(1);

  if (
    existing &&
    existing.payloadFingerprint !== payloadFingerprint
  ) {
    throw new EmailDeliveryError(
      "Email idempotency key was reused with a different recipient or subject",
      { code: "local_idempotency_conflict" },
    );
  }

  if (existing?.providerMessageId) {
    await resolveTransactionalEmailFailure({
      deliveryId: existing.id,
      category: input.category,
      providerMessageId: existing.providerMessageId,
    });
    return { id: existing.providerMessageId, status: "accepted" };
  }

  if (existing?.status === "suppressed") {
    await recordTransactionalEmailFailure({
      deliveryId: existing.id,
      category: input.category,
      recipients: recipientEmails,
      status: "suppressed",
      error: existing.lastError ?? "Recipient is suppressed",
    });
    throw new EmailSuppressedError(
      recipientEmails[0] ?? "recipient",
      existing.lastError ?? "suppressed",
    );
  }

  if (
    existing?.status === "acceptance_unknown" &&
    existing.lastAttemptAt &&
    now.getTime() - existing.lastAttemptAt.getTime() >
      RESEND_SAFE_RETRY_WINDOW_MS
  ) {
    const message =
      "Provider acceptance is unknown and the Resend idempotency window is expiring; manual reconciliation is required";
    await recordTransactionalEmailFailure({
      deliveryId: existing.id,
      category: input.category,
      recipients: recipientEmails,
      status: "acceptance_unknown",
      error: message,
    });
    throw new EmailDeliveryError(message, {
      code: "acceptance_unknown_manual_review",
    });
  }

  const [suppression] = await db
    .select({
      email: emailRecipientSuppressions.email,
      reason: emailRecipientSuppressions.reason,
    })
    .from(emailRecipientSuppressions)
    .where(inArray(emailRecipientSuppressions.email, recipientEmails))
    .limit(1);

  const inserted = await db
    .insert(emailDeliveries)
    .values({
      idempotencyKey: input.idempotencyKey,
      category: input.category,
      payloadFingerprint,
      fromAddress: input.message.from,
      recipientEmails,
      subject: input.message.subject,
      status: suppression ? "suppressed" : "sending",
      attemptCount: 0,
      failedAt: suppression ? now : null,
      lastError: suppression
        ? `Recipient suppressed: ${suppression.reason}`
        : null,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: emailDeliveries.id });

  const deliveryId =
    inserted[0]?.id ??
    (
      await db
        .select({ id: emailDeliveries.id })
        .from(emailDeliveries)
        .where(eq(emailDeliveries.idempotencyKey, input.idempotencyKey))
        .limit(1)
    )[0]?.id;

  if (!deliveryId) {
    throw new EmailDeliveryError(
      "Could not establish a durable email delivery record",
      { code: "delivery_record_missing" },
    );
  }

  if (suppression) {
    await recordTransactionalEmailFailure({
      deliveryId,
      category: input.category,
      recipients: recipientEmails,
      status: "suppressed",
      error: `Recipient suppressed: ${suppression.reason}`,
    });
    throw new EmailSuppressedError(suppression.email, suppression.reason);
  }

  await db
    .update(emailDeliveries)
    .set({
      status: "sending",
      attemptCount: sql`${emailDeliveries.attemptCount} + 1`,
      lastAttemptAt: now,
      failedAt: null,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(emailDeliveries.id, deliveryId),
        isNull(emailDeliveries.providerMessageId),
      ),
    );

  let acceptedProviderMessageId: string | null = null;
  try {
    const providerResponse = await resend.emails.send(
      {
        ...input.message,
        tags: [
          ...(input.message.tags ?? []),
          { name: "pm_delivery_id", value: deliveryId },
          { name: "pm_category", value: input.category.slice(0, 256) },
        ],
      },
      { idempotencyKey: input.idempotencyKey },
    );
    const accepted = requireResendAcceptance(providerResponse);
    acceptedProviderMessageId = accepted.id;
    const acceptedAt = new Date();

    const persisted = await db
      .update(emailDeliveries)
      .set({
        providerMessageId: accepted.id,
        status: sql`case
          when ${emailDeliveries.providerStatusAt} is null then 'accepted'
          else ${emailDeliveries.status}
        end`,
        acceptedAt,
        lastError: sql`case
          when ${emailDeliveries.providerStatusAt} is null then null
          else ${emailDeliveries.lastError}
        end`,
        updatedAt: acceptedAt,
      })
      .where(eq(emailDeliveries.id, deliveryId))
      .returning({ id: emailDeliveries.id });

    if (persisted.length === 0) {
      throw new EmailDeliveryError(
        "Provider accepted the email but its delivery record was not updated",
        { code: "acceptance_persistence_failed" },
      );
    }

    await resolveTransactionalEmailFailure({
      deliveryId,
      category: input.category,
      providerMessageId: accepted.id,
    });

    return { id: accepted.id, status: "accepted" };
  } catch (error) {
    let failure = error;
    const failedAt = new Date();
    if (acceptedProviderMessageId) {
      try {
        const recovered = await db
          .update(emailDeliveries)
          .set({
            providerMessageId: acceptedProviderMessageId,
            status: sql`case
              when ${emailDeliveries.providerStatusAt} is null then 'accepted'
              else ${emailDeliveries.status}
            end`,
            acceptedAt: failedAt,
            lastError: sql`case
              when ${emailDeliveries.providerStatusAt} is null then null
              else ${emailDeliveries.lastError}
            end`,
            updatedAt: failedAt,
          })
          .where(eq(emailDeliveries.id, deliveryId))
          .returning({ id: emailDeliveries.id });
        if (recovered.length > 0) {
          await resolveTransactionalEmailFailure({
            deliveryId,
            category: input.category,
            providerMessageId: acceptedProviderMessageId,
          });
          return {
            id: acceptedProviderMessageId,
            status: "accepted",
          };
        }
      } catch (recoveryError) {
        failure = recoveryError;
      }
    }

    const acceptanceUnknown =
      acceptedProviderMessageId !== null ||
      isAmbiguousEmailAcceptanceFailure(error);
    const failureMessage = boundedError(failure);
    await db
      .update(emailDeliveries)
      .set({
        status: acceptanceUnknown ? "acceptance_unknown" : "failed",
        failedAt,
        lastError: failureMessage,
        updatedAt: failedAt,
      })
      .where(
        and(
          eq(emailDeliveries.id, deliveryId),
          isNull(emailDeliveries.providerMessageId),
        ),
      );
    await recordTransactionalEmailFailure({
      deliveryId,
      category: input.category,
      recipients: recipientEmails,
      status: acceptanceUnknown ? "acceptance_unknown" : "failed",
      error: failureMessage,
      providerMessageId: acceptedProviderMessageId,
    });
    throw failure;
  }
}
