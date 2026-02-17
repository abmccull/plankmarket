import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { listings } from "./listings";

export const aiDraftStatusEnum = pgEnum("ai_draft_status", [
  "pending",
  "processing",
  "ready",
  "applied",
  "failed",
]);

export interface ExtractedListingFields {
  materialType?: string;
  species?: string;
  finish?: string;
  grade?: string;
  color?: string;
  colorFamily?: string;
  thickness?: number;
  width?: number;
  length?: number;
  wearLayer?: number;
  brand?: string;
  modelNumber?: string;
  totalSqFt?: number;
  sqFtPerBox?: number;
  boxesPerPallet?: number;
  totalPallets?: number;
  condition?: string;
  certifications?: string[];
}

export type FieldConfidence = Record<string, "high" | "medium" | "low">;

export const listingDraftsAi = pgTable(
  "listing_drafts_ai",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    rawInputText: text("raw_input_text").notNull(),
    extractedFields: jsonb("extracted_fields").$type<ExtractedListingFields>(),
    confidence: jsonb("confidence").$type<FieldConfidence>(),
    status: aiDraftStatusEnum("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    appliedToListingId: uuid("applied_to_listing_id").references(
      () => listings.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("listing_drafts_ai_seller_id_idx").on(table.sellerId),
    index("listing_drafts_ai_status_idx").on(table.status),
  ]
);

export type ListingDraftAi = typeof listingDraftsAi.$inferSelect;
export type NewListingDraftAi = typeof listingDraftsAi.$inferInsert;
