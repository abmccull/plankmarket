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
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { ListingTaxCodeStatus } from "@/lib/tax-policy";
import { money } from "../custom-types";
import { users } from "./users";
import { promotionTierEnum } from "./promotions";

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

export const moqUnitEnum = pgEnum("moq_unit", ["pallets", "sqft"]);
export const sellingTerritoryModeEnum = pgEnum("selling_territory_mode", [
  "unrestricted",
  "allowed_states",
]);
export const freightPaymentModeEnum = pgEnum("freight_payment_mode", [
  "buyer_pays",
  "seller_pays",
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
    slug: text("slug").unique(),
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
    wearLayer: real("wear_layer"),
    brand: varchar("brand", { length: 255 }),
    modelNumber: varchar("model_number", { length: 255 }),

    // Lot details
    sqFtPerBox: real("sq_ft_per_box"),
    boxesPerPallet: integer("boxes_per_pallet"),
    totalSqFt: real("total_sq_ft").notNull(),
    originalTotalSqFt: real("original_total_sq_ft"),
    totalPallets: integer("total_pallets"),
    moq: real("moq"),
    moqUnit: moqUnitEnum("moq_unit").default("sqft"),

    // Freight / shipping dimensions (required for new listings, nullable for legacy data)
    palletWeight: real("pallet_weight"), // lbs per pallet
    palletLength: real("pallet_length"), // inches
    palletWidth: real("pallet_width"), // inches
    palletHeight: real("pallet_height"), // inches
    nmfcCode: varchar("nmfc_code", { length: 20 }),
    freightClass: varchar("freight_class", { length: 10 }),
    locationCity: varchar("location_city", { length: 100 }),
    locationState: varchar("location_state", { length: 2 }),
    locationZip: varchar("location_zip", { length: 10 }),
    locationLat: real("location_lat"),
    locationLng: real("location_lng"),

    // Pricing (using exact numeric type to avoid floating-point errors)
    askPricePerSqFt: money("ask_price_per_sq_ft").notNull(),
    originalAskPricePerSqFt: money("original_ask_price_per_sq_ft"),
    buyNowPrice: money("buy_now_price"),
    allowOffers: boolean("allow_offers").default(true).notNull(),
    floorPrice: money("floor_price"),
    fullLotOnly: boolean("full_lot_only").default(false).notNull(),
    partialQuantityMarkupPercent: real("partial_quantity_markup_percent"),
    automaticMarkdownEnabled: boolean("automatic_markdown_enabled")
      .default(false)
      .notNull(),
    automaticMarkdownFloorPercent: real("automatic_markdown_floor_percent"),
    automaticMarkdownIntervalDays: integer("automatic_markdown_interval_days"),
    automaticMarkdownStartedAt: timestamp("automatic_markdown_started_at", {
      withTimezone: true,
    }),
    automaticMarkdownCurrentStep: integer("automatic_markdown_current_step")
      .default(0)
      .notNull(),
    automaticMarkdownLastAppliedAt: timestamp(
      "automatic_markdown_last_applied_at",
      {
        withTimezone: true,
      },
    ),
    pricingRulesVersion: integer("pricing_rules_version").default(1).notNull(),
    allowSampleRequests: boolean("allow_sample_requests")
      .default(false)
      .notNull(),
    territoryMode: sellingTerritoryModeEnum("territory_mode")
      .default("unrestricted")
      .notNull(),
    allowedDestinationStates: jsonb("allowed_destination_states")
      .$type<string[]>()
      .default([]),
    freightPaymentMode: freightPaymentModeEnum("freight_payment_mode")
      .default("buyer_pays")
      .notNull(),
    sellerFreightStates: jsonb("seller_freight_states")
      .$type<string[]>()
      .default([]),
    freightDropCharge: money("freight_drop_charge"),

    // Condition & certifications
    condition: conditionTypeEnum("condition").notNull(),
    reasonCode: reasonCodeEnum("reason_code"),
    certifications: jsonb("certifications").$type<string[]>().default([]),
    // Stripe Tax codes are deliberately nullable. A seller or migration must
    // never guess a category; an admin explicitly verifies the selected code.
    stripeTaxCode: varchar("stripe_tax_code", { length: 64 }),
    taxCodeStatus: varchar("tax_code_status", { length: 32 })
      .$type<ListingTaxCodeStatus>()
      .default("unassigned")
      .notNull(),
    taxCodeVerifiedAt: timestamp("tax_code_verified_at", {
      withTimezone: true,
    }),
    taxCodeVerifiedBy: uuid("tax_code_verified_by").references(
      () => users.id,
      { onDelete: "set null" },
    ),

    // Engagement
    viewsCount: integer("views_count").default(0).notNull(),
    watchlistCount: integer("watchlist_count").default(0).notNull(),
    offerCount: integer("offer_count").default(0).notNull(),

    // Promotion (denormalized for fast query sorting)
    promotionTier: promotionTierEnum("promotion_tier"),
    promotionExpiresAt: timestamp("promotion_expires_at", {
      withTimezone: true,
    }),

    // Quality & shipping
    qualityScore: integer("quality_score").default(0),
    shipReady: boolean("ship_ready").default(false),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),
    confirmationDueAt: timestamp("confirmation_due_at", {
      withTimezone: true,
    }),

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
    index("listings_slug_idx").on(table.slug),
    index("listings_ask_price_idx").on(table.askPricePerSqFt),
    index("listings_created_at_idx").on(table.createdAt),
    index("listings_confirmation_due_at_idx").on(table.confirmationDueAt),
    index("listings_total_sq_ft_idx").on(table.totalSqFt),
    index("listings_location_lat_lng_idx").on(table.locationLat, table.locationLng),
    index("listings_tax_code_status_idx").on(table.taxCodeStatus),
    check(
      "listings_tax_code_status_check",
      sql`${table.taxCodeStatus} IN ('unassigned', 'pending_review', 'verified')`,
    ),
    check(
      "listings_stripe_tax_code_format_check",
      sql`${table.stripeTaxCode} IS NULL OR ${table.stripeTaxCode} ~ '^txcd_[0-9]+$'`,
    ),
    check(
      "listings_verified_tax_code_evidence_check",
      sql`${table.taxCodeStatus} <> 'verified' OR (
        ${table.stripeTaxCode} IS NOT NULL
        AND ${table.taxCodeVerifiedAt} IS NOT NULL
        AND ${table.taxCodeVerifiedBy} IS NOT NULL
      )`,
    ),
  ]
);

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
