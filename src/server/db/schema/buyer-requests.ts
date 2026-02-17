import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  real,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { listings } from "./listings";

export const buyerRequestStatusEnum = pgEnum("buyer_request_status", [
  "open",
  "matched",
  "closed",
  "expired",
]);

export const requestResponseStatusEnum = pgEnum("request_response_status", [
  "sent",
  "viewed",
  "accepted",
  "declined",
]);

export interface BuyerRequestSpecs {
  thicknessMinMm?: number;
  wearLayerMinMil?: number;
  installTypes?: string[];
  waterproofRequired?: boolean;
  species?: string[];
  finishTypes?: string[];
  certifications?: string[];
}

export const buyerRequests = pgTable(
  "buyer_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyerId: uuid("buyer_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    status: buyerRequestStatusEnum("status").notNull().default("open"),

    // Structured demand fields
    materialTypes: jsonb("material_types").$type<string[]>().notNull(),
    minTotalSqFt: real("min_total_sq_ft").notNull(),
    maxTotalSqFt: real("max_total_sq_ft"),
    priceMaxPerSqFt: real("price_max_per_sq_ft").notNull(),
    priceMinPerSqFt: real("price_min_per_sq_ft"),

    // Location
    destinationZip: varchar("destination_zip", { length: 10 }).notNull(),
    pickupOk: boolean("pickup_ok").default(false).notNull(),
    pickupRadiusMiles: integer("pickup_radius_miles"),
    shippingOk: boolean("shipping_ok").default(true).notNull(),

    // Specs (optional structured)
    specs: jsonb("specs").$type<BuyerRequestSpecs>(),

    // Free text
    notes: text("notes"),
    urgency: varchar("urgency", { length: 20 }).notNull().default("flexible"), // asap | 2_weeks | 4_weeks | flexible

    // Engagement tracking
    responseCount: integer("response_count").default(0).notNull(),
    viewCount: integer("view_count").default(0).notNull(),

    // Lifecycle
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("buyer_requests_buyer_id_idx").on(table.buyerId),
    index("buyer_requests_status_idx").on(table.status),
    index("buyer_requests_destination_zip_idx").on(table.destinationZip),
    index("buyer_requests_created_at_idx").on(table.createdAt),
  ]
);

export const buyerRequestResponses = pgTable(
  "buyer_request_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .references(() => buyerRequests.id, { onDelete: "cascade" })
      .notNull(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    listingId: uuid("listing_id").references(() => listings.id, {
      onDelete: "set null",
    }),
    message: text("message").notNull(),
    status: requestResponseStatusEnum("status").notNull().default("sent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("buyer_request_responses_request_id_idx").on(table.requestId),
    index("buyer_request_responses_seller_id_idx").on(table.sellerId),
  ]
);

export type BuyerRequest = typeof buyerRequests.$inferSelect;
export type NewBuyerRequest = typeof buyerRequests.$inferInsert;
export type BuyerRequestResponse = typeof buyerRequestResponses.$inferSelect;
export type NewBuyerRequestResponse = typeof buyerRequestResponses.$inferInsert;
