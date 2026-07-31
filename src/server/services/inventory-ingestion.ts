import { createHash } from "crypto";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  inventoryAdjustments,
  inventoryIngestBatches,
  inventoryReconciliations,
  inventorySourceItems,
  inventorySources,
  listings,
  orders,
  reconciliationCaseEvents,
  reconciliationCases,
  type InventoryIngestResult,
} from "@/server/db/schema";
import { appendAuditEvent } from "@/server/services/audit-ledger";

export const INVENTORY_INGEST_MAX_ITEMS = 100;
export const INVENTORY_INGEST_MAX_BODY_BYTES = 256 * 1024;
const QUANTITY_EPSILON = 0.0001;
const RESERVING_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
] as const;

const inventoryItemSchema = z.object({
  externalItemId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/,
      "externalItemId contains unsupported characters",
    ),
  listingId: z.string().uuid().optional(),
  availableSqFt: z.number().finite().min(0).max(100_000_000),
  observedAt: z.string().datetime({ offset: true }).optional(),
});

export const inventoryIngestPayloadSchema = z
  .object({
    items: z
      .array(inventoryItemSchema)
      .min(1)
      .max(INVENTORY_INGEST_MAX_ITEMS),
  })
  .superRefine((payload, ctx) => {
    const ids = new Set<string>();
    for (const [index, item] of payload.items.entries()) {
      if (ids.has(item.externalItemId)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "externalItemId"],
          message: "externalItemId must be unique within an ingest batch",
        });
      }
      ids.add(item.externalItemId);
    }
  });

export type InventoryIngestPayload = z.infer<
  typeof inventoryIngestPayloadSchema
>;

export class InventoryIngestError extends Error {
  constructor(
    readonly code:
      | "SOURCE_DISABLED"
      | "IDEMPOTENCY_CONFLICT"
      | "INGEST_IN_PROGRESS"
      | "INGEST_FAILED"
      | "RECONCILIATION_NOT_FOUND"
      | "RECONCILIATION_ALREADY_CLOSED"
      | "ACTIVE_RESERVATION"
      | "LISTING_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "InventoryIngestError";
  }
}

export function hashInventoryIngestBody(rawBody: Uint8Array): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export function inventoryAdjustmentIdempotencyKey(parts: {
  sourceId: string;
  batchIdempotencyKey: string;
  externalItemId: string;
}): string {
  return createHash("sha256")
    .update(
      `${parts.sourceId}\u0000${parts.batchIdempotencyKey}\u0000${parts.externalItemId}`,
      "utf8",
    )
    .digest("hex");
}

export function decideInventorySync(params: {
  marketplaceQuantity: number;
  reportedQuantity: number;
  reservedQuantity: number;
}): "apply" | "unchanged" | "reconcile" {
  if (params.reservedQuantity > QUANTITY_EPSILON) return "reconcile";
  if (
    Math.abs(params.marketplaceQuantity - params.reportedQuantity) <=
    QUANTITY_EPSILON
  ) {
    return "unchanged";
  }
  return "apply";
}

export function decideObservationAcceptance(params: {
  observedAt: Date;
  latestAcceptedAt: Date | null;
  now: Date;
}): "accept" | "stale_observation" | "invalid_observation_time" {
  if (params.observedAt.getTime() > params.now.getTime() + 5 * 60_000) {
    return "invalid_observation_time";
  }
  if (
    params.latestAcceptedAt &&
    params.observedAt.getTime() < params.latestAcceptedAt.getTime()
  ) {
    return "stale_observation";
  }
  return "accept";
}

function errorCode(error: unknown): string {
  if (error instanceof InventoryIngestError) return error.code;
  if (error instanceof Error) return error.name.slice(0, 80);
  return "UnknownError";
}

function inventoryCaseKey(sourceId: string, sourceItemId: string): string {
  return `inventory:${sourceId}:${sourceItemId}`;
}

