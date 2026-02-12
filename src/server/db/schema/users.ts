import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
