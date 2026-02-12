import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
  real,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { money } from "../custom-types";
import { users } from "./users";

export const listingStatusEnum = pgEnum("listing_status", [
  "draft",
  "active",
  "sold",
  "expired",
  "archived",
]);

export const materialTypeEnum = pgEnum("material_type", [
  "hardwood",
  "engineered",
  "laminate",
  "vinyl_lvp",
  "bamboo",
  "tile",
  "other",
]);

export const finishTypeEnum = pgEnum("finish_type", [
  "matte",
  "semi_gloss",
  "gloss",
  "wire_brushed",
  "hand_scraped",
  "distressed",
  "smooth",
  "textured",
  "oiled",
  "unfinished",
  "other",
]);

export const gradeTypeEnum = pgEnum("grade_type", [
  "select",
  "1_common",
  "2_common",
  "3_common",
  "cabin",
  "character",
  "rustic",
  "premium",
  "standard",
  "economy",
  "other",
]);

export const conditionTypeEnum = pgEnum("condition_type", [
  "new_overstock",
  "discontinued",
  "slight_damage",
  "returns",
  "seconds",
  "remnants",
  "closeout",
  "other",
]);

export const reasonCodeEnum = pgEnum("reason_code", [
  "overproduction",
  "color_change",
  "line_discontinuation",
  "warehouse_clearance",
  "customer_return",
  "slight_defect",
  "packaging_damage",
  "end_of_season",
  "other",
]);

export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    status: listingStatusEnum("status").notNull().default("draft"),

    // Product details
    materialType: materialTypeEnum("material_type").notNull(),
    species: varchar("species", { length: 100 }),
    finish: finishTypeEnum("finish"),
    grade: gradeTypeEnum("grade"),
    color: varchar("color", { length: 100 }),
    colorFamily: varchar("color_family", { length: 50 }),
    thickness: real("thickness"),
    width: real("width"),
    length: real("length"),
    brand: varchar("brand", { length: 255 }),
    modelNumber: varchar("model_number", { length: 255 }),

    // Lot details
    sqFtPerBox: real("sq_ft_per_box"),
    boxesPerPallet: integer("boxes_per_pallet"),
    totalSqFt: real("total_sq_ft").notNull(),
    originalTotalSqFt: real("original_total_sq_ft"),
    totalPallets: integer("total_pallets"),
    moq: real("moq"),
    locationCity: varchar("location_city", { length: 100 }),
    locationState: varchar("location_state", { length: 2 }),
    locationZip: varchar("location_zip", { length: 10 }),

    // Pricing (using exact numeric type to avoid floating-point errors)
    askPricePerSqFt: money("ask_price_per_sq_ft").notNull(),
    buyNowPrice: money("buy_now_price"),
    allowOffers: boolean("allow_offers").default(true).notNull(),
    floorPrice: money("floor_price"),

    // Condition & certifications
    condition: conditionTypeEnum("condition").notNull(),
    reasonCode: reasonCodeEnum("reason_code"),
    certifications: jsonb("certifications").$type<string[]>().default([]),

    // Engagement
    viewsCount: integer("views_count").default(0).notNull(),
    watchlistCount: integer("watchlist_count").default(0).notNull(),
    offerCount: integer("offer_count").default(0).notNull(),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    soldAt: timestamp("sold_at", { withTimezone: true }),
  },
  (table) => [
    index("listings_seller_id_idx").on(table.sellerId),
    index("listings_status_idx").on(table.status),
    index("listings_material_type_idx").on(table.materialType),
    index("listings_condition_idx").on(table.condition),
    index("listings_location_state_idx").on(table.locationState),
    index("listings_ask_price_idx").on(table.askPricePerSqFt),
    index("listings_created_at_idx").on(table.createdAt),
    index("listings_total_sq_ft_idx").on(table.totalSqFt),
  ]
);

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
