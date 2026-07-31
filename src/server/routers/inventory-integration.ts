import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ne,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import {
  inventoryAdjustments,
  inventoryIngestBatches,
  inventoryReconciliations,
  inventorySourceItems,
  inventorySources,
  listings,
  reconciliationCases,
  users,
} from "@/server/db/schema";
import {
  generateInventoryApiKey,
} from "@/server/security/inventory-api-key";
import {
  applyInventoryReconciliation,
  InventoryIngestError,
} from "@/server/services/inventory-ingestion";
import { appendAuditEvent } from "@/server/services/audit-ledger";
import {
  adminProcedure,
  createTRPCRouter,
  sellerProcedure,
  strictSellerProcedure,
} from "../trpc";

const sourceNameSchema = z.string().trim().min(2).max(120);
const externalIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const sourceStatusSchema = z.enum(["active", "paused", "revoked"]);

function isSourceStale(source: {
  status: string;
  createdAt: Date;
  lastSuccessfulIngestAt: Date | null;
  staleAfterMinutes: number;
}) {
  if (source.status !== "active") return false;
  const reference =
    source.lastSuccessfulIngestAt?.getTime() ?? source.createdAt.getTime();
  return Date.now() - reference > source.staleAfterMinutes * 60_000;
}

function mutationError(error: unknown): never {
  if (error instanceof InventoryIngestError) {
    const code =
      error.code === "RECONCILIATION_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "ACTIVE_RESERVATION" ||
            error.code === "RECONCILIATION_ALREADY_CLOSED"
          ? "CONFLICT"
          : "BAD_REQUEST";
    throw new TRPCError({ code, message: error.message });
  }
  throw error;
}

