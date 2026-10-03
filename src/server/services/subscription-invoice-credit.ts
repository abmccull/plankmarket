import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/server/db";
import { agentConfigs, promotionCredits, users } from "@/server/db/schema";
import { PRO_MONTHLY_CREDIT } from "@/lib/pro";
import { STRIPE_PRO_PRICES } from "./subscription-checkout";
import {
  openReconciliationCase,
  resolveReconciliationCaseByKey,
} from "./reconciliation-cases";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;
type Provider = Pick<Stripe, "invoices" | "subscriptions">;
type Outcome = {
  outcome: "applied" | "replayed" | "ineligible";
  creditId?: string;
};
const id = z.string().min(1).max(200);
const seconds = z.number().int().nonnegative().max(8_640_000_000_000);
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const proPrices = new Set<string>(Object.values(STRIPE_PRO_PRICES));
const invoiceStatuses = new Set([
  "draft",
  "open",
  "paid",
  "uncollectible",
  "void",
]);
class InvoiceCreditReviewError extends Error {}
function review(message: string): never {
  throw new InvoiceCreditReviewError(message);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    review("Invoice credit evidence has an invalid object shape.");
  return value as Record<string, unknown>;
}
function objectId(value: unknown, object: string): string {
  if (typeof value === "string") return id.parse(value);
  const expanded = record(value);
  if (expanded.object !== object)
    review("Invoice credit resource type cannot be verified.");
  return id.parse(expanded.id);
}
function metadataOwner(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const owner = record(value).userId;
  return owner === undefined ? null : z.uuid().parse(owner);
}
function customerOwner(value: unknown): string | null {
  return typeof value === "string"
    ? null
    : metadataOwner(record(value).metadata);
}
function requireOwner(value: string | null, userId: string) {
  if (value !== null && value !== userId)
    review("Paid invoice ownership conflicts with its billing customer owner.");
}
function subscriptionParent(
  value: unknown,
): { subscriptionId: string; owner: string | null } | null {
  if (value === null || value === undefined) return null;
  const parent = record(value);
  if (parent.type === "quote_details") return null;
  if (parent.type !== "subscription_details")
    review("Invoice parent type cannot be verified.");
  const details = record(parent.subscription_details);
  return {
    subscriptionId: objectId(details.subscription, "subscription"),
    owner: metadataOwner(details.metadata),
  };
}
async function ownerRows(executor: Executor, customerId: string) {
  return executor
    .select({ id: users.id })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(2);
}
async function invoiceLines(
  provider: Provider,
  invoiceId: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [],
    seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = record(
      await provider.invoices.listLineItems(invoiceId, {
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      }),
    );
    if (
      result.object !== "list" ||
      !Array.isArray(result.data) ||
      typeof result.has_more !== "boolean" ||
      result.data.length > 100
    )
      review("Complete invoice line evidence is unavailable.");
    for (const item of result.data) {
      const row = record(item),
        lineId = id.parse(row.id);
      if (seen.has(lineId))
        review("Invoice line pagination repeated an identity.");
      seen.add(lineId);
      rows.push(row);
    }
    if (!result.has_more) return rows;
    if (!result.data.length)
      review("Invoice line pagination stopped before completion.");
    cursor = id.parse(rows.at(-1)!.id);
  }
  return review("Invoice line evidence exceeds its reconciliation limit.");
}
function expiryForProLines(
  lines: Record<string, unknown>[],
  invoiceId: string,
  subscriptionId: string,
): Date | null {
  const ends = new Set<number>();
  for (const line of lines) {
    if (
      line.object !== "line_item" ||
      objectId(line.invoice, "invoice") !== invoiceId
    )
      review("Invoice line identity cannot be verified.");
    const pricing = record(line.pricing);
    if (pricing.type !== "price_details")
      review("Invoice line price type cannot be verified.");
    const priceId = objectId(record(pricing.price_details).price, "price");
    if (!proPrices.has(priceId)) continue;
    const parent = record(line.parent);
    if (
      parent.type !== "subscription_item_details" &&
      parent.type !== "invoice_item_details"
    )
      review("Invoice line subscription association cannot be verified.");
    const details = record(parent[parent.type]);
    if (
      objectId(details.subscription, "subscription") !== subscriptionId ||
      (line.subscription !== null &&
        line.subscription !== undefined &&
        objectId(line.subscription, "subscription") !== subscriptionId)
    )
      review("Invoice line belongs to another subscription.");
    const period = record(line.period),
      start = seconds.parse(period.start),
      end = seconds.parse(period.end);
    if (end < start) review("Invoice service period ends before it starts.");
    ends.add(end);
  }
  if (ends.size > 1)
    review("Pro invoice lines have conflicting service periods.");
  const end = ends.values().next().value;
  return end === undefined ? null : new Date(end * 1000);
}
function matchingCredit(
  row: typeof promotionCredits.$inferSelect,
  userId: string,
  invoiceId: string,
  expiresAt: Date,
) {
  if (
    row.userId !== userId ||
    row.stripeInvoiceId !== invoiceId ||
    row.source !== "subscription" ||
    row.amount !== PRO_MONTHLY_CREDIT ||
    row.expiresAt.getTime() !== expiresAt.getTime()
  )
    review(
      "Existing invoice credit conflicts with verified invoice ownership or service period.",
    );
  return { outcome: "replayed", creditId: row.id } as const;
}
function reviewKey(eventId: string) {
  return `pro-invoice-credit-review:${createHash("sha256").update(eventId).digest("hex")}`;
}

