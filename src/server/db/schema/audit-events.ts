import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const auditActorTypeEnum = pgEnum("audit_actor_type", [
  "user",
  "admin",
  "system",
  "provider",
]);

/**
 * Security and financial audit ledger.
 *
 * Database migration 0024 makes this table append-only. Application code must
 * never update or delete an audit row.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorType: auditActorTypeEnum("actor_type").notNull(),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: varchar("entity_id", { length: 255 }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    requestId: varchar("request_id", { length: 255 }),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_events_entity_created_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
    index("audit_events_actor_created_idx").on(
      table.actorId,
      table.createdAt,
    ),
    index("audit_events_action_created_idx").on(
      table.action,
      table.createdAt,
    ),
    uniqueIndex("audit_events_idempotency_key_unique_idx")
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    check(
      "audit_events_actor_identity_check",
      sql`${table.actorType} IN ('system', 'provider') OR ${table.actorId} IS NOT NULL`,
    ),
    check(
      "audit_events_action_nonempty_check",
      sql`NULLIF(TRIM(${table.action}), '') IS NOT NULL`,
    ),
    check(
      "audit_events_entity_type_nonempty_check",
      sql`NULLIF(TRIM(${table.entityType}), '') IS NOT NULL`,
    ),
    check(
      "audit_events_summary_nonempty_check",
      sql`NULLIF(TRIM(${table.summary}), '') IS NOT NULL`,
    ),
  ],
);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
