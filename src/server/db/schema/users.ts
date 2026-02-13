import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["buyer", "seller", "admin"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authId: text("auth_id").unique().notNull(), // Supabase Auth UID
  email: varchar("email", { length: 255 }).unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  role: userRoleEnum("role").notNull().default("buyer"),
  businessName: varchar("business_name", { length: 255 }),
  businessAddress: text("business_address"),
  businessCity: varchar("business_city", { length: 100 }),
  businessState: varchar("business_state", { length: 2 }),
  businessZip: varchar("business_zip", { length: 10 }),
  avatarUrl: text("avatar_url"),
  stripeAccountId: varchar("stripe_account_id", { length: 255 }),
  stripeOnboardingComplete: boolean("stripe_onboarding_complete")
    .default(false)
    .notNull(),
  verified: boolean("verified").default(false).notNull(),
  active: boolean("active").default(true).notNull(),

  // Seller verification fields
  verificationStatus: varchar("verification_status", { length: 20 })
    .default("unverified")
    .notNull(), // 'unverified', 'pending', 'verified', 'rejected'
  verificationDocUrl: text("verification_doc_url"),
  verificationRequestedAt: timestamp("verification_requested_at", {
    withTimezone: true,
  }),
  verificationNotes: text("verification_notes"),

  // Business verification fields
  businessWebsite: text("business_website"),
  einTaxId: text("ein_tax_id"),
  aiVerificationScore: real("ai_verification_score"),
  aiVerificationNotes: text("ai_verification_notes"),

  // Geo fields for distance filtering
  zipCode: varchar("zip_code", { length: 5 }),
  lat: real("lat"),
  lng: real("lng"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