/** Grants the existing per-invoice benefit only after exact historical invoice ownership is verified. */
export async function applyVerifiedProInvoiceCredit(
  database: Database,
  event: Stripe.Event,
  { provider }: { provider: Provider },
): Promise<Outcome> {
  const reference =
    typeof event.id === "string" ? event.id : "missing-event-id";
  let invoiceId: string | undefined, observedUserId: string | undefined;
  try {
    id.parse(event.id);
    if (event.type !== "invoice.payment_succeeded")
      review("Invoice credit received an unexpected event type.");
    const source = record(event.data.object);
    if (source.object !== "invoice")
      review("Invoice credit source object cannot be verified.");
    invoiceId = id.parse(source.id);
    const customerId = objectId(source.customer, "customer");
    const sourceParent = subscriptionParent(source.parent);
    const invoice = record(await provider.invoices.retrieve(invoiceId));
    if (
      invoice.object !== "invoice" ||
      invoice.id !== invoiceId ||
      objectId(invoice.customer, "customer") !== customerId
    )
      review(
        "Current invoice does not match its signed resource and customer.",
      );
    const parent = subscriptionParent(invoice.parent);
    if (sourceParent?.subscriptionId !== parent?.subscriptionId)
      review("Current invoice subscription conflicts with its signed source.");
    if (
      typeof invoice.status !== "string" ||
      !invoiceStatuses.has(invoice.status)
    )
      review("Current invoice payment status cannot be verified.");
    const amountPaid = money.parse(invoice.amount_paid),
      amountRemaining = money.parse(invoice.amount_remaining);
    void amountPaid;
    if (invoice.status === "paid" && amountRemaining !== 0)
      review("Paid invoice has an inconsistent remaining balance.");
    if (invoice.status !== "paid" || !parent) return { outcome: "ineligible" };
    const owners = await ownerRows(database, customerId);
    if (owners.length !== 1)
      review("Paid invoice needs one uniquely mapped billing customer owner.");
    observedUserId = owners[0].id;
    for (const owner of [
      metadataOwner(source.metadata),
      sourceParent?.owner ?? null,
      customerOwner(source.customer),
      metadataOwner(invoice.metadata),
      parent.owner,
      customerOwner(invoice.customer),
    ])
      requireOwner(owner, observedUserId);
    const subscription = record(
      await provider.subscriptions.retrieve(parent.subscriptionId),
    );
    if (
      subscription.object !== "subscription" ||
      subscription.id !== parent.subscriptionId ||
      objectId(subscription.customer, "customer") !== customerId
    )
      review(
        "Historical subscription does not match the paid invoice customer.",
      );
    requireOwner(metadataOwner(subscription.metadata), observedUserId);
    requireOwner(customerOwner(subscription.customer), observedUserId);
    const expiresAt = expiryForProLines(
      await invoiceLines(provider, invoiceId),
      invoiceId,
      parent.subscriptionId,
    );
    if (!expiresAt) return { outcome: "ineligible" };
    const userId = observedUserId,
      exactInvoiceId = invoiceId;
    const result = await database.transaction(async (transaction) => {
      // Match checkout lock order. All provider reads have completed before entering SQL.
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`pro-checkout:${userId}`}, 0))`,
      );
      const [current] = await transaction
        .select({ id: users.id, customerId: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      const currentOwners = await ownerRows(transaction, customerId);
      if (
        !current ||
        current.customerId !== customerId ||
        currentOwners.length !== 1 ||
        currentOwners[0].id !== userId
      )
        review(
          "Billing customer ownership changed before the invoice credit could be committed.",
        );
      const existing = await transaction.query.promotionCredits.findFirst({
        where: eq(promotionCredits.stripeInvoiceId, exactInvoiceId),
      });
      if (existing)
        return matchingCredit(existing, userId, exactInvoiceId, expiresAt);
      const [inserted] = await transaction
        .insert(promotionCredits)
        .values({
          userId,
          amount: PRO_MONTHLY_CREDIT,
          usedAmount: 0,
          source: "subscription",
          stripeInvoiceId: exactInvoiceId,
          expiresAt,
        })
        .onConflictDoNothing({ target: promotionCredits.stripeInvoiceId })
        .returning();
      if (!inserted) {
        const concurrent = await transaction.query.promotionCredits.findFirst({
          where: eq(promotionCredits.stripeInvoiceId, exactInvoiceId),
        });
        if (!concurrent)
          review("Invoice credit conflict could not be reconciled.");
        return matchingCredit(concurrent, userId, exactInvoiceId, expiresAt);
      }
      await transaction
        .update(agentConfigs)
        .set({ monitorBudgetUsed: 0, updatedAt: new Date() })
        .where(eq(agentConfigs.userId, userId));
      return { outcome: "applied", creditId: inserted.id } as const;
    });
    await resolveReconciliationCaseByKey(database, {
      caseKey: reviewKey(reference),
      resolution:
        "Invoice credit reconciled against exact invoice, customer, subscription and service-period evidence.",
    });
    return result;
  } catch (error) {
    const message =
      error instanceof InvoiceCreditReviewError
        ? error.message
        : "Invoice credit ownership or provider evidence could not be confirmed.";
    await openReconciliationCase(database, {
      caseKey: reviewKey(reference),
      type: "webhook_failure",
      source: "stripe",
      severity: "high",
      title: "Paid subscription invoice credit needs reconciliation",
      summary: message,
      externalReference: reference.slice(0, 255),
      details: {
        eventId: reference,
        ...(invoiceId ? { invoiceId } : {}),
        ...(observedUserId ? { userId: observedUserId } : {}),
      },
    });
    throw new InvoiceCreditReviewError(message);
  }
}