export async function processInventoryIngest(params: {
  sourceId: string;
  sellerId: string;
  expectedKeyRotatedAt: Date;
  idempotencyKey: string;
  requestHash: string;
  payload: InventoryIngestPayload;
}): Promise<{ result: InventoryIngestResult; replayed: boolean }> {
  const now = new Date();
  const [createdBatch] = await db
    .insert(inventoryIngestBatches)
    .values({
      sourceId: params.sourceId,
      sellerId: params.sellerId,
      idempotencyKey: params.idempotencyKey,
      requestHash: params.requestHash,
      itemCount: params.payload.items.length,
      status: "processing",
      startedAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: inventoryIngestBatches.id });

  let batchId = createdBatch?.id;
  if (!batchId) {
    const [existing] = await db
      .select({
        id: inventoryIngestBatches.id,
        requestHash: inventoryIngestBatches.requestHash,
        status: inventoryIngestBatches.status,
        result: inventoryIngestBatches.result,
      })
      .from(inventoryIngestBatches)
      .where(
        and(
          eq(inventoryIngestBatches.sourceId, params.sourceId),
          eq(
            inventoryIngestBatches.idempotencyKey,
            params.idempotencyKey,
          ),
        ),
      )
      .limit(1);

    if (!existing || existing.requestHash !== params.requestHash) {
      throw new InventoryIngestError(
        "IDEMPOTENCY_CONFLICT",
        "The idempotency key was already used for a different request",
      );
    }
    if (existing.status === "completed" && existing.result) {
      return { result: existing.result, replayed: true };
    }
    if (existing.status === "processing") {
      throw new InventoryIngestError(
        "INGEST_IN_PROGRESS",
        "An ingest with this idempotency key is still processing",
      );
    }

    const [retried] = await db
      .update(inventoryIngestBatches)
      .set({
        status: "processing",
        errorCode: null,
        startedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(inventoryIngestBatches.id, existing.id),
          eq(inventoryIngestBatches.status, "failed"),
        ),
      )
      .returning({ id: inventoryIngestBatches.id });
    if (!retried) {
      throw new InventoryIngestError(
        "INGEST_IN_PROGRESS",
        "An ingest with this idempotency key is still processing",
      );
    }
    batchId = retried.id;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [source] = await tx
        .select({
          id: inventorySources.id,
          sellerId: inventorySources.sellerId,
          name: inventorySources.name,
          status: inventorySources.status,
          keyRotatedAt: inventorySources.keyRotatedAt,
        })
        .from(inventorySources)
        .where(eq(inventorySources.id, params.sourceId))
        .for("update");
      if (
        !source ||
        source.sellerId !== params.sellerId ||
        source.status !== "active" ||
        source.keyRotatedAt.getTime() !== params.expectedKeyRotatedAt.getTime()
      ) {
        throw new InventoryIngestError(
          "SOURCE_DISABLED",
          "This inventory source cannot accept updates",
        );
      }

      const output: InventoryIngestResult = {
        sourceId: source.id,
        idempotencyKey: params.idempotencyKey,
        received: params.payload.items.length,
        applied: 0,
        unchanged: 0,
        mismatches: 0,
        unbound: 0,
        items: [],
      };

      const resolvePreviousMismatch = async (sourceItemId: string) => {
        await tx
          .update(inventoryReconciliations)
          .set({
            status: "resolved",
            resolution:
              "A later feed observation was safely synchronized after the reservation cleared.",
            resolvedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(inventoryReconciliations.sourceItemId, sourceItemId),
              eq(inventoryReconciliations.status, "open"),
            ),
          );

        const caseKey = inventoryCaseKey(source.id, sourceItemId);
        const [closedCase] = await tx
          .update(reconciliationCases)
          .set({
            status: "resolved",
            resolution:
              "A later inventory feed observation synchronized safely.",
            resolvedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(reconciliationCases.caseKey, caseKey),
              inArray(reconciliationCases.status, [
                "open",
                "in_progress",
                "waiting_external",
              ]),
            ),
          )
          .returning({ id: reconciliationCases.id });
        if (closedCase) {
          await tx.insert(reconciliationCaseEvents).values({
            caseId: closedCase.id,
            eventType: "resolved",
            message:
              "Inventory mismatch cleared by a later safe feed synchronization.",
            metadata: { sourceId: source.id, sourceItemId },
          });
        }
      };

      const recordMismatch = async (mismatch: {
        sourceItemId: string;
        listingId: string | null;
        externalItemId: string;
        reason:
          | "unbound_item"
          | "binding_conflict"
          | "listing_not_owned"
          | "active_reservation"
          | "stale_observation"
          | "invalid_observation_time";
        reportedQuantity: number;
        marketplaceQuantity: number | null;
        reservedQuantity: number;
        details?: Record<string, unknown>;
      }) => {
        const reconciliationKey = createHash("sha256")
          .update(
            `${batchId}\u0000${mismatch.sourceItemId}\u0000${mismatch.reason}`,
          )
          .digest("hex");
        await tx
          .insert(inventoryReconciliations)
          .values({
            reconciliationKey,
            sellerId: source.sellerId,
            sourceId: source.id,
            sourceItemId: mismatch.sourceItemId,
            listingId: mismatch.listingId,
            ingestBatchId: batchId,
            reason: mismatch.reason,
            reportedQuantity: mismatch.reportedQuantity,
            marketplaceQuantity: mismatch.marketplaceQuantity,
            reservedQuantity: mismatch.reservedQuantity,
            details: {
              externalItemId: mismatch.externalItemId,
              ...mismatch.details,
            },
            status: "open",
            detectedAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing();

        const caseKey = inventoryCaseKey(source.id, mismatch.sourceItemId);
        const [operatorCase] = await tx
          .insert(reconciliationCases)
          .values({
            caseKey,
            type: "data_integrity",
            source: "system",
            status: "open",
            severity:
              mismatch.reason === "active_reservation"
                ? "high"
                : mismatch.reason === "stale_observation"
                  ? "low"
                  : "medium",
            title: "Inventory feed needs reconciliation",
            summary:
              mismatch.reason === "active_reservation"
                ? "A feed quantity was not applied because marketplace inventory is reserved by an active order."
                : mismatch.reason === "stale_observation" ||
                    mismatch.reason === "invalid_observation_time"
                  ? "An out-of-order or invalidly dated inventory observation was ignored."
                  : "An inventory feed item could not be safely mapped to a seller listing.",
            externalReference: mismatch.externalItemId,
            details: {
              inventorySourceId: source.id,
              inventorySourceName: source.name,
              inventorySourceItemId: mismatch.sourceItemId,
              listingId: mismatch.listingId,
              reason: mismatch.reason,
              reportedQuantity: mismatch.reportedQuantity,
              marketplaceQuantity: mismatch.marketplaceQuantity,
              reservedQuantity: mismatch.reservedQuantity,
            },
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: reconciliationCases.caseKey,
            set: {
              status: "open",
              severity:
                mismatch.reason === "active_reservation"
                  ? "high"
                  : mismatch.reason === "stale_observation"
                    ? "low"
                    : "medium",
              summary:
                mismatch.reason === "active_reservation"
                  ? "A feed quantity was not applied because marketplace inventory is reserved by an active order."
                  : mismatch.reason === "stale_observation" ||
                      mismatch.reason === "invalid_observation_time"
                    ? "An out-of-order or invalidly dated inventory observation was ignored."
                    : "An inventory feed item could not be safely mapped to a seller listing.",
              externalReference: mismatch.externalItemId,
              details: {
                inventorySourceId: source.id,
                inventorySourceName: source.name,
                inventorySourceItemId: mismatch.sourceItemId,
                listingId: mismatch.listingId,
                reason: mismatch.reason,
                reportedQuantity: mismatch.reportedQuantity,
                marketplaceQuantity: mismatch.marketplaceQuantity,
                reservedQuantity: mismatch.reservedQuantity,
              },
              resolution: null,
              resolvedAt: null,
              resolvedBy: null,
              updatedAt: now,
            },
          })
          .returning({ id: reconciliationCases.id });
        if (operatorCase) {
          await tx.insert(reconciliationCaseEvents).values({
            caseId: operatorCase.id,
            eventType: "provider_update",
            message: "Inventory feed reported a value that was not applied.",
            metadata: {
              sourceId: source.id,
              sourceItemId: mismatch.sourceItemId,
              reason: mismatch.reason,
            },
          });
        }
      };

      for (const inputItem of params.payload.items) {
        const observedAt = inputItem.observedAt
          ? new Date(inputItem.observedAt)
          : now;
        let [sourceItem] = await tx
          .select()
          .from(inventorySourceItems)
          .where(
            and(
              eq(inventorySourceItems.sourceId, source.id),
              eq(
                inventorySourceItems.externalItemId,
                inputItem.externalItemId,
              ),
            ),
          )
          .for("update");

        if (!sourceItem) {
          [sourceItem] = await tx
            .insert(inventorySourceItems)
            .values({
              sourceId: source.id,
              sellerId: source.sellerId,
              externalItemId: inputItem.externalItemId,
              updatedAt: now,
            })
            .returning();
        }
        if (!sourceItem) {
          throw new InventoryIngestError(
            "INGEST_FAILED",
            "Unable to persist the external inventory item",
          );
        }

        const observationDecision = decideObservationAcceptance({
          observedAt,
          latestAcceptedAt: sourceItem.lastObservedAt,
          now,
        });
        if (observationDecision === "invalid_observation_time") {
          await recordMismatch({
            sourceItemId: sourceItem.id,
            listingId: sourceItem.listingId,
            externalItemId: inputItem.externalItemId,
            reason: "invalid_observation_time",
            reportedQuantity: inputItem.availableSqFt,
            marketplaceQuantity: null,
            reservedQuantity: 0,
            details: { observedAt: observedAt.toISOString() },
          });
          output.mismatches += 1;
          output.items.push({
            externalItemId: inputItem.externalItemId,
            status: "mismatch",
            listingId: sourceItem.listingId,
          });
          continue;
        }

        if (observationDecision === "stale_observation") {
          await recordMismatch({
            sourceItemId: sourceItem.id,
            listingId: sourceItem.listingId,
            externalItemId: inputItem.externalItemId,
            reason: "stale_observation",
            reportedQuantity: inputItem.availableSqFt,
            marketplaceQuantity: null,
            reservedQuantity: 0,
            details: {
              observedAt: observedAt.toISOString(),
              latestAcceptedObservationAt:
                sourceItem.lastObservedAt?.toISOString(),
            },
          });
          output.mismatches += 1;
          output.items.push({
            externalItemId: inputItem.externalItemId,
            status: "mismatch",
            listingId: sourceItem.listingId,
          });
          continue;
        }

        let listingId = sourceItem.listingId;
        let bindingMismatch:
          | "binding_conflict"
          | "listing_not_owned"
          | null = null;
        if (
          listingId &&
          inputItem.listingId &&
          listingId !== inputItem.listingId
        ) {
          bindingMismatch = "binding_conflict";
        } else if (!listingId && inputItem.listingId) {
          const [ownedListing] = await tx
            .select({ id: listings.id })
            .from(listings)
            .where(
              and(
                eq(listings.id, inputItem.listingId),
                eq(listings.sellerId, source.sellerId),
              ),
            )
            .for("update");
          if (ownedListing) {
            listingId = ownedListing.id;
          } else {
            bindingMismatch = "listing_not_owned";
          }
        }

        [sourceItem] = await tx
          .update(inventorySourceItems)
          .set({
            listingId,
            lastReportedQuantity: inputItem.availableSqFt,
            lastObservedAt: observedAt,
            updatedAt: now,
          })
          .where(eq(inventorySourceItems.id, sourceItem.id))
          .returning();
        if (!sourceItem) {
          throw new InventoryIngestError(
            "INGEST_FAILED",
            "Unable to update the external inventory item",
          );
        }

        if (bindingMismatch) {
          await recordMismatch({
            sourceItemId: sourceItem.id,
            listingId,
            externalItemId: inputItem.externalItemId,
            reason: bindingMismatch,
            reportedQuantity: inputItem.availableSqFt,
            marketplaceQuantity: null,
            reservedQuantity: 0,
            details:
              bindingMismatch === "binding_conflict"
                ? { attemptedListingId: inputItem.listingId }
                : undefined,
          });
          output.mismatches += 1;
          output.items.push({
            externalItemId: inputItem.externalItemId,
            status: "mismatch",
            listingId,
          });
          continue;
        }

        if (!listingId) {
          await recordMismatch({
            sourceItemId: sourceItem.id,
            listingId: null,
            externalItemId: inputItem.externalItemId,
            reason: "unbound_item",
            reportedQuantity: inputItem.availableSqFt,
            marketplaceQuantity: null,
            reservedQuantity: 0,
          });
          output.unbound += 1;
          output.items.push({
            externalItemId: inputItem.externalItemId,
            status: "unbound",
            listingId: null,
          });
          continue;
        }

        // Checkout locks this same listing row before reserving inventory.
        // Holding it here closes the race between the reservation query and
        // the feed update.
        const [listing] = await tx
          .select({
            id: listings.id,
            sellerId: listings.sellerId,
            totalSqFt: listings.totalSqFt,
            status: listings.status,
            soldAt: listings.soldAt,
          })
          .from(listings)
          .where(
            and(
              eq(listings.id, listingId),
              eq(listings.sellerId, source.sellerId),
            ),
          )
          .for("update");
        if (!listing) {
          await tx
            .update(inventorySourceItems)
            .set({ listingId: null, updatedAt: now })
            .where(eq(inventorySourceItems.id, sourceItem.id));
          await recordMismatch({
            sourceItemId: sourceItem.id,
            listingId: null,
            externalItemId: inputItem.externalItemId,
            reason: "listing_not_owned",
            reportedQuantity: inputItem.availableSqFt,
            marketplaceQuantity: null,
            reservedQuantity: 0,
          });
          output.mismatches += 1;
          output.items.push({
            externalItemId: inputItem.externalItemId,
            status: "mismatch",
            listingId: null,
          });
          continue;
        }

        const [reservation] = await tx
          .select({
            quantity: sql<number>`coalesce(sum(${orders.quantitySqFt})::float, 0)`,
          })
          .from(orders)
          .where(
            and(
              eq(orders.listingId, listing.id),
              isNull(orders.inventoryReleasedAt),
              inArray(orders.status, [...RESERVING_ORDER_STATUSES]),
            ),
          );
        const reservedQuantity = Number(reservation?.quantity ?? 0);
        const decision = decideInventorySync({
          marketplaceQuantity: listing.totalSqFt,
          reportedQuantity: inputItem.availableSqFt,
          reservedQuantity,
        });

        if (decision === "reconcile") {
          await recordMismatch({
            sourceItemId: sourceItem.id,
            listingId: listing.id,
            externalItemId: inputItem.externalItemId,
            reason: "active_reservation",
            reportedQuantity: inputItem.availableSqFt,
            marketplaceQuantity: listing.totalSqFt,
            reservedQuantity,
          });
          output.mismatches += 1;
          output.items.push({
            externalItemId: inputItem.externalItemId,
            status: "mismatch",
            listingId: listing.id,
          });
          continue;
        }

        if (decision === "apply") {
          const nextStatus =
            inputItem.availableSqFt <= QUANTITY_EPSILON &&
            listing.status === "active"
              ? "sold"
              : inputItem.availableSqFt > QUANTITY_EPSILON &&
                  listing.status === "sold"
                ? "active"
                : listing.status;
          await tx
            .update(listings)
            .set({
              totalSqFt: inputItem.availableSqFt,
              status: nextStatus,
              soldAt:
                nextStatus === "sold"
                  ? listing.soldAt ?? now
                  : nextStatus === "active"
                    ? null
                    : listing.soldAt,
              updatedAt: now,
            })
            .where(eq(listings.id, listing.id));
          await tx.insert(inventoryAdjustments).values({
            sellerId: source.sellerId,
            listingId: listing.id,
            sourceId: source.id,
            sourceItemId: sourceItem.id,
            ingestBatchId: batchId,
            previousQuantity: listing.totalSqFt,
            newQuantity: inputItem.availableSqFt,
            deltaQuantity: inputItem.availableSqFt - listing.totalSqFt,
            reason: "feed_sync",
            actorType: "feed",
            idempotencyKey: inventoryAdjustmentIdempotencyKey({
              sourceId: source.id,
              batchIdempotencyKey: params.idempotencyKey,
              externalItemId: inputItem.externalItemId,
            }),
            metadata: {
              externalItemId: inputItem.externalItemId,
              observedAt: observedAt.toISOString(),
            },
          });
          output.applied += 1;
          output.items.push({
            externalItemId: inputItem.externalItemId,
            status: "applied",
            listingId: listing.id,
          });
        } else {
          output.unchanged += 1;
          output.items.push({
            externalItemId: inputItem.externalItemId,
            status: "unchanged",
            listingId: listing.id,
          });
        }

        await tx
          .update(inventorySourceItems)
          .set({ lastSyncedAt: now, updatedAt: now })
          .where(eq(inventorySourceItems.id, sourceItem.id));
        await resolvePreviousMismatch(sourceItem.id);
      }

      await tx
        .update(inventorySources)
        .set({
          lastIngestedAt: now,
          lastSuccessfulIngestAt: now,
          lastErrorAt: null,
          lastErrorCode: null,
          updatedAt: now,
        })
        .where(eq(inventorySources.id, source.id));
      await tx
        .update(inventoryIngestBatches)
        .set({
          status: "completed",
          appliedCount: output.applied,
          unchangedCount: output.unchanged,
          mismatchCount: output.mismatches,
          unboundCount: output.unbound,
          result: output,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(inventoryIngestBatches.id, batchId!));
      await appendAuditEvent(tx, {
        actorType: "provider",
        actorId: null,
        action: "inventory.ingest_completed",
        entityType: "inventory_source",
        entityId: source.id,
        idempotencyKey: `inventory-ingest:${source.id}:${params.idempotencyKey}`,
        summary: "Inventory feed batch completed.",
        metadata: {
          batchId,
          received: output.received,
          applied: output.applied,
          unchanged: output.unchanged,
          mismatches: output.mismatches,
          unbound: output.unbound,
        },
      });

      return output;
    });
    return { result, replayed: false };
  } catch (error) {
    const code = errorCode(error);
    await Promise.allSettled([
      db
        .update(inventoryIngestBatches)
        .set({
          status: "failed",
          errorCode: code,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(inventoryIngestBatches.id, batchId)),
      db
        .update(inventorySources)
        .set({
          lastIngestedAt: new Date(),
          lastErrorAt: new Date(),
          lastErrorCode: code,
          updatedAt: new Date(),
        })
        .where(eq(inventorySources.id, params.sourceId)),
    ]);
    throw error;
  }
}

export async function applyInventoryReconciliation(params: {
  reconciliationId: string;
  sellerId: string;
  actorUserId: string;
}) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [reconciliation] = await tx
      .select()
      .from(inventoryReconciliations)
      .where(
        and(
          eq(inventoryReconciliations.id, params.reconciliationId),
          eq(inventoryReconciliations.sellerId, params.sellerId),
        ),
      )
      .for("update");
    if (!reconciliation) {
      throw new InventoryIngestError(
        "RECONCILIATION_NOT_FOUND",
        "Inventory reconciliation was not found",
      );
    }
    if (reconciliation.status !== "open") {
      throw new InventoryIngestError(
        "RECONCILIATION_ALREADY_CLOSED",
        "Inventory reconciliation is already closed",
      );
    }
    if (!reconciliation.listingId) {
      throw new InventoryIngestError(
        "LISTING_UNAVAILABLE",
        "Bind this external item to a listing before applying its quantity",
      );
    }

    const [latestOpenReconciliation] = await tx
      .select({ id: inventoryReconciliations.id })
      .from(inventoryReconciliations)
      .where(
        and(
          eq(
            inventoryReconciliations.sourceItemId,
            reconciliation.sourceItemId,
          ),
          eq(inventoryReconciliations.status, "open"),
        ),
      )
      .orderBy(desc(inventoryReconciliations.detectedAt))
      .limit(1)
      .for("update");
    if (latestOpenReconciliation?.id !== reconciliation.id) {
      throw new InventoryIngestError(
        "RECONCILIATION_ALREADY_CLOSED",
        "A newer feed observation exists. Refresh and apply the latest quantity instead.",
      );
    }

    const [listing] = await tx
      .select({
        id: listings.id,
        totalSqFt: listings.totalSqFt,
        status: listings.status,
        soldAt: listings.soldAt,
      })
      .from(listings)
      .where(
        and(
          eq(listings.id, reconciliation.listingId),
          eq(listings.sellerId, params.sellerId),
        ),
      )
      .for("update");
    if (!listing) {
      throw new InventoryIngestError(
        "LISTING_UNAVAILABLE",
        "The mapped listing is unavailable",
      );
    }

    const [reservation] = await tx
      .select({
        quantity: sql<number>`coalesce(sum(${orders.quantitySqFt})::float, 0)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.listingId, listing.id),
          isNull(orders.inventoryReleasedAt),
          inArray(orders.status, [...RESERVING_ORDER_STATUSES]),
        ),
      );
    const reservedQuantity = Number(reservation?.quantity ?? 0);
    if (reservedQuantity > QUANTITY_EPSILON) {
      await tx
        .update(inventoryReconciliations)
        .set({
          reservedQuantity,
          marketplaceQuantity: listing.totalSqFt,
          updatedAt: now,
        })
        .where(eq(inventoryReconciliations.id, reconciliation.id));
      throw new InventoryIngestError(
        "ACTIVE_RESERVATION",
        "This listing still has reserved inventory and cannot be overwritten",
      );
    }

    const nextQuantity = reconciliation.reportedQuantity;
    const nextStatus =
      nextQuantity <= QUANTITY_EPSILON && listing.status === "active"
        ? "sold"
        : nextQuantity > QUANTITY_EPSILON && listing.status === "sold"
          ? "active"
          : listing.status;
    await tx
      .update(listings)
      .set({
        totalSqFt: nextQuantity,
        status: nextStatus,
        soldAt:
          nextStatus === "sold"
            ? listing.soldAt ?? now
            : nextStatus === "active"
              ? null
              : listing.soldAt,
        updatedAt: now,
      })
      .where(eq(listings.id, listing.id));

    if (Math.abs(nextQuantity - listing.totalSqFt) > QUANTITY_EPSILON) {
      await tx
        .insert(inventoryAdjustments)
        .values({
          sellerId: params.sellerId,
          listingId: listing.id,
          sourceId: reconciliation.sourceId,
          sourceItemId: reconciliation.sourceItemId,
          ingestBatchId: reconciliation.ingestBatchId,
          previousQuantity: listing.totalSqFt,
          newQuantity: nextQuantity,
          deltaQuantity: nextQuantity - listing.totalSqFt,
          reason: "manual_reconciliation",
          actorType: "seller",
          actorUserId: params.actorUserId,
          idempotencyKey: `inventory-reconciliation:${reconciliation.id}`,
          metadata: {
            reconciliationId: reconciliation.id,
          },
        })
        .onConflictDoNothing();
    }

    await tx
      .update(inventorySourceItems)
      .set({ lastSyncedAt: now, updatedAt: now })
      .where(eq(inventorySourceItems.id, reconciliation.sourceItemId));
    await tx
      .update(inventoryReconciliations)
      .set({
        status: "resolved",
        marketplaceQuantity: nextQuantity,
        reservedQuantity: 0,
        resolvedAt: now,
        resolvedBy: params.actorUserId,
        resolution:
          "Superseded when the seller applied the latest reported feed quantity.",
        updatedAt: now,
      })
      .where(
        and(
          eq(
            inventoryReconciliations.sourceItemId,
            reconciliation.sourceItemId,
          ),
          eq(inventoryReconciliations.status, "open"),
          ne(inventoryReconciliations.id, reconciliation.id),
        ),
      );
    const [resolved] = await tx
      .update(inventoryReconciliations)
      .set({
        status: "resolved",
        marketplaceQuantity: nextQuantity,
        reservedQuantity: 0,
        resolvedAt: now,
        resolvedBy: params.actorUserId,
        resolution: "Seller applied the reported feed quantity.",
        updatedAt: now,
      })
      .where(eq(inventoryReconciliations.id, reconciliation.id))
      .returning();

    const caseKey = inventoryCaseKey(
      reconciliation.sourceId,
      reconciliation.sourceItemId,
    );
    const [operatorCase] = await tx
      .update(reconciliationCases)
      .set({
        status: "resolved",
        resolution: "Seller applied the reported inventory quantity.",
        resolvedAt: now,
        resolvedBy: params.actorUserId,
        updatedAt: now,
      })
      .where(eq(reconciliationCases.caseKey, caseKey))
      .returning({ id: reconciliationCases.id });
    if (operatorCase) {
      await tx.insert(reconciliationCaseEvents).values({
        caseId: operatorCase.id,
        actorId: params.actorUserId,
        eventType: "resolved",
        message: "Seller reconciled the inventory feed quantity.",
        metadata: { inventoryReconciliationId: reconciliation.id },
      });
    }
    await appendAuditEvent(tx, {
      actorType: "user",
      actorId: params.actorUserId,
      action: "inventory.reconciliation_applied",
      entityType: "inventory_reconciliation",
      entityId: reconciliation.id,
      summary: "Seller applied the latest reported inventory quantity.",
      metadata: {
        sourceId: reconciliation.sourceId,
        sourceItemId: reconciliation.sourceItemId,
        listingId: listing.id,
        previousQuantity: listing.totalSqFt,
        newQuantity: nextQuantity,
      },
    });
    return resolved;
  });
}
