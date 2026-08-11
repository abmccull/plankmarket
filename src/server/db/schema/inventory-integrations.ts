import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { listings } from "./listings";
import { users } from "./users";

export const inventorySourceStatusEnum = pgEnum("inventory_source_status", [
  "active",
  "paused",
  "revoked",
]);

export const inventorySourceAuthModeEnum = pgEnum(
  "inventory_source_auth_mode",
  ["bearer", "signed"],
);

export const inventoryIngestStatusEnum = pgEnum("inventory_ingest_status", [
  "processing",
  "completed",
  "failed",
]);

export const inventoryReconciliationStatusEnum = pgEnum(
  "inventory_reconciliation_status",
  ["open", "resolved", "dismissed"],
);

/**
 * A seller-owned connection to an ERP, WMS, spreadsheet automation, or other
 * inventory system. API credentials are deliberately represented only by a
 * one-way SHA-256 digest and a non-sensitive display hint.
 */
export const inventorySources = pgTable(
  "inventory_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    externalSourceId: varchar("external_source_id", { length: 128 }).notNull(),
    authMode: inventorySourceAuthModeEnum("auth_mode")
      .notNull()
      .default("bearer"),
    status: inventorySourceStatusEnum("status").notNull().default("active"),
    apiKeyHash: varchar("api_key_hash", { length: 64 }).notNull(),
    apiKeyHint: varchar("api_key_hint", { length: 32 }).notNull(),
    staleAfterMinutes: integer("stale_after_minutes")
      .notNull()
      .default(1440),
    lastIngestedAt: timestamp("last_ingested_at", { withTimezone: true }),
    lastSuccessfulIngestAt: timestamp("last_successful_ingest_at", {
      withTimezone: true,
    }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 80 }),
    keyRotatedAt: timestamp("key_rotated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_sources_id_seller_idx").on(
      table.id,
      table.sellerId,
    ),
    uniqueIndex("inventory_sources_seller_external_uidx").on(
      table.sellerId,
      table.externalSourceId,
    ),
    uniqueIndex("inventory_sources_api_key_hash_uidx").on(table.apiKeyHash),
    index("inventory_sources_seller_status_idx").on(
      table.sellerId,
      table.status,
    ),
    index("inventory_sources_staleness_idx").on(
      table.status,
      table.lastSuccessfulIngestAt,
    ),
    check(
      "inventory_sources_stale_after_check",
      sql`${table.staleAfterMinutes} between 15 and 43200`,
    ),
    check(
      "inventory_sources_api_key_hash_check",
      sql`length(${table.apiKeyHash}) = 64`,
    ),
  ],
);

/**
 * Stable external-item to marketplace-listing binding. listingId remains
 * nullable so a feed can report new SKUs safely before a seller maps them.
 */
export const inventorySourceItems = pgTable(
  "inventory_source_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .references(() => inventorySources.id, { onDelete: "cascade" })
      .notNull(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    listingId: uuid("listing_id").references(() => listings.id, {
      onDelete: "set null",
    }),
    externalItemId: varchar("external_item_id", { length: 128 }).notNull(),
    lastReportedQuantity: real("last_reported_quantity"),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_source_items_id_source_seller_idx").on(
      table.id,
      table.sourceId,
      table.sellerId,
    ),
    uniqueIndex("inventory_source_items_source_external_uidx").on(
      table.sourceId,
      table.externalItemId,
    ),
    uniqueIndex("inventory_source_items_source_listing_uidx")
      .on(table.sourceId, table.listingId)
      .where(sql`${table.listingId} is not null`),
    index("inventory_source_items_seller_idx").on(table.sellerId),
    index("inventory_source_items_listing_idx").on(table.listingId),
    check(
      "inventory_source_items_quantity_check",
      sql`${table.lastReportedQuantity} is null or ${table.lastReportedQuantity} >= 0`,
    ),
  ],
);

export interface InventoryIngestResult {
  sourceId: string;
  idempotencyKey: string;
  received: number;
  applied: number;
  unchanged: number;
  mismatches: number;
  unbound: number;
  items: Array<{
    externalItemId: string;
    status: "applied" | "unchanged" | "mismatch" | "unbound";
    listingId: string | null;
  }>;
}

/**
 * Durable request-level idempotency and operational evidence for feed runs.
 * The response is persisted so a safe replay returns the original outcome.
 */
export const inventoryIngestBatches = pgTable(
  "inventory_ingest_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .references(() => inventorySources.id, { onDelete: "restrict" })
      .notNull(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    status: inventoryIngestStatusEnum("status")
      .notNull()
      .default("processing"),
    itemCount: integer("item_count").notNull(),
    appliedCount: integer("applied_count").notNull().default(0),
    unchangedCount: integer("unchanged_count").notNull().default(0),
    mismatchCount: integer("mismatch_count").notNull().default(0),
    unboundCount: integer("unbound_count").notNull().default(0),
    result: jsonb("result").$type<InventoryIngestResult>(),
    errorCode: varchar("error_code", { length: 80 }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_ingest_batches_id_source_seller_idx").on(
      table.id,
      table.sourceId,
      table.sellerId,
    ),
    uniqueIndex("inventory_ingest_batches_source_idempotency_uidx").on(
      table.sourceId,
      table.idempotencyKey,
    ),
    index("inventory_ingest_batches_seller_created_idx").on(
      table.sellerId,
      table.createdAt,
    ),
    index("inventory_ingest_batches_status_idx").on(table.status),
    check(
      "inventory_ingest_batches_request_hash_check",
      sql`length(${table.requestHash}) = 64`,
    ),
    check(
      "inventory_ingest_batches_counts_check",
      sql`${table.itemCount} between 1 and 100
        and ${table.appliedCount} >= 0
        and ${table.unchangedCount} >= 0
        and ${table.mismatchCount} >= 0
        and ${table.unboundCount} >= 0`,
    ),
  ],
);

