import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
  real,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const userPreferences = pgTable(
  "user_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 10 }).notNull(), // 'buyer' | 'seller'

    // === BUYER FIELDS ===
    preferredZip: varchar("preferred_zip", { length: 10 }),
    preferredRadiusMiles: integer("preferred_radius_miles").default(100),
    preferredMaterialTypes: jsonb("preferred_material_types").$type<string[]>(),
    preferredSpecies: jsonb("preferred_species").$type<string[]>(),
    preferredUseCase: varchar("preferred_use_case", { length: 50 }), // residential | commercial | multifamily | flips | other
    minLotSizeSqFt: real("min_lot_size_sq_ft"),
    maxLotSizeSqFt: real("max_lot_size_sq_ft"),
    priceMinPerSqFt: real("price_min_per_sq_ft"),
    priceMaxPerSqFt: real("price_max_per_sq_ft"),
    preferredShippingMode: varchar("preferred_shipping_mode", { length: 20 }), // pickup | ship | both
    urgency: varchar("urgency", { length: 20 }), // asap | 2_weeks | 4_weeks | flexible
    preferredInstallTypes: jsonb("preferred_install_types").$type<string[]>(),
    minThicknessMm: real("min_thickness_mm"),
    minWearLayerMil: real("min_wear_layer_mil"),
    preferredCertifications: jsonb("preferred_certifications").$type<string[]>(),
    waterproofRequired: boolean("waterproof_required").default(false),

    // === SELLER FIELDS ===
    originZip: varchar("origin_zip", { length: 10 }),
    shipCapable: boolean("ship_capable").default(false),
    leadTimeDaysMin: integer("lead_time_days_min"),
    leadTimeDaysMax: integer("lead_time_days_max"),
    typicalMaterialTypes: jsonb("typical_material_types").$type<string[]>(),
    minLotSqFt: real("min_lot_sq_ft"),
    avgLotSqFt: real("avg_lot_sq_ft"),
    canSplitLots: boolean("can_split_lots").default(false),
    preferredBuyerRadiusMiles: integer("preferred_buyer_radius_miles"),
    pricingStyle: varchar("pricing_style", { length: 20 }), // fixed | negotiable | tiered
    palletizationCapable: boolean("palletization_capable").default(true),
    inventorySource: jsonb("inventory_source").$type<string[]>(),

    // === META ===
    profileComplete: boolean("profile_complete").default(false).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_preferences_user_id_idx").on(table.userId),
    index("user_preferences_role_idx").on(table.role),
  ]
);

export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;
