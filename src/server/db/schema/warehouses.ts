import { pgTable, uuid, varchar, text, boolean, integer, real, timestamp, index, uniqueIndex, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
export const warehouses = pgTable("warehouses", {
  id: uuid("id").primaryKey().defaultRandom(),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  label: varchar("label", { length: 100 }).notNull(),
  address: text("address").notNull(), city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 2 }).notNull(), zip: varchar("zip", { length: 5 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 30 }).notNull(),
  pickupStart: varchar("pickup_start", { length: 5 }).notNull(),
  pickupEnd: varchar("pickup_end", { length: 5 }).notNull(),
  hasLoadingDock: boolean("has_loading_dock").default(false).notNull(),
  hasForklift: boolean("has_forklift").default(false).notNull(),
  latitude: real("latitude"), longitude: real("longitude"),
  coordinateSource: varchar("coordinate_source", { length: 30 }).default("zip_centroid").notNull(),
  active: boolean("active").default(true).notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  revision: integer("revision").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [unique("warehouses_id_seller_key").on(t.id,t.sellerId), index("warehouses_seller_idx").on(t.sellerId), uniqueIndex("warehouses_one_default_idx").on(t.sellerId).where(sql`${t.isDefault}`), check("warehouse_default_active", sql`NOT ${t.isDefault} OR ${t.active}`)]);
export type Warehouse = typeof warehouses.$inferSelect;
