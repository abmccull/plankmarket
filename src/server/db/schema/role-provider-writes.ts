// Candidate target: src/server/db/schema/role-provider-writes.ts
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users, userRoleEnum } from "./users";

export type RoleWritePurpose = "seller_activation" | "seller_activation_cleanup" | "admin_role" | "admin_role_repair" | "registration";
export const roleProviderWrites = pgTable("role_provider_writes", {
  id: uuid("id").primaryKey(),
  version: integer("version").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  authId: uuid("auth_id").notNull(),
  expectedRole: userRoleEnum("expected_role").notNull(),
  activationMarker: uuid("activation_marker"),
  purpose: text("purpose").$type<RoleWritePurpose>().notNull(),
  sourceId: uuid("source_id"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, table => [
  uniqueIndex("role_provider_one_unconfirmed_user_idx").on(table.userId).where(sql`${table.confirmedAt} IS NULL`),
  uniqueIndex("role_provider_one_unconfirmed_auth_idx").on(table.authId).where(sql`${table.confirmedAt} IS NULL`),
  uniqueIndex("role_provider_writes_user_id_version_key").on(table.userId, table.version),
  index("role_provider_latest_user_idx").on(table.userId, table.version.desc()),
  check("role_provider_writes_version_check", sql`${table.version}>0`),
  check("role_provider_writes_purpose_check", sql`${table.purpose} IN ('seller_activation','seller_activation_cleanup','admin_role','admin_role_repair','registration')`),
  check("role_provider_writes_check", sql`${table.confirmedAt} IS NULL OR ${table.confirmedAt}>=${table.issuedAt}`),
]);
export type RoleProviderWrite = typeof roleProviderWrites.$inferSelect;