/**
 * Immutable quantity-change ledger. Application code only inserts; it never
 * updates or deletes these records.
 */
export const inventoryAdjustments = pgTable(
  "inventory_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    listingId: uuid("listing_id")
      .references(() => listings.id, { onDelete: "restrict" })
      .notNull(),
    sourceId: uuid("source_id").references(() => inventorySources.id, {
      onDelete: "restrict",
    }),
    sourceItemId: uuid("source_item_id").references(
      () => inventorySourceItems.id,
      { onDelete: "restrict" },
    ),
    ingestBatchId: uuid("ingest_batch_id").references(
      () => inventoryIngestBatches.id,
      { onDelete: "restrict" },
    ),
    previousQuantity: real("previous_quantity").notNull(),
    newQuantity: real("new_quantity").notNull(),
    deltaQuantity: real("delta_quantity").notNull(),
    reason: varchar("reason", { length: 80 }).notNull(),
    actorType: varchar("actor_type", { length: 20 }).notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    idempotencyKey: varchar("idempotency_key", { length: 255 })
      .unique()
      .notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inventory_adjustments_listing_created_idx").on(
      table.listingId,
      table.createdAt,
    ),
    index("inventory_adjustments_source_created_idx").on(
      table.sourceId,
      table.createdAt,
    ),
    check(
      "inventory_adjustments_quantities_check",
      sql`${table.previousQuantity} >= 0
        and ${table.newQuantity} >= 0
        and abs((${table.newQuantity} - ${table.previousQuantity}) - ${table.deltaQuantity}) < 0.0001`,
    ),
    check(
      "inventory_adjustments_reason_check",
      sql`${table.reason} in ('feed_sync', 'manual_reconciliation')`,
    ),
    check(
      "inventory_adjustments_actor_type_check",
      sql`${table.actorType} in ('feed', 'seller', 'admin', 'system')`,
    ),
    check(
      "inventory_adjustments_source_item_requires_source_check",
      sql`${table.sourceItemId} is null or ${table.sourceId} is not null`,
    ),
    check(
      "inventory_adjustments_ingest_batch_requires_source_check",
      sql`${table.ingestBatchId} is null or ${table.sourceId} is not null`,
    ),
  ],
);

/**
 * A feed observation that could not be safely applied. Records are append-only
 * except for their explicit operator/seller resolution fields.
 */
export const inventoryReconciliations = pgTable(
  "inventory_reconciliations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reconciliationKey: varchar("reconciliation_key", { length: 255 })
      .unique()
      .notNull(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    sourceId: uuid("source_id")
      .references(() => inventorySources.id, { onDelete: "restrict" })
      .notNull(),
    sourceItemId: uuid("source_item_id")
      .references(() => inventorySourceItems.id, { onDelete: "restrict" })
      .notNull(),
    listingId: uuid("listing_id").references(() => listings.id, {
      onDelete: "set null",
    }),
    ingestBatchId: uuid("ingest_batch_id").references(
      () => inventoryIngestBatches.id,
      { onDelete: "restrict" },
    ),
    status: inventoryReconciliationStatusEnum("status")
      .notNull()
      .default("open"),
    reason: varchar("reason", { length: 80 }).notNull(),
    reportedQuantity: real("reported_quantity").notNull(),
    marketplaceQuantity: real("marketplace_quantity"),
    reservedQuantity: real("reserved_quantity").notNull().default(0),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolution: text("resolution"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inventory_reconciliations_seller_status_idx").on(
      table.sellerId,
      table.status,
      table.detectedAt,
    ),
    index("inventory_reconciliations_source_status_idx").on(
      table.sourceId,
      table.status,
    ),
    index("inventory_reconciliations_listing_idx").on(table.listingId),
    check(
      "inventory_reconciliations_quantities_check",
      sql`${table.reportedQuantity} >= 0
        and (${table.marketplaceQuantity} is null or ${table.marketplaceQuantity} >= 0)
        and ${table.reservedQuantity} >= 0`,
    ),
    check(
      "inventory_reconciliations_reason_check",
      sql`${table.reason} in ('unbound_item', 'binding_conflict', 'listing_not_owned', 'active_reservation', 'stale_observation', 'invalid_observation_time')`,
    ),
  ],
);

export type InventorySource = typeof inventorySources.$inferSelect;
export type NewInventorySource = typeof inventorySources.$inferInsert;
export type InventorySourceItem = typeof inventorySourceItems.$inferSelect;
export type NewInventorySourceItem = typeof inventorySourceItems.$inferInsert;
export type InventoryIngestBatch = typeof inventoryIngestBatches.$inferSelect;
export type InventoryAdjustment = typeof inventoryAdjustments.$inferSelect;
export type InventoryReconciliation =
  typeof inventoryReconciliations.$inferSelect;
