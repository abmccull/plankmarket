import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { disputes } from "./disputes";
import { orders } from "./orders";
import { users } from "./users";

export const reconciliationCaseStatusEnum = pgEnum(
  "reconciliation_case_status",
  ["open", "in_progress", "waiting_external", "resolved", "dismissed"],
);

export const reconciliationCaseSeverityEnum = pgEnum(
  "reconciliation_case_severity",
  ["low", "medium", "high", "critical"],
);

export const reconciliationCaseTypeEnum = pgEnum("reconciliation_case_type", [
  "payment_mismatch",
  "payout_failure",
  "refund_failure",
  "shipment_ambiguity",
  "provider_failure",
  "webhook_failure",
  "email_delivery",
  "promotion_refund",
  "dispute_resolution",
  "data_integrity",
  "other",
]);

export const reconciliationCaseSourceEnum = pgEnum(
  "reconciliation_case_source",
  [
    "system",
    "admin",
    "stripe",
    "priority1",
    "resend",
    "inngest",
    "supabase",
    "other",
  ],
);

export const reconciliationCaseEventTypeEnum = pgEnum(
  "reconciliation_case_event_type",
  [
    "opened",
    "status_changed",
    "assigned",
    "note",
    "attempt",
    "provider_update",
    "resolved",
    "reopened",
  ],
);

export const reconciliationCases = pgTable(
  "reconciliation_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseKey: varchar("case_key", { length: 255 }).unique().notNull(),
    type: reconciliationCaseTypeEnum("type").notNull(),
    source: reconciliationCaseSourceEnum("source").notNull(),
    status: reconciliationCaseStatusEnum("status").notNull().default("open"),
    severity: reconciliationCaseSeverityEnum("severity")
      .notNull()
      .default("medium"),
    title: varchar("title", { length: 255 }).notNull(),
    summary: text("summary").notNull(),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    disputeId: uuid("dispute_id").references(() => disputes.id, {
      onDelete: "set null",
    }),
    externalReference: varchar("external_reference", { length: 255 }),
    amountCents: integer("amount_cents"),
    currency: varchar("currency", { length: 3 }).notNull().default("usd"),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    assignedTo: uuid("assigned_to").references(() => users.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolution: text("resolution"),
    resolvedBy: uuid("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    firstDetectedAt: timestamp("first_detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("reconciliation_cases_status_severity_idx").on(
      table.status,
      table.severity,
    ),
    index("reconciliation_cases_order_id_idx").on(table.orderId),
    index("reconciliation_cases_dispute_id_idx").on(table.disputeId),
    index("reconciliation_cases_assigned_to_idx").on(table.assignedTo),
    index("reconciliation_cases_next_retry_idx")
      .on(table.nextRetryAt)
      .where(
        sql`${table.status} in ('open', 'in_progress', 'waiting_external')`,
      ),
    check(
      "reconciliation_cases_amount_nonnegative_check",
      sql`${table.amountCents} is null or ${table.amountCents} >= 0`,
    ),
    check(
      "reconciliation_cases_attempt_count_nonnegative_check",
      sql`${table.attemptCount} >= 0`,
    ),
  ],
);

export const reconciliationCaseEvents = pgTable(
  "reconciliation_case_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .references(() => reconciliationCases.id, { onDelete: "cascade" })
      .notNull(),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: reconciliationCaseEventTypeEnum("event_type").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("reconciliation_case_events_case_created_idx").on(
      table.caseId,
      table.createdAt,
    ),
    index("reconciliation_case_events_actor_id_idx").on(table.actorId),
  ],
);

export type ReconciliationCase = typeof reconciliationCases.$inferSelect;
export type NewReconciliationCase = typeof reconciliationCases.$inferInsert;
export type ReconciliationCaseEvent =
  typeof reconciliationCaseEvents.$inferSelect;
export type NewReconciliationCaseEvent =
  typeof reconciliationCaseEvents.$inferInsert;
