import { pgTable, uuid, varchar, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
export type ListingImportResponse = { batchId: string; count: number; listings: Array<{ id: string; title: string; materialType: "hardwood" | "engineered" | "laminate" | "vinyl_lvp" | "bamboo" | "tile" | "other"; totalSqFt: number; askPricePerSqFt: number }> };
export const importRequests = pgTable("import_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestId: uuid("request_id").notNull(),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  response: jsonb("response").$type<ListingImportResponse>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("import_requests_seller_request_unique").on(table.sellerId, table.requestId)]);