export const inventoryIntegrationRouter = createTRPCRouter({
  sellerOverview: sellerProcedure.query(async ({ ctx }) => {
    const [
      sourceRows,
      items,
      reconciliations,
      adjustments,
      batches,
      sellerListings,
    ] = await Promise.all([
      ctx.db
        .select({
          id: inventorySources.id,
          name: inventorySources.name,
          externalSourceId: inventorySources.externalSourceId,
          authMode: inventorySources.authMode,
          status: inventorySources.status,
          apiKeyHint: inventorySources.apiKeyHint,
          staleAfterMinutes: inventorySources.staleAfterMinutes,
          lastIngestedAt: inventorySources.lastIngestedAt,
          lastSuccessfulIngestAt: inventorySources.lastSuccessfulIngestAt,
          lastErrorAt: inventorySources.lastErrorAt,
          lastErrorCode: inventorySources.lastErrorCode,
          keyRotatedAt: inventorySources.keyRotatedAt,
          createdAt: inventorySources.createdAt,
          itemCount: sql<number>`(
            select count(*)::int
            from inventory_source_items item
            where item.source_id = ${inventorySources.id}
          )`,
          openMismatchCount: sql<number>`(
            select count(*)::int
            from inventory_reconciliations reconciliation
            where reconciliation.source_id = ${inventorySources.id}
              and reconciliation.status = 'open'
          )`,
        })
        .from(inventorySources)
        .where(eq(inventorySources.sellerId, ctx.user.id))
        .orderBy(desc(inventorySources.createdAt)),
      ctx.db
        .select({
          id: inventorySourceItems.id,
          sourceId: inventorySourceItems.sourceId,
          sourceName: inventorySources.name,
          externalItemId: inventorySourceItems.externalItemId,
          listingId: inventorySourceItems.listingId,
          listingTitle: listings.title,
          listingStatus: listings.status,
          marketplaceQuantity: listings.totalSqFt,
          lastReportedQuantity: inventorySourceItems.lastReportedQuantity,
          lastObservedAt: inventorySourceItems.lastObservedAt,
          lastSyncedAt: inventorySourceItems.lastSyncedAt,
        })
        .from(inventorySourceItems)
        .innerJoin(
          inventorySources,
          eq(inventorySourceItems.sourceId, inventorySources.id),
        )
        .leftJoin(listings, eq(inventorySourceItems.listingId, listings.id))
        .where(eq(inventorySourceItems.sellerId, ctx.user.id))
        .orderBy(desc(inventorySourceItems.lastObservedAt))
        .limit(250),
      ctx.db
        .select({
          id: inventoryReconciliations.id,
          sourceId: inventoryReconciliations.sourceId,
          sourceName: inventorySources.name,
          sourceItemId: inventoryReconciliations.sourceItemId,
          externalItemId: inventorySourceItems.externalItemId,
          listingId: inventoryReconciliations.listingId,
          listingTitle: listings.title,
          status: inventoryReconciliations.status,
          reason: inventoryReconciliations.reason,
          reportedQuantity: inventoryReconciliations.reportedQuantity,
          marketplaceQuantity:
            inventoryReconciliations.marketplaceQuantity,
          reservedQuantity: inventoryReconciliations.reservedQuantity,
          detectedAt: inventoryReconciliations.detectedAt,
          resolution: inventoryReconciliations.resolution,
        })
        .from(inventoryReconciliations)
        .innerJoin(
          inventorySources,
          eq(inventoryReconciliations.sourceId, inventorySources.id),
        )
        .innerJoin(
          inventorySourceItems,
          eq(
            inventoryReconciliations.sourceItemId,
            inventorySourceItems.id,
          ),
        )
        .leftJoin(listings, eq(inventoryReconciliations.listingId, listings.id))
        .where(eq(inventoryReconciliations.sellerId, ctx.user.id))
        .orderBy(
          asc(inventoryReconciliations.status),
          desc(inventoryReconciliations.detectedAt),
        )
        .limit(100),
      ctx.db
        .select({
          id: inventoryAdjustments.id,
          listingId: inventoryAdjustments.listingId,
          listingTitle: listings.title,
          sourceId: inventoryAdjustments.sourceId,
          previousQuantity: inventoryAdjustments.previousQuantity,
          newQuantity: inventoryAdjustments.newQuantity,
          deltaQuantity: inventoryAdjustments.deltaQuantity,
          reason: inventoryAdjustments.reason,
          actorType: inventoryAdjustments.actorType,
          createdAt: inventoryAdjustments.createdAt,
        })
        .from(inventoryAdjustments)
        .innerJoin(listings, eq(inventoryAdjustments.listingId, listings.id))
        .where(eq(inventoryAdjustments.sellerId, ctx.user.id))
        .orderBy(desc(inventoryAdjustments.createdAt))
        .limit(50),
      ctx.db
        .select({
          id: inventoryIngestBatches.id,
          sourceId: inventoryIngestBatches.sourceId,
          sourceName: inventorySources.name,
          status: inventoryIngestBatches.status,
          itemCount: inventoryIngestBatches.itemCount,
          appliedCount: inventoryIngestBatches.appliedCount,
          unchangedCount: inventoryIngestBatches.unchangedCount,
          mismatchCount: inventoryIngestBatches.mismatchCount,
          unboundCount: inventoryIngestBatches.unboundCount,
          errorCode: inventoryIngestBatches.errorCode,
          startedAt: inventoryIngestBatches.startedAt,
          completedAt: inventoryIngestBatches.completedAt,
        })
        .from(inventoryIngestBatches)
        .innerJoin(
          inventorySources,
          eq(inventoryIngestBatches.sourceId, inventorySources.id),
        )
        .where(eq(inventoryIngestBatches.sellerId, ctx.user.id))
        .orderBy(desc(inventoryIngestBatches.startedAt))
        .limit(25),
      ctx.db
        .select({
          id: listings.id,
          title: listings.title,
          status: listings.status,
          totalSqFt: listings.totalSqFt,
        })
        .from(listings)
        .where(
          and(
            eq(listings.sellerId, ctx.user.id),
            ne(listings.status, "archived"),
          ),
        )
        .orderBy(asc(listings.title))
        .limit(500),
    ]);

    const sources = sourceRows.map((source) => ({
      ...source,
      stale: isSourceStale(source),
    }));
    return {
      sources,
      items,
      reconciliations,
      adjustments,
      batches,
      listings: sellerListings,
      totals: {
        sources: sources.length,
        staleSources: sources.filter((source) => source.stale).length,
        connectedItems: items.filter((item) => item.listingId).length,
        unboundItems: items.filter((item) => !item.listingId).length,
        openMismatches: reconciliations.filter(
          (reconciliation) => reconciliation.status === "open",
        ).length,
      },
    };
  }),

  createSource: strictSellerProcedure
    .input(
      z.object({
        name: sourceNameSchema,
        externalSourceId: externalIdSchema,
        authMode: z.enum(["bearer", "signed"]).default("bearer"),
        staleAfterMinutes: z.number().int().min(15).max(43_200).default(1440),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.authMode !== "bearer") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Signed inventory sources are no longer supported",
        });
      }
      const key = generateInventoryApiKey();
      try {
        return await ctx.db.transaction(async (tx) => {
          const [source] = await tx
            .insert(inventorySources)
            .values({
              sellerId: ctx.user.id,
              name: input.name,
              externalSourceId: input.externalSourceId,
              authMode: input.authMode,
              apiKeyHash: key.hash,
              apiKeyHint: key.hint,
              staleAfterMinutes: input.staleAfterMinutes,
            })
            .returning({
              id: inventorySources.id,
              name: inventorySources.name,
              externalSourceId: inventorySources.externalSourceId,
              authMode: inventorySources.authMode,
              status: inventorySources.status,
              apiKeyHint: inventorySources.apiKeyHint,
            });
          if (!source) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Inventory source could not be created",
            });
          }
          await appendAuditEvent(tx, {
            actorType: "user",
            actorId: ctx.user.id,
            action: "inventory.source_created",
            entityType: "inventory_source",
            entityId: source.id,
            summary: "Seller created an inventory source.",
            metadata: {
              externalSourceId: source.externalSourceId,
              authMode: source.authMode,
              staleAfterMinutes: input.staleAfterMinutes,
            },
          });
          return { source, apiKey: key.plaintext };
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "23505"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "A source with this external source ID already exists for your account",
          });
        }
        throw error;
      }
    }),

  rotateKey: strictSellerProcedure
    .input(z.object({ sourceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const key = generateInventoryApiKey();
      const now = new Date();
      return ctx.db.transaction(async (tx) => {
        const [source] = await tx
          .select({
            id: inventorySources.id,
            status: inventorySources.status,
            authMode: inventorySources.authMode,
          })
          .from(inventorySources)
          .where(
            and(
              eq(inventorySources.id, input.sourceId),
              eq(inventorySources.sellerId, ctx.user.id),
            ),
          )
          .for("update");
        if (!source) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Inventory source not found",
          });
        }
        if (source.status === "revoked") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A revoked source cannot rotate credentials",
          });
        }
        if (source.authMode !== "bearer") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Legacy signed sources cannot rotate credentials. Create a bearer source instead.",
          });
        }
        await tx
          .update(inventorySources)
          .set({
            apiKeyHash: key.hash,
            apiKeyHint: key.hint,
            keyRotatedAt: now,
            updatedAt: now,
          })
          .where(eq(inventorySources.id, source.id));
        await appendAuditEvent(tx, {
          actorType: "user",
          actorId: ctx.user.id,
          action: "inventory.credential_rotated",
          entityType: "inventory_source",
          entityId: source.id,
          summary: "Seller rotated an inventory source credential.",
          metadata: { credentialHint: key.hint },
        });
        return { sourceId: source.id, apiKey: key.plaintext };
      });
    }),

  setSourceStatus: strictSellerProcedure
    .input(
      z.object({
        sourceId: z.string().uuid(),
        status: sourceStatusSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const now = new Date();
        const [current] = await tx
          .select({
            id: inventorySources.id,
            status: inventorySources.status,
          })
          .from(inventorySources)
          .where(
            and(
              eq(inventorySources.id, input.sourceId),
              eq(inventorySources.sellerId, ctx.user.id),
            ),
          )
          .for("update");
        if (!current) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Inventory source not found",
          });
        }
        if (current.status === "revoked" && input.status !== "revoked") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A revoked source cannot be resumed",
          });
        }
        const [updated] = await tx
          .update(inventorySources)
          .set({
            status: input.status,
            revokedAt: input.status === "revoked" ? now : null,
            updatedAt: now,
          })
          .where(eq(inventorySources.id, current.id))
          .returning({
            id: inventorySources.id,
            status: inventorySources.status,
          });
        await appendAuditEvent(tx, {
          actorType: "user",
          actorId: ctx.user.id,
          action:
            input.status === "revoked"
              ? "inventory.source_revoked"
              : "inventory.source_status_changed",
          entityType: "inventory_source",
          entityId: current.id,
          summary:
            input.status === "revoked"
              ? "Seller revoked an inventory source."
              : "Seller changed an inventory source status.",
          metadata: {
            previousStatus: current.status,
            nextStatus: input.status,
          },
        });
        return updated;
      });
    }),

  bindItem: strictSellerProcedure
    .input(
      z.object({
        sourceItemId: z.string().uuid(),
        listingId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [sourceItem] = await tx
          .select({
            id: inventorySourceItems.id,
            sourceId: inventorySourceItems.sourceId,
            sellerId: inventorySourceItems.sellerId,
          })
          .from(inventorySourceItems)
          .where(
            and(
              eq(inventorySourceItems.id, input.sourceItemId),
              eq(inventorySourceItems.sellerId, ctx.user.id),
            ),
          )
          .for("update");
        if (!sourceItem) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "External inventory item not found",
          });
        }
        const [listing] = await tx
          .select({
            id: listings.id,
            totalSqFt: listings.totalSqFt,
          })
          .from(listings)
          .where(
            and(
              eq(listings.id, input.listingId),
              eq(listings.sellerId, ctx.user.id),
              ne(listings.status, "archived"),
            ),
          )
          .for("update");
        if (!listing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Listing not found",
          });
        }
        try {
          const [updated] = await tx
            .update(inventorySourceItems)
            .set({ listingId: listing.id, updatedAt: new Date() })
            .where(eq(inventorySourceItems.id, sourceItem.id))
            .returning();
          await tx
            .update(inventoryReconciliations)
            .set({
              listingId: listing.id,
              marketplaceQuantity: listing.totalSqFt,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(
                  inventoryReconciliations.sourceItemId,
                  sourceItem.id,
                ),
                eq(inventoryReconciliations.status, "open"),
              ),
            );
          await appendAuditEvent(tx, {
            actorType: "user",
            actorId: ctx.user.id,
            action: "inventory.item_bound",
            entityType: "inventory_source_item",
            entityId: sourceItem.id,
            summary: "Seller mapped an external inventory item to a listing.",
            metadata: {
              sourceId: sourceItem.sourceId,
              listingId: listing.id,
            },
          });
          return updated;
        } catch (error) {
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "23505"
          ) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "This listing is already mapped to a different item from the same source",
            });
          }
          throw error;
        }
      });
    }),

  applyReconciliation: strictSellerProcedure
    .input(z.object({ reconciliationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await applyInventoryReconciliation({
          reconciliationId: input.reconciliationId,
          sellerId: ctx.user.id,
          actorUserId: ctx.user.id,
        });
      } catch (error) {
        mutationError(error);
      }
    }),

  dismissReconciliation: strictSellerProcedure
    .input(
      z.object({
        reconciliationId: z.string().uuid(),
        reason: z.string().trim().min(10).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const now = new Date();
        const [dismissed] = await tx
          .update(inventoryReconciliations)
          .set({
            status: "dismissed",
            resolution: input.reason,
            resolvedAt: now,
            resolvedBy: ctx.user.id,
            updatedAt: now,
          })
          .where(
            and(
              eq(inventoryReconciliations.id, input.reconciliationId),
              eq(inventoryReconciliations.sellerId, ctx.user.id),
              eq(inventoryReconciliations.status, "open"),
            ),
          )
          .returning({
            id: inventoryReconciliations.id,
            sourceId: inventoryReconciliations.sourceId,
            sourceItemId: inventoryReconciliations.sourceItemId,
          });
        if (!dismissed) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Open inventory reconciliation not found",
          });
        }
        const [remaining] = await tx
          .select({ value: count() })
          .from(inventoryReconciliations)
          .where(
            and(
              eq(
                inventoryReconciliations.sourceItemId,
                dismissed.sourceItemId,
              ),
              eq(inventoryReconciliations.status, "open"),
            ),
          );
        if (Number(remaining?.value ?? 0) === 0) {
          await tx
            .update(reconciliationCases)
            .set({
              status: "dismissed",
              resolution: `Seller dismissed the inventory mismatch: ${input.reason}`,
              resolvedAt: now,
              resolvedBy: ctx.user.id,
              updatedAt: now,
            })
            .where(
              eq(
                reconciliationCases.caseKey,
                `inventory:${dismissed.sourceId}:${dismissed.sourceItemId}`,
              ),
            );
        }
        await appendAuditEvent(tx, {
          actorType: "user",
          actorId: ctx.user.id,
          action: "inventory.reconciliation_dismissed",
          entityType: "inventory_reconciliation",
          entityId: dismissed.id,
          summary: "Seller dismissed an inventory feed mismatch.",
          metadata: {
            sourceId: dismissed.sourceId,
            sourceItemId: dismissed.sourceItemId,
            dismissalReason: input.reason,
          },
        });
        return { id: dismissed.id, status: "dismissed" as const };
      });
    }),

  adminOverview: adminProcedure.query(async ({ ctx }) => {
    const [sourceRows, openMismatches, batchFailures] = await Promise.all([
      ctx.db
        .select({
          id: inventorySources.id,
          sellerId: inventorySources.sellerId,
          sellerName: users.businessName,
          sellerEmail: users.email,
          name: inventorySources.name,
          externalSourceId: inventorySources.externalSourceId,
          authMode: inventorySources.authMode,
          status: inventorySources.status,
          staleAfterMinutes: inventorySources.staleAfterMinutes,
          lastSuccessfulIngestAt: inventorySources.lastSuccessfulIngestAt,
          lastErrorAt: inventorySources.lastErrorAt,
          lastErrorCode: inventorySources.lastErrorCode,
          createdAt: inventorySources.createdAt,
        })
        .from(inventorySources)
        .innerJoin(users, eq(inventorySources.sellerId, users.id))
        .orderBy(asc(inventorySources.lastSuccessfulIngestAt))
        .limit(500),
      ctx.db
        .select({
          id: inventoryReconciliations.id,
          sellerId: inventoryReconciliations.sellerId,
          sellerName: users.businessName,
          sourceId: inventoryReconciliations.sourceId,
          sourceName: inventorySources.name,
          externalItemId: inventorySourceItems.externalItemId,
          listingId: inventoryReconciliations.listingId,
          listingTitle: listings.title,
          reason: inventoryReconciliations.reason,
          reportedQuantity: inventoryReconciliations.reportedQuantity,
          marketplaceQuantity:
            inventoryReconciliations.marketplaceQuantity,
          reservedQuantity: inventoryReconciliations.reservedQuantity,
          detectedAt: inventoryReconciliations.detectedAt,
        })
        .from(inventoryReconciliations)
        .innerJoin(
          inventorySources,
          eq(inventoryReconciliations.sourceId, inventorySources.id),
        )
        .innerJoin(users, eq(inventoryReconciliations.sellerId, users.id))
        .innerJoin(
          inventorySourceItems,
          eq(
            inventoryReconciliations.sourceItemId,
            inventorySourceItems.id,
          ),
        )
        .leftJoin(listings, eq(inventoryReconciliations.listingId, listings.id))
        .where(eq(inventoryReconciliations.status, "open"))
        .orderBy(desc(inventoryReconciliations.detectedAt))
        .limit(250),
      ctx.db
        .select({
          id: inventoryIngestBatches.id,
          sellerId: inventoryIngestBatches.sellerId,
          sourceId: inventoryIngestBatches.sourceId,
          sourceName: inventorySources.name,
          errorCode: inventoryIngestBatches.errorCode,
          itemCount: inventoryIngestBatches.itemCount,
          startedAt: inventoryIngestBatches.startedAt,
        })
        .from(inventoryIngestBatches)
        .innerJoin(
          inventorySources,
          eq(inventoryIngestBatches.sourceId, inventorySources.id),
        )
        .where(eq(inventoryIngestBatches.status, "failed"))
        .orderBy(desc(inventoryIngestBatches.startedAt))
        .limit(100),
    ]);
    const sources = sourceRows.map((source) => ({
      ...source,
      stale: isSourceStale(source),
    }));
    return {
      sources,
      staleSources: sources.filter((source) => source.stale),
      openMismatches,
      batchFailures,
      totals: {
        sources: sources.length,
        activeSources: sources.filter((source) => source.status === "active")
          .length,
        staleSources: sources.filter((source) => source.stale).length,
        openMismatches: openMismatches.length,
        recentFailures: batchFailures.length,
      },
    };
  }),
});
