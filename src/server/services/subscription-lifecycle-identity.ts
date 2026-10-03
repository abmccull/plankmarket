import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/server/db";
import {
  agentConfigs,
  auditEvents,
  notifications,
  users,
} from "@/server/db/schema";
import { isPro } from "@/lib/pro";
import { appendAuditEvent } from "./audit-ledger";
import { readProCheckoutEvidence, STRIPE_PRO_PRICES } from "./subscription-checkout";
import { mapStripeSubscriptionStatus } from "./stripe-webhook-policy";
import {
  openReconciliationCase,
  resolveReconciliationCaseByKey,
} from "./reconciliation-cases";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;
type Audit = typeof auditEvents.$inferSelect;
type Provider = Pick<Stripe, "subscriptions" | "invoices">;
const id = z.string().min(1).max(200);
const eventType = z.enum([
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);
const sourceIdentitySchema = z
  .object({
    customerId: id,
    subscriptionId: id,
    metadataUserId: z.uuid().nullable(),
    parentMetadataUserId: z.uuid().nullable(),
  })
  .strict();
const sourceShape = {
  eventId: id,
  eventType,
  eventCreated: z.number().int().nonnegative().max(8_640_000_000_000),
  sourceObjectId: id,
  sourceIdentity: sourceIdentitySchema,
};
const sourceSchema = z.object(sourceShape).strict();
type Source = z.infer<typeof sourceSchema>;
const lifecycleDataSchema = z
  .object({
    userId: z.uuid(),
    customerId: id,
    subscriptionId: id,
    sourceStripeEventId: id,
  })
  .strict();
type LifecycleData = z.infer<typeof lifecycleDataSchema>;
const outboundSchema = z
  .object({
    id: z.string().min(1).max(255),
    name: z.enum(["subscription/expired", "subscription/payment-failed"]),
    data: lifecycleDataSchema,
  })
  .strict();
type Outbound = z.infer<typeof outboundSchema>;
const receiptSchema = z
  .object({
    version: z.literal(1),
    ...sourceShape,
    userId: z.uuid(),
    customerId: id,
    subscriptionId: id,
    outcome: z.enum(["deleted", "past_due"]),
    outbound: outboundSchema,
  })
  .strict();
type Receipt = z.infer<typeof receiptSchema>;
const effectSchema = z
  .object({
    version: z.literal(1),
    applicationReceiptId: z.uuid(),
    ...lifecycleDataSchema.shape,
  })
  .strict();
const subscriptionStatuses = new Set([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
  "unpaid",
]);
const invoiceStatuses = new Set([
  "draft",
  "open",
  "paid",
  "uncollectible",
  "void",
]);
const RETRY_READ = Symbol("reread-provider");

class LifecycleIdentityReviewError extends Error {}
function review(message: string): never {
  throw new LifecycleIdentityReviewError(message);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    review("Subscription identity has an invalid object shape.");
  return value as Record<string, unknown>;
}
function objectId(value: unknown) {
  return id.parse(typeof value === "string" ? value : record(value).id);
}
function metadataOwner(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const owner = record(value).userId;
  return owner === undefined ? null : z.uuid().parse(owner);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => JSON.stringify(key) + ":" + canonical(child))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
function applicationKey(eventId: string) {
  return `pro-subscription-event:${eventId}`;
}
function effectKey(eventId: string) {
  return `pro-subscription-expiry-effect:${eventId}`;
}
function reviewKey(kind: "event" | "expiry", reference: string) {
  return `pro-subscription-${kind}-review:${createHash("sha256").update(reference).digest("hex")}`;
}
function expectedOutbound(source: Source, userId: string): Outbound {
  const deleted = source.eventType === "customer.subscription.deleted";
  return {
    id: `${deleted ? "subscription-expired" : "invoice-payment-failed"}:${source.eventId}`,
    name: deleted ? "subscription/expired" : "subscription/payment-failed",
    data: {
      userId,
      customerId: source.sourceIdentity.customerId,
      subscriptionId: source.sourceIdentity.subscriptionId,
      sourceStripeEventId: source.eventId,
    },
  };
}
function requireOwner(identity: Source["sourceIdentity"], userId: string) {
  for (const owner of [
    identity.metadataUserId,
    identity.parentMetadataUserId,
  ]) {
    if (owner !== null && owner !== userId)
      review("Subscription ownership metadata conflicts with its local owner.");
  }
}
function snapshot(event: Stripe.Event): Source | null {
  id.parse(event.id);
  eventType.parse(event.type);
  const object = record(event.data.object);
  let subscriptionId: string;
  let parentMetadataUserId: string | null = null;
  if (event.type === "customer.subscription.deleted") {
    if (object.object !== "subscription")
      review("Deleted subscription event has an invalid object type.");
    subscriptionId = id.parse(object.id);
  } else {
    if (object.object !== "invoice")
      review("Failed invoice event has an invalid object type.");
    if (object.parent === null || object.parent === undefined) return null;
    const parent = record(object.parent);
    if (parent.type === "quote_details") return null;
    if (parent.type !== "subscription_details")
      review("Failed invoice has an unknown parent type.");
    const details = record(parent.subscription_details);
    subscriptionId = objectId(details.subscription);
    parentMetadataUserId = metadataOwner(details.metadata);
  }
  return sourceSchema.parse({
    eventId: event.id,
    eventType: event.type,
    eventCreated: event.created,
    sourceObjectId: object.id,
    sourceIdentity: {
      customerId: objectId(object.customer),
      subscriptionId,
      metadataUserId: metadataOwner(object.metadata),
      parentMetadataUserId,
    },
  });
}
function validateReceipt(row: Audit): Receipt {
  const parsed = receiptSchema.safeParse(row.metadata);
  if (!parsed.success)
    review("Subscription application receipt has an invalid shape.");
  const value = parsed.data;
  if (
    row.actorType !== "provider" ||
    row.actorId !== null ||
    row.action !== "subscription.lifecycle_applied" ||
    row.entityType !== "pro_subscription" ||
    row.entityId !== value.userId ||
    row.idempotencyKey !== applicationKey(value.eventId)
  )
    review("Subscription application receipt ownership is invalid.");
  if (
    value.customerId !== value.sourceIdentity.customerId ||
    value.subscriptionId !== value.sourceIdentity.subscriptionId ||
    value.outcome !==
      (value.eventType === "customer.subscription.deleted"
        ? "deleted"
        : "past_due") ||
    (value.eventType === "customer.subscription.deleted" &&
      value.sourceObjectId !== value.subscriptionId)
  )
    review("Subscription application receipt identity is inconsistent.");
  requireOwner(value.sourceIdentity, value.userId);
  if (
    canonical(value.outbound) !==
    canonical(expectedOutbound(value, value.userId))
  )
    review(
      "Subscription application receipt has a conflicting outbound event.",
    );
  return value;
}
async function findReceipt(executor: Executor, eventId: string) {
  const conflicting = await executor.query.auditEvents.findFirst({
    where: eq(auditEvents.idempotencyKey, adoptionKey(eventId)), columns: { id: true },
  });
  if (conflicting) review("A lifecycle event ID conflicts with an existing subscription adoption receipt.");
  const row = await executor.query.auditEvents.findFirst({
    where: eq(auditEvents.idempotencyKey, applicationKey(eventId)),
  });
  return row ? { row, value: validateReceipt(row) } : null;
}
function requireSameSource(value: Receipt, source: Source | null) {
  if (
    !source ||
    canonical(
      sourceSchema.parse({
        eventId: value.eventId,
        eventType: value.eventType,
        eventCreated: value.eventCreated,
        sourceObjectId: value.sourceObjectId,
        sourceIdentity: value.sourceIdentity,
      }),
    ) !== canonical(source)
  )
    review(
      "A subscription event ID was reused with conflicting source identity.",
    );
}
async function replay(
  executor: Executor,
  eventId: string,
  source: Source | null,
) {
  const receipt = await findReceipt(executor, eventId);
  if (receipt) requireSameSource(receipt.value, source);
  return receipt;
}
async function ownerRows(executor: Executor, customerId: string) {
  return executor
    .select({ user: users, revision: sql<string>`xmin::text` })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(2);
}
async function currentOwner(executor: Executor, source: Source) {
  const owners = await ownerRows(executor, source.sourceIdentity.customerId);
  if (owners.length > 1)
    review("Multiple local accounts share this billing customer.");
  const owner = owners[0];
  if (!owner) {
    const claimed =
      source.sourceIdentity.metadataUserId ??
      source.sourceIdentity.parentMetadataUserId;
    if (claimed) {
      const user = await executor.query.users.findFirst({
        where: eq(users.id, claimed),
        columns: { stripeSubscriptionId: true },
      });
      if (user?.stripeSubscriptionId === source.sourceIdentity.subscriptionId)
        review("Current subscription and event customer ownership conflict.");
    }
    return null;
  }
  requireOwner(source.sourceIdentity, owner.user.id);
  return owner.user.stripeSubscriptionId ===
    source.sourceIdentity.subscriptionId
    ? owner
    : null;
}
function validateSubscription(value: unknown, source: Source, userId: string) {
  const subscription = record(value);
  if (
    subscription.object !== "subscription" ||
    subscription.id !== source.sourceIdentity.subscriptionId ||
    objectId(subscription.customer) !== source.sourceIdentity.customerId ||
    typeof subscription.status !== "string" ||
    !subscriptionStatuses.has(subscription.status)
  )
    review(
      "Current provider subscription identity or status cannot be verified.",
    );
  const owner = metadataOwner(subscription.metadata);
  if (owner !== null && owner !== userId)
    review("Current provider subscription belongs to another account.");
  return subscription.status;
}
async function providerAllows(
  provider: Provider,
  source: Source,
  userId: string,
) {
  if (source.eventType === "invoice.payment_failed") {
    const invoice = record(
      await provider.invoices.retrieve(source.sourceObjectId),
    );
    if (
      invoice.object !== "invoice" ||
      invoice.id !== source.sourceObjectId ||
      objectId(invoice.customer) !== source.sourceIdentity.customerId
    )
      review(
        "Current invoice does not match the requested resource or customer.",
      );
    const parent = record(invoice.parent);
    if (parent.type !== "subscription_details")
      review("Current invoice no longer identifies the expected subscription.");
    const details = record(parent.subscription_details);
    if (objectId(details.subscription) !== source.sourceIdentity.subscriptionId)
      review("Current invoice identifies another subscription.");
    requireOwner(
      {
        ...source.sourceIdentity,
        metadataUserId: metadataOwner(invoice.metadata),
        parentMetadataUserId: metadataOwner(details.metadata),
      },
      userId,
    );
    if (
      typeof invoice.status !== "string" ||
      !invoiceStatuses.has(invoice.status)
    )
      review("Current invoice status cannot be verified.");
    if (invoice.status !== "open") return false;
    if (
      typeof invoice.amount_remaining !== "number" ||
      !Number.isSafeInteger(invoice.amount_remaining) ||
      invoice.amount_remaining < 0
    )
      review("Current invoice unpaid amount cannot be verified.");
    if (invoice.amount_remaining === 0) return false;
  }
  const status = validateSubscription(
    await provider.subscriptions.retrieve(source.sourceIdentity.subscriptionId),
    source,
    userId,
  );
  if (source.eventType === "invoice.payment_failed")
    return status === "past_due";
  if (status !== "canceled" && status !== "incomplete_expired")
    review("A deleted subscription is not currently confirmed terminal.");
  return true;
}
async function lockUser(transaction: Transaction, userId: string) {
  // Same lock order as durable checkout. No provider request occurs under these locks.
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`pro-checkout:${userId}`}, 0))`,
  );
  const [row] = await transaction
    .select({ user: users, revision: sql<string>`xmin::text` })
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  return row;
}
function reason(error: unknown) {
  return error instanceof LifecycleIdentityReviewError
    ? error.message
    : "Subscription lifecycle state could not be confirmed.";
}
async function saveReview(
  database: Database,
  kind: "event" | "expiry",
  reference: string,
  message: string,
  userId?: string,
) {
  await openReconciliationCase(database, {
    caseKey: reviewKey(kind, reference),
    type: "webhook_failure",
    source: kind === "event" ? "stripe" : "inngest",
    severity: "high",
    title:
      kind === "event"
        ? "Subscription event needs reconciliation"
        : "Subscription expiry needs reconciliation",
    summary: message,
    externalReference: reference.slice(0, 255),
    details: {
      ...(userId ? { userId } : {}),
      ...(kind === "event" ? { eventId: reference } : { jobId: reference }),
    },
  });
}

/** Applies only an already-bound subscription identity. Adoption is a separate workflow. */
export async function applySubscriptionIdentityEvent(
  database: Database,
  event: Stripe.Event,
  { provider }: { provider: Provider },
): Promise<Outbound | null> {
  let observedUserId: string | undefined;
  const reference =
    typeof event.id === "string" ? event.id : "missing-event-id";
  try {
    const source = snapshot(event);
    const committed = await replay(database, event.id, source);
    if (committed) return committed.value.outbound;
    if (!source) return null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const owner = await currentOwner(database, source);
      if (!owner) return null;
      observedUserId = owner.user.id;
      if (!(await providerAllows(provider, source, owner.user.id))) return null;
      const result = await database.transaction(async (transaction) => {
        const current = await lockUser(transaction, owner.user.id);
        const existing = await replay(transaction, source.eventId, source);
        if (existing) return existing.value.outbound;
        if (
          !current ||
          current.user.stripeCustomerId !== source.sourceIdentity.customerId ||
          current.user.stripeSubscriptionId !==
            source.sourceIdentity.subscriptionId
        )
          return null;
        const owners = await ownerRows(
          transaction,
          source.sourceIdentity.customerId,
        );
        if (owners.length !== 1 || owners[0].user.id !== current.user.id)
          review(
            "Billing customer ownership became ambiguous during event application.",
          );
        if (current.revision !== owner.revision) return RETRY_READ;
        const receipt: Receipt = {
          version: 1,
          ...source,
          userId: owner.user.id,
          customerId: source.sourceIdentity.customerId,
          subscriptionId: source.sourceIdentity.subscriptionId,
          outcome:
            source.eventType === "customer.subscription.deleted"
              ? "deleted"
              : "past_due",
          outbound: expectedOutbound(source, owner.user.id),
        };
        const eventAt = new Date(source.eventCreated * 1000);
        const watermark =
          current.user.stripeSubscriptionEventCreatedAt &&
          current.user.stripeSubscriptionEventCreatedAt > eventAt
            ? current.user.stripeSubscriptionEventCreatedAt
            : eventAt;
        await transaction
          .update(users)
          .set({
            ...(receipt.outcome === "deleted"
              ? {
                  proStatus: "free",
                  stripeSubscriptionId: null,
                  proExpiresAt: null,
                  proStartedAt: null,
                }
              : { proStatus: "past_due" }),
            stripeSubscriptionEventCreatedAt: watermark,
            updatedAt: new Date(),
          })
          .where(eq(users.id, owner.user.id));
        await appendAuditEvent(transaction, {
          actorType: "provider",
          action: "subscription.lifecycle_applied",
          entityType: "pro_subscription",
          entityId: owner.user.id,
          idempotencyKey: applicationKey(source.eventId),
          summary: "Applied a verified current subscription lifecycle event.",
          metadata: JSON.parse(JSON.stringify(receipt)) as Record<
            string,
            unknown
          >,
        });
        const persisted = await replay(transaction, source.eventId, source);
        if (!persisted || canonical(persisted.value) !== canonical(receipt))
          review(
            "Committed subscription receipt does not match the applied decision.",
          );
        return persisted.value.outbound;
      });
      if (result === RETRY_READ) continue;
      await resolveReconciliationCaseByKey(database, {
        caseKey: reviewKey("event", reference),
        resolution:
          "Subscription event reconciled against its current identity.",
      });
      return result;
    }
    review(
      "Subscription state changed repeatedly while confirming the provider result.",
    );
  } catch (error) {
    const message = reason(error);
    await saveReview(database, "event", reference, message, observedUserId);
    throw new LifecycleIdentityReviewError(message);
  }
}

type ExpiryJob = { id?: string; name?: string; data: unknown };
type ExpiryOutcome = {
  outcome: "applied" | "replayed" | "obsolete" | "review";
};
function expiryReference(job: ExpiryJob) {
  if (typeof job.id === "string" && job.id) return job.id;
  const data =
    job.data && typeof job.data === "object"
      ? (job.data as Record<string, unknown>)
      : {};
  return canonical({
    name: typeof job.name === "string" ? job.name : null,
    userId: typeof data.userId === "string" ? data.userId : null,
    sourceStripeEventId:
      typeof data.sourceStripeEventId === "string"
        ? data.sourceStripeEventId
        : null,
  });
}
function safeJobUser(job: ExpiryJob) {
  const data =
    job.data && typeof job.data === "object"
      ? (job.data as Record<string, unknown>)
      : {};
  const parsed = z.uuid().safeParse(data.userId);
  return parsed.success ? parsed.data : undefined;
}
function requireExpiryReceipt(
  receipt: { row: Audit; value: Receipt } | null,
  data: LifecycleData,
) {
  if (
    !receipt ||
    receipt.value.outcome !== "deleted" ||
    canonical(receipt.value.outbound.data) !== canonical(data)
  )
    review(
      "Expiry job does not match a committed subscription deletion receipt.",
    );
  return receipt;
}
function validateEffect(
  row: Audit,
  application: { row: Audit; value: Receipt },
  data: LifecycleData,
) {
  const parsed = effectSchema.safeParse(row.metadata);
  const expected = {
    version: 1,
    applicationReceiptId: application.row.id,
    ...data,
  };
  if (
    !parsed.success ||
    canonical(parsed.data) !== canonical(expected) ||
    row.actorType !== "system" ||
    row.actorId !== null ||
    row.action !== "subscription.expiry_effect_applied" ||
    row.entityType !== "pro_subscription" ||
    row.entityId !== data.userId ||
    row.idempotencyKey !== effectKey(data.sourceStripeEventId)
  )
    review("Expiry effect receipt conflicts with its subscription identity.");
}

/** Legacy identity-free events are visible review cases, never authority to disable settings. */
export async function applyVerifiedProExpiry(
  database: Database,
  job: ExpiryJob,
): Promise<ExpiryOutcome> {
  const reference = expiryReference(job);
  const userId = safeJobUser(job);
  try {
    const parsed = lifecycleDataSchema.safeParse(job.data);
    if (job.name !== "subscription/expired" || !parsed.success)
      review(
        "Expiry job is missing its verified subscription identity. Review the legacy event before applying effects.",
      );
    const data = parsed.data;
    requireExpiryReceipt(
      await findReceipt(database, data.sourceStripeEventId),
      data,
    );
    const result = await database.transaction(
      async (transaction): Promise<ExpiryOutcome> => {
        const current = await lockUser(transaction, data.userId);
        const application = requireExpiryReceipt(
          await findReceipt(transaction, data.sourceStripeEventId),
          data,
        );
        const effect = await transaction.query.auditEvents.findFirst({
          where: eq(
            auditEvents.idempotencyKey,
            effectKey(data.sourceStripeEventId),
          ),
        });
        if (effect) {
          validateEffect(effect, application, data);
          return { outcome: "replayed" };
        }
        if (
          !current ||
          current.user.stripeCustomerId !== data.customerId ||
          current.user.stripeSubscriptionId !== null ||
          isPro(current.user)
        )
          return { outcome: "obsolete" };
        await transaction
          .update(agentConfigs)
          .set({
            offerAutoEnabled: false,
            monitorEnabled: false,
            repricingEnabled: false,
            updatedAt: new Date(),
          })
          .where(eq(agentConfigs.userId, data.userId));
        await transaction.insert(notifications).values({
          userId: data.userId,
          type: "system",
          title: "PlankMarket Pro ended",
          message:
            "Your Pro subscription has ended and agent automation is now disabled. Your marketplace account and saved data remain available.",
          data: { subscriptionEvent: "expired" },
        });
        await appendAuditEvent(transaction, {
          actorType: "system",
          action: "subscription.expiry_effect_applied",
          entityType: "pro_subscription",
          entityId: data.userId,
          idempotencyKey: effectKey(data.sourceStripeEventId),
          summary:
            "Applied verified subscription expiry settings and notification atomically.",
          metadata: {
            version: 1,
            applicationReceiptId: application.row.id,
            ...data,
          },
        });
        const persisted = await transaction.query.auditEvents.findFirst({
          where: eq(
            auditEvents.idempotencyKey,
            effectKey(data.sourceStripeEventId),
          ),
        });
        if (!persisted) review("Expiry effect receipt was not persisted.");
        validateEffect(persisted, application, data);
        return { outcome: "applied" };
      },
    );
    await resolveReconciliationCaseByKey(database, {
      caseKey: reviewKey("expiry", reference),
      resolution:
        "Subscription expiry reconciled against its committed identity and current access.",
    });
    return result;
  } catch (error) {
    const message = reason(error);
    await saveReview(database, "expiry", reference, message, userId);
    if (error instanceof LifecycleIdentityReviewError)
      return { outcome: "review" };
    throw new LifecycleIdentityReviewError(message);
  }
}

type AdoptionProvider = Pick<
  Stripe,
  "subscriptions" | "subscriptionItems" | "checkout"
>;
type CheckoutEvidence = Awaited<ReturnType<typeof readProCheckoutEvidence>>;
const adoptionStatusSchema = z.enum([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
  "unpaid",
]);
const adoptionSourceSchema = z
  .object({
    eventId: id,
    eventType: z.enum([
      "customer.subscription.created",
      "customer.subscription.updated",
    ]),
    eventCreated: z.number().int().nonnegative().max(8_640_000_000_000),
    sourceObjectId: id,
    customerId: id,
    subscriptionId: id,
    metadataUserId: z.uuid().nullable(),
    customerMetadataUserId: z.uuid().nullable(),
    metadataAttemptId: z.uuid().nullable(),
    status: adoptionStatusSchema,
  })
  .strict();
type AdoptionSource = z.infer<typeof adoptionSourceSchema>;
const adoptionOutboundSchema = z
  .object({
    id: z.string().min(1).max(255),
    name: z.enum(["subscription/activated", "subscription/payment-failed"]),
    data: z.object({ userId: z.uuid() }).strict(),
  })
  .strict();
type AdoptionOutbound = z.infer<typeof adoptionOutboundSchema>;
const admissionSchema = z
  .object({
    kind: z.enum(["current", "intent", "legacy"]),
    attemptId: z.uuid().nullable(),
    sessionId: id.nullable(),
    previousSubscriptionId: id.nullable(),
    ledgerSequence: z.number().int().nonnegative(),
    ledgerAttemptId: z.uuid().nullable(),
  })
  .strict();
type Admission = z.infer<typeof admissionSchema>;
const adoptionAppliedSchema = z
  .object({
    proStatus: z.enum(["active", "trialing", "past_due", "cancelled", "free"]),
    stripeSubscriptionId: id,
    stripeCustomerId: id,
    proStartedAt: z.iso.datetime().nullable(),
    proExpiresAt: z.iso.datetime().nullable(),
    stripeSubscriptionEventCreatedAt: z.iso.datetime(),
  })
  .strict();
const adoptionReceiptSchema = z
  .object({
    version: z.literal(1),
    source: adoptionSourceSchema,
    userId: z.uuid(),
    admission: admissionSchema,
    applied: adoptionAppliedSchema,
    outbound: adoptionOutboundSchema.nullable(),
  })
  .strict();
type AdoptionReceipt = z.infer<typeof adoptionReceiptSchema>;
function adoptionKey(eventId: string) {
  return `pro-subscription-adoption:${eventId}`;
}
function metadataAttempt(value: unknown) {
  if (value === null || value === undefined) return null;
  const attempt = record(value).proCheckoutAttemptId;
  return attempt === undefined ? null : z.uuid().parse(attempt);
}
function expandedCustomerOwner(value: unknown) {
  return value && typeof value === "object"
    ? metadataOwner(record(value).metadata)
    : null;
}
function requireAdoptionOwner(owner: string | null, userId: string) {
  if (owner !== null && owner !== userId)
    review(
      "Subscription adoption ownership metadata conflicts with its local owner.",
    );
}
function adoptionSnapshot(event: Stripe.Event): AdoptionSource {
  const object = record(event.data.object);
  if (object.object !== "subscription")
    review("Subscription adoption has an invalid source object.");
  return adoptionSourceSchema.parse({
    eventId: event.id,
    eventType: event.type,
    eventCreated: event.created,
    sourceObjectId: object.id,
    subscriptionId: object.id,
    customerId: objectId(object.customer),
    metadataUserId: metadataOwner(object.metadata),
    customerMetadataUserId: expandedCustomerOwner(object.customer),
    metadataAttemptId: metadataAttempt(object.metadata),
    status: object.status,
  });
}
function adoptionOutbound(
  source: AdoptionSource,
  userId: string,
  status: AdoptionReceipt["applied"]["proStatus"],
): AdoptionOutbound | null {
  if (
    source.eventType === "customer.subscription.created" &&
    (status === "active" || status === "trialing")
  )
    return {
      id: `subscription-activated:${source.eventId}`,
      name: "subscription/activated",
      data: { userId },
    };
  if (
    source.eventType === "customer.subscription.updated" &&
    status === "past_due"
  )
    return {
      id: `subscription-payment-failed:${source.eventId}`,
      name: "subscription/payment-failed",
      data: { userId },
    };
  return null;
}
function validateAdoptionReceipt(row: Audit): AdoptionReceipt {
  const value = adoptionReceiptSchema.parse(row.metadata);
  if (
    row.actorType !== "provider" ||
    row.actorId !== null ||
    row.action !== "subscription.adoption_applied" ||
    row.entityType !== "pro_subscription" ||
    row.entityId !== value.userId ||
    row.idempotencyKey !== adoptionKey(value.source.eventId) ||
    value.source.sourceObjectId !== value.source.subscriptionId ||
    value.applied.stripeSubscriptionId !== value.source.subscriptionId ||
    value.applied.stripeCustomerId !== value.source.customerId
  )
    review("Subscription adoption receipt identity is invalid.");
  requireAdoptionOwner(value.source.metadataUserId, value.userId);
  requireAdoptionOwner(value.source.customerMetadataUserId, value.userId);
  if (
    (value.admission.kind === "intent" && !value.admission.attemptId) ||
    (value.admission.kind === "legacy" && !value.admission.sessionId) ||
    canonical(value.outbound) !==
      canonical(
        adoptionOutbound(value.source, value.userId, value.applied.proStatus),
      )
  )
    review(
      "Subscription adoption receipt decision or outbound event is inconsistent.",
    );
  return value;
}
async function replayAdoption(executor: Executor, source: AdoptionSource) {
  const conflicting = await executor.query.auditEvents.findFirst({
    where: eq(auditEvents.idempotencyKey, applicationKey(source.eventId)),
    columns: { id: true },
  });
  if (conflicting)
    review(
      "A subscription event ID conflicts with an existing lifecycle receipt.",
    );
  const row = await executor.query.auditEvents.findFirst({
    where: eq(auditEvents.idempotencyKey, adoptionKey(source.eventId)),
  });
  if (!row) return null;
  const value = validateAdoptionReceipt(row);
  if (canonical(value.source) !== canonical(source))
    review(
      "A subscription event ID was reused with conflicting adoption identity.",
    );
  return value;
}
async function verifiedDeletion(
  executor: Executor,
  userId: string,
  customerId: string,
  subscriptionId: string,
) {
  const rows = await executor.query.auditEvents.findMany({
    where: and(
      eq(auditEvents.action, "subscription.lifecycle_applied"),
      eq(auditEvents.entityType, "pro_subscription"),
      eq(auditEvents.entityId, userId),
      sql`${auditEvents.metadata}->>'subscriptionId' = ${subscriptionId}`,
    ),
  });
  return rows.some((row) => {
    const value = validateReceipt(row);
    return (
      value.outcome === "deleted" &&
      value.customerId === customerId &&
      value.subscriptionId === subscriptionId
    );
  });
}
async function adoptionInventory(load: (cursor?: string) => Promise<unknown>) {
  const rows: Record<string, unknown>[] = [],
    seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const result = record(await load(cursor));
    if (
      result.object !== "list" ||
      !Array.isArray(result.data) ||
      typeof result.has_more !== "boolean" ||
      result.data.length > 100
    )
      review("Subscription adoption inventory has an invalid shape.");
    for (const item of result.data) {
      const row = record(item),
        rowId = id.parse(row.id);
      if (seen.has(rowId))
        review("Subscription adoption inventory has repeated identities.");
      seen.add(rowId);
      rows.push(row);
    }
    if (!result.has_more) return rows;
    if (!result.data.length)
      review("Subscription adoption inventory is incomplete.");
    cursor = id.parse(rows.at(-1)!.id);
  }
  return review(
    "Subscription adoption inventory exceeds its reconciliation limit.",
  );
}
function inspectAdoptionSubscription(
  value: unknown,
  subscriptionId: string,
  customerId: string,
  userId: string,
) {
  const subscription = record(value);
  if (
    subscription.object !== "subscription" ||
    subscription.id !== subscriptionId ||
    objectId(subscription.customer) !== customerId
  )
    review("Subscription adoption provider identity cannot be verified.");
  const status = adoptionStatusSchema.parse(subscription.status);
  const metadataUserId = metadataOwner(subscription.metadata);
  requireAdoptionOwner(metadataUserId, userId);
  requireAdoptionOwner(expandedCustomerOwner(subscription.customer), userId);
  return {
    status,
    attemptId: metadataAttempt(subscription.metadata),
    metadataUserId,
  };
}
const terminalSubscription = (status: string) =>
  status === "canceled" || status === "incomplete_expired";
const proPrices = new Set<string>(Object.values(STRIPE_PRO_PRICES));
async function adoptionItems(
  provider: AdoptionProvider,
  source: AdoptionSource,
) {
  const rows = await adoptionInventory((cursor) =>
    provider.subscriptionItems.list({
      subscription: source.subscriptionId,
      limit: 100,
      ...(cursor ? { starting_after: cursor } : {}),
    }),
  );
  const matching: { priceId: string; periodEnd: number }[] = [];
  for (const row of rows) {
    if (
      row.object !== "subscription_item" ||
      row.subscription !== source.subscriptionId
    )
      review("Subscription item ownership cannot be verified.");
    const price = record(row.price);
    if (price.object !== "price")
      review("Subscription item price cannot be verified.");
    const priceId = id.parse(price.id);
    if (!proPrices.has(priceId)) continue;
    const start = z
      .number()
      .int()
      .nonnegative()
      .max(8_640_000_000_000)
      .parse(row.current_period_start);
    const end = z
      .number()
      .int()
      .nonnegative()
      .max(8_640_000_000_000)
      .parse(row.current_period_end);
    if (end < start) review("Subscription item period is invalid.");
    matching.push({ priceId, periodEnd: end });
  }
  return matching;
}
async function legacyAdoptionSession(
  provider: AdoptionProvider,
  source: AdoptionSource,
  userId: string,
  evidence: CheckoutEvidence,
) {
  const sessions = await adoptionInventory((cursor) =>
    provider.checkout.sessions.list({
      customer: source.customerId,
      limit: 100,
      ...(cursor ? { starting_after: cursor } : {}),
    }),
  );
  const matches: string[] = [];
  for (const row of sessions) {
    if (
      row.object !== "checkout.session" ||
      objectId(row.customer) !== source.customerId ||
      !["subscription", "payment", "setup"].includes(String(row.mode)) ||
      !["open", "complete", "expired"].includes(String(row.status))
    )
      review("Legacy checkout inventory identity cannot be verified.");
    requireAdoptionOwner(metadataOwner(row.metadata), userId);
    requireAdoptionOwner(expandedCustomerOwner(row.customer), userId);
    if (row.mode !== "subscription" || row.status === "expired") continue;
    if (row.status === "open")
      review("Another open checkout prevents legacy subscription adoption.");
    const subscriptionId = objectId(row.subscription);
    if (subscriptionId === source.subscriptionId)
      matches.push(id.parse(row.id));
    else {
      const other = inspectAdoptionSubscription(
        await provider.subscriptions.retrieve(subscriptionId),
        subscriptionId,
        source.customerId,
        userId,
      );
      if (!terminalSubscription(other.status))
        review(
          "A competing completed checkout prevents legacy subscription adoption.",
        );
    }
  }
  if (matches.length !== 1)
    review(
      "Legacy subscription requires one exact completed marketplace checkout.",
    );
  const sessionId = matches[0];
  const session = record(await provider.checkout.sessions.retrieve(sessionId));
  if (
    session.object !== "checkout.session" ||
    session.id !== sessionId ||
    session.mode !== "subscription" ||
    session.status !== "complete" ||
    objectId(session.customer) !== source.customerId ||
    objectId(session.subscription) !== source.subscriptionId
  )
    review(
      "Legacy checkout is not currently confirmed complete for this subscription.",
    );
  requireAdoptionOwner(metadataOwner(session.metadata), userId);
  requireAdoptionOwner(expandedCustomerOwner(session.customer), userId);
  if (metadataAttempt(session.metadata) !== null)
    review("A modern checkout cannot use legacy adoption authority.");
  const intent = evidence.unresolved;
  if (
    intent &&
    (!intent.acceptedLegacy ||
      intent.acceptedSessionId !== sessionId ||
      intent.customerId !== source.customerId ||
      intent.checkoutRequested)
  )
    review(
      "A different checkout intent prevents legacy subscription adoption.",
    );
  const lines = await adoptionInventory((cursor) =>
    provider.checkout.sessions.listLineItems(sessionId, {
      limit: 100,
      ...(cursor ? { starting_after: cursor } : {}),
    }),
  );
  let hasPro = false;
  for (const row of lines) {
    if (row.object !== "item")
      review("Legacy checkout line item identity cannot be verified.");
    const price = record(row.price);
    if (price.object !== "price")
      review("Legacy checkout price cannot be verified.");
    const priceId = id.parse(price.id);
    if (proPrices.has(priceId) && (!intent || intent.priceId === priceId))
      hasPro = true;
  }
  if (!hasPro)
    review("Legacy checkout does not establish the required Pro plan.");
  const subscriptions = await adoptionInventory((cursor) =>
    provider.subscriptions.list({
      customer: source.customerId,
      status: "all",
      limit: 100,
      ...(cursor ? { starting_after: cursor } : {}),
    }),
  );
  if (!subscriptions.some((row) => row.id === source.subscriptionId))
    review("Legacy subscription inventory is missing the exact target.");
  for (const row of subscriptions) {
    const subscriptionId = id.parse(row.id);
    inspectAdoptionSubscription(row, subscriptionId, source.customerId, userId);
    if (subscriptionId === source.subscriptionId) continue;
    const other = inspectAdoptionSubscription(
      await provider.subscriptions.retrieve(subscriptionId),
      subscriptionId,
      source.customerId,
      userId,
    );
    if (!terminalSubscription(other.status))
      review("Competing subscriptions require legacy billing reconciliation.");
  }
  return sessionId;
}
type AdoptionOwner = Awaited<ReturnType<typeof ownerRows>>[number];
async function decideAdoption(
  database: Database,
  provider: AdoptionProvider,
  source: AdoptionSource,
  owner: AdoptionOwner,
  evidence: CheckoutEvidence,
) {
  const userId = owner.user.id;
  const subscription = inspectAdoptionSubscription(
    await provider.subscriptions.retrieve(source.subscriptionId),
    source.subscriptionId,
    source.customerId,
    userId,
  );
  if (
    source.metadataAttemptId !== null &&
    source.metadataAttemptId !== subscription.attemptId
  )
    review("Subscription attempt metadata conflicts with its signed source.");
  const same = owner.user.stripeSubscriptionId === source.subscriptionId;
  if (!same && terminalSubscription(subscription.status)) return null;
  const items = await adoptionItems(provider, source);
  if (!items.length) {
    if (same)
      review("The bound subscription no longer establishes a Pro plan.");
    return null;
  }
  const base: Admission = {
    kind: "current",
    attemptId: subscription.attemptId,
    sessionId: null,
    previousSubscriptionId: owner.user.stripeSubscriptionId,
    ledgerSequence: evidence.latestSequence,
    ledgerAttemptId: evidence.latestAttemptId,
  };
  let admission = base;
  if (!same) {
    if (
      await verifiedDeletion(
        database,
        userId,
        source.customerId,
        source.subscriptionId,
      )
    )
      review(
        "A previously ended subscription cannot be newly adopted from a delayed event.",
      );
    const intent = evidence.unresolved;
    if (subscription.attemptId !== null) {
      if (
        subscription.metadataUserId !== userId ||
        source.metadataUserId !== userId
      )
        review(
          "A new checkout subscription requires explicit signed and current owner metadata.",
        );
      if (
        !intent ||
        intent.attemptId !== subscription.attemptId ||
        !intent.checkoutRequested ||
        intent.customerId !== source.customerId ||
        !items.some((item) => item.priceId === intent.priceId)
      )
        review(
          "Subscription adoption has no matching current checkout request authority.",
        );
      if (owner.user.stripeSubscriptionId !== intent.previousSubscriptionId) {
        if (
          owner.user.stripeSubscriptionId !== null ||
          intent.previousSubscriptionId === null
        )
          return null;
        if (
          !(await verifiedDeletion(
            database,
            userId,
            source.customerId,
            intent.previousSubscriptionId,
          ))
        )
          review(
            "The checkout predecessor was cleared without verified terminal evidence.",
          );
      }
      if (intent.previousSubscriptionId) {
        const previous = inspectAdoptionSubscription(
          await provider.subscriptions.retrieve(intent.previousSubscriptionId),
          intent.previousSubscriptionId,
          source.customerId,
          userId,
        );
        if (!terminalSubscription(previous.status))
          review(
            "The checkout predecessor is not currently confirmed terminal.",
          );
      }
      admission = {
        ...base,
        kind: "intent",
        attemptId: intent.attemptId,
        sessionId: intent.acceptedSessionId,
      };
    } else {
      if (owner.user.stripeSubscriptionId) {
        const previous = inspectAdoptionSubscription(
          await provider.subscriptions.retrieve(
            owner.user.stripeSubscriptionId,
          ),
          owner.user.stripeSubscriptionId,
          source.customerId,
          userId,
        );
        if (!terminalSubscription(previous.status)) return null;
      }
      const sessionId = await legacyAdoptionSession(
        provider,
        source,
        userId,
        evidence,
      );
      admission = {
        ...base,
        kind: "legacy",
        attemptId: intent?.attemptId ?? null,
        sessionId,
      };
    }
  }
  let periodEnd: number | null = null;
  if (subscription.status === "canceled") {
    const ends = new Set(items.map((item) => item.periodEnd));
    if (ends.size !== 1)
      review("Pro subscription cancellation has conflicting service periods.");
    periodEnd = items[0].periodEnd;
  }
  return { status: subscription.status, admission, periodEnd };
}

/** Reconciles existing identities and admits new ones only from validated checkout authority. */
export async function applySubscriptionAdoptionEvent(
  database: Database,
  event: Stripe.Event,
  { provider }: { provider: AdoptionProvider },
): Promise<AdoptionOutbound | null> {
  let observedUserId: string | undefined;
  const reference =
    typeof event.id === "string" ? event.id : "missing-event-id";
  try {
    const source = adoptionSnapshot(event);
    const committed = await replayAdoption(database, source);
    if (committed) return committed.outbound;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const owners = await ownerRows(database, source.customerId);
      if (owners.length !== 1)
        review(
          "Subscription adoption needs one uniquely mapped billing customer owner.",
        );
      const owner = owners[0];
      observedUserId = owner.user.id;
      requireAdoptionOwner(source.metadataUserId, owner.user.id);
      requireAdoptionOwner(source.customerMetadataUserId, owner.user.id);
      const evidence = await readProCheckoutEvidence(database, owner.user.id);
      const decision = await decideAdoption(
        database,
        provider,
        source,
        owner,
        evidence,
      );
      if (!decision) return null;
      const result = await database.transaction(async (transaction) => {
        const current = await lockUser(transaction, owner.user.id);
        const existing = await replayAdoption(transaction, source);
        if (existing) return existing.outbound;
        if (!current || current.user.stripeCustomerId !== source.customerId)
          return null;
        const currentOwners = await ownerRows(transaction, source.customerId);
        if (
          currentOwners.length !== 1 ||
          currentOwners[0].user.id !== owner.user.id
        )
          review(
            "Billing customer ownership became ambiguous during subscription adoption.",
          );
        const freshEvidence = await readProCheckoutEvidence(
          transaction,
          owner.user.id,
        );
        if (
          current.user.stripeSubscriptionId !== owner.user.stripeSubscriptionId
        ) {
          const clearedPredecessor =
            current.user.stripeSubscriptionId === null &&
            evidence.unresolved?.previousSubscriptionId ===
              owner.user.stripeSubscriptionId;
          if (
            current.user.stripeSubscriptionId !== source.subscriptionId &&
            !clearedPredecessor
          )
            return null;
          return RETRY_READ;
        }
        if (
          current.revision !== owner.revision ||
          canonical(freshEvidence) !== canonical(evidence)
        )
          return RETRY_READ;
        const now = new Date(),
          proStatus = mapStripeSubscriptionStatus(decision.status);
        const same =
          current.user.stripeSubscriptionId === source.subscriptionId;
        const activated = proStatus === "active" || proStatus === "trialing";
        const started = same
          ? (current.user.proStartedAt ?? (activated ? now : null))
          : activated
            ? now
            : null;
        const end =
          decision.periodEnd === null
            ? null
            : new Date(decision.periodEnd * 1000);
        const expiry = end && end > now ? end : null;
        const eventAt = new Date(source.eventCreated * 1000);
        const watermark =
          current.user.stripeSubscriptionEventCreatedAt &&
          current.user.stripeSubscriptionEventCreatedAt > eventAt
            ? current.user.stripeSubscriptionEventCreatedAt
            : eventAt;
        const receipt: AdoptionReceipt = {
          version: 1,
          source,
          userId: owner.user.id,
          admission: decision.admission,
          applied: {
            proStatus,
            stripeSubscriptionId: source.subscriptionId,
            stripeCustomerId: source.customerId,
            proStartedAt: started?.toISOString() ?? null,
            proExpiresAt: expiry?.toISOString() ?? null,
            stripeSubscriptionEventCreatedAt: watermark.toISOString(),
          },
          outbound: adoptionOutbound(source, owner.user.id, proStatus),
        };
        await transaction
          .update(users)
          .set({
            proStatus,
            stripeSubscriptionId: source.subscriptionId,
            stripeCustomerId: source.customerId,
            proStartedAt: started,
            proExpiresAt: expiry,
            stripeSubscriptionEventCreatedAt: watermark,
            updatedAt: now,
          })
          .where(eq(users.id, owner.user.id));
        await appendAuditEvent(transaction, {
          actorType: "provider",
          action: "subscription.adoption_applied",
          entityType: "pro_subscription",
          entityId: owner.user.id,
          idempotencyKey: adoptionKey(source.eventId),
          summary:
            "Applied a subscription state from verified checkout ownership.",
          metadata: JSON.parse(JSON.stringify(receipt)) as Record<
            string,
            unknown
          >,
        });
        const persisted = await replayAdoption(transaction, source);
        if (!persisted || canonical(persisted) !== canonical(receipt))
          review("Subscription adoption receipt was not persisted exactly.");
        return persisted.outbound;
      });
      if (result === RETRY_READ) continue;
      await resolveReconciliationCaseByKey(database, {
        caseKey: reviewKey("event", reference),
        resolution:
          "Subscription adoption reconciled against current ownership and checkout authority.",
      });
      return result;
    }
    review(
      "Subscription ownership changed repeatedly while confirming adoption.",
    );
  } catch (error) {
    const message = reason(error);
    await saveReview(database, "event", reference, message, observedUserId);
    throw new LifecycleIdentityReviewError(message);
  }
}
