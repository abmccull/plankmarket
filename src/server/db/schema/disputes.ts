import {
  boolean,
  check,
  integer,
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { orders } from "./orders";
import { media } from "./media";

export const disputeStatusEnum = pgEnum("dispute_status", [
  "open",
  "under_review",
  "resolved_buyer",
  "resolved_seller",
  "closed",
]);

export const disputeReasonCodeEnum = pgEnum("dispute_reason_code", [
  "freight_damage",
  "quantity_shortage",
  "wrong_item",
  "quality_mismatch",
  "condition_mismatch",
  "missing_documentation",
  "other",
]);

export const disputeSourceEnum = pgEnum("dispute_source", [
  "buyer",
  "admin",
  "stripe",
]);

export const disputeEvidenceTypeEnum = pgEnum("dispute_evidence_type", [
  "photo",
  "bol",
  "delivery_receipt",
  "invoice",
  "correspondence",
  "other",
]);

export const disputes = pgTable(
  "disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "restrict" })
      .unique()
      .notNull(),
    initiatorId: uuid("initiator_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),

    // Dispute details
    reason: varchar("reason", { length: 255 }).notNull(),
    reasonCode: disputeReasonCodeEnum("reason_code")
      .notNull()
      .default("other"),
    source: disputeSourceEnum("source").notNull().default("buyer"),
    description: text("description").notNull(),
    deliveryOccurredAt: timestamp("delivery_occurred_at", {
      withTimezone: true,
    }),
    reportingDeadlineAt: timestamp("reporting_deadline_at", {
      withTimezone: true,
    }),
    reportingWindowOverrideReason: text("reporting_window_override_reason"),
    reportedLate: boolean("reported_late").notNull().default(false),
    damageVisibleAtDelivery: boolean("damage_visible_at_delivery"),
    bolDamageNoted: boolean("bol_damage_noted"),
    bolNotes: text("bol_notes"),

    // Status
    status: disputeStatusEnum("status").notNull().default("open"),

    // Resolution
    resolution: text("resolution"),
    resolvedBy: uuid("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedRefundAmountCents: integer("resolved_refund_amount_cents"),
    payoutRequeuedAt: timestamp("payout_requeued_at", {
      withTimezone: true,
    }),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("disputes_order_id_idx").on(table.orderId),
    index("disputes_initiator_id_idx").on(table.initiatorId),
    index("disputes_status_idx").on(table.status),
    index("disputes_created_at_idx").on(table.createdAt),
    check(
      "disputes_resolved_refund_nonnegative_check",
      sql`${table.resolvedRefundAmountCents} is null or ${table.resolvedRefundAmountCents} >= 0`,
    ),
    check(
      "disputes_late_admin_override_check",
      sql`not ${table.reportedLate} or (${table.source} = 'admin' and nullif(trim(${table.reportingWindowOverrideReason}), '') is not null)`,
    ),
  ]
);

export const disputeEvidence = pgTable(
  "dispute_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    disputeId: uuid("dispute_id")
      .references(() => disputes.id, { onDelete: "cascade" })
      .notNull(),
    mediaId: uuid("media_id")
      .references(() => media.id, { onDelete: "restrict" })
      .unique()
      .notNull(),
    uploaderId: uuid("uploader_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    evidenceType: disputeEvidenceTypeEnum("evidence_type").notNull(),
    description: varchar("description", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("dispute_evidence_dispute_id_idx").on(table.disputeId),
    index("dispute_evidence_uploader_id_idx").on(table.uploaderId),
    index("dispute_evidence_type_idx").on(table.evidenceType),
  ],
);

export const disputeMessages = pgTable(
  "dispute_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    disputeId: uuid("dispute_id")
      .references(() => disputes.id, { onDelete: "cascade" })
      .notNull(),
    senderId: uuid("sender_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),

    // Message content
    message: text("message").notNull(),

    // Timestamp
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("dispute_messages_dispute_id_idx").on(table.disputeId),
    index("dispute_messages_sender_id_idx").on(table.senderId),
    index("dispute_messages_created_at_idx").on(table.createdAt),
  ]
);

export type Dispute = typeof disputes.$inferSelect;
export type NewDispute = typeof disputes.$inferInsert;
export type DisputeEvidence = typeof disputeEvidence.$inferSelect;
export type NewDisputeEvidence = typeof disputeEvidence.$inferInsert;
export type DisputeMessage = typeof disputeMessages.$inferSelect;
export type NewDisputeMessage = typeof disputeMessages.$inferInsert;
