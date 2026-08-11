import { eq, sql } from "drizzle-orm";
import { db as applicationDb } from "@/server/db";
import {
  reconciliationCaseEvents,
  reconciliationCases,
  type NewReconciliationCase,
} from "@/server/db/schema";

type ReconciliationDatabase = typeof applicationDb;
type ReconciliationTransaction = Parameters<
  Parameters<ReconciliationDatabase["transaction"]>[0]
>[0];

export interface OpenReconciliationCaseInput {
  caseKey: string;
  type: NewReconciliationCase["type"];
  source: NewReconciliationCase["source"];
  severity?: NewReconciliationCase["severity"];
  title: string;
  summary: string;
  orderId?: string | null;
  disputeId?: string | null;
  externalReference?: string | null;
  amountCents?: number | null;
  currency?: string;
  details?: Record<string, unknown>;
  actorId?: string | null;
}

export interface ResolveReconciliationCaseInput {
  caseKey: string;
  resolution: string;
  actorId?: string | null;
  status?: "resolved" | "dismissed";
  details?: Record<string, unknown>;
}

/**
 * Persist an operational exception under a stable key. Repeated detection
 * updates the same case and appends provider evidence instead of creating
 * disposable notifications that can be read or deleted.
 */
async function upsertReconciliationCase(
  database: ReconciliationTransaction,
  input: OpenReconciliationCaseInput,
) {
  const [inserted] = await database
    .insert(reconciliationCases)
    .values({
      caseKey: input.caseKey,
      type: input.type,
      source: input.source,
      severity: input.severity ?? "medium",
      title: input.title,
      summary: input.summary,
      orderId: input.orderId ?? null,
      disputeId: input.disputeId ?? null,
      externalReference: input.externalReference ?? null,
      amountCents: input.amountCents ?? null,
      currency: (input.currency ?? "usd").toLowerCase(),
      details: input.details ?? {},
      createdBy: input.actorId ?? null,
    })
    .onConflictDoNothing({ target: reconciliationCases.caseKey })
    .returning();

  const caseRecord =
    inserted ??
    (
      await database
        .update(reconciliationCases)
        .set({
          status: sql`case
              when ${reconciliationCases.status} in ('resolved', 'dismissed')
                then 'open'
              else ${reconciliationCases.status}
            end`,
          severity: input.severity ?? "medium",
          title: input.title,
          summary: input.summary,
          orderId: input.orderId ?? null,
          disputeId: input.disputeId ?? null,
          externalReference: input.externalReference ?? null,
          amountCents: input.amountCents ?? null,
          currency: (input.currency ?? "usd").toLowerCase(),
          details: input.details ?? {},
          resolution: sql`case
              when ${reconciliationCases.status} in ('resolved', 'dismissed')
                then null
              else ${reconciliationCases.resolution}
            end`,
          resolvedBy: sql`case
              when ${reconciliationCases.status} in ('resolved', 'dismissed')
                then null
              else ${reconciliationCases.resolvedBy}
            end`,
          resolvedAt: sql`case
              when ${reconciliationCases.status} in ('resolved', 'dismissed')
                then null
              else ${reconciliationCases.resolvedAt}
            end`,
          updatedAt: new Date(),
        })
        .where(eq(reconciliationCases.caseKey, input.caseKey))
        .returning()
    )[0];

  if (!caseRecord) {
    throw new Error("Unable to persist reconciliation case");
  }

  await database.insert(reconciliationCaseEvents).values({
    caseId: caseRecord.id,
    actorId: input.actorId ?? null,
    eventType: inserted ? "opened" : "provider_update",
    message: inserted
      ? `Case opened: ${input.summary}`
      : `Case evidence updated: ${input.summary}`,
    metadata: {
      source: input.source,
      externalReference: input.externalReference ?? null,
      details: input.details ?? {},
    },
  });

  return caseRecord;
}

export async function openReconciliationCase(
  database: ReconciliationDatabase,
  input: OpenReconciliationCaseInput,
) {
  return database.transaction((tx) => upsertReconciliationCase(tx, input));
}

/**
 * Persist a case atomically with a caller-owned state transition. The caller
 * is responsible for holding any required row locks before invoking this.
 */
export async function openReconciliationCaseInTransaction(
  transaction: ReconciliationTransaction,
  input: OpenReconciliationCaseInput,
) {
  return upsertReconciliationCase(transaction, input);
}

/**
 * Close a stable system case idempotently when the provider publishes a
 * terminal result. Missing cases are tolerated for legacy events.
 */
export async function resolveReconciliationCaseByKey(
  database: ReconciliationDatabase,
  input: ResolveReconciliationCaseInput,
) {
  return database.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(reconciliationCases)
      .where(eq(reconciliationCases.caseKey, input.caseKey))
      .for("update");
    if (!current) return null;
    if (current.status === "resolved" || current.status === "dismissed") {
      return current;
    }

    const now = new Date();
    const status = input.status ?? "resolved";
    const [updated] = await tx
      .update(reconciliationCases)
      .set({
        status,
        resolution: input.resolution,
        resolvedBy: input.actorId ?? null,
        resolvedAt: now,
        details: input.details ?? current.details,
        updatedAt: now,
      })
      .where(eq(reconciliationCases.id, current.id))
      .returning();
    await tx.insert(reconciliationCaseEvents).values({
      caseId: current.id,
      actorId: input.actorId ?? null,
      eventType: "resolved",
      message: `Case ${status}: ${input.resolution}`,
      metadata: {
        previousStatus: current.status,
        nextStatus: status,
        ...(input.details ?? {}),
      },
    });
    return updated ?? current;
  });
}
