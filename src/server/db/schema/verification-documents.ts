import { pgTable, uuid, text, integer, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
export const verificationDocuments = pgTable("verification_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  objectPath: text("object_path").notNull().unique(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("verification_documents_user_idx").on(t.userId), check("verification_documents_size_check", sql`${t.fileSize} > 0 and ${t.fileSize} <= 10485760`)]);
