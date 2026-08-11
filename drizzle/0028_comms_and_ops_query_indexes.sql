-- Communication and operations query indexes.
--
-- These are additive performance indexes only. They align inbox, follow-up,
-- shipment queue, and buyer-request access paths with the current query shapes.

CREATE INDEX IF NOT EXISTS "conversations_buyer_last_message_idx"
  ON "conversations" ("buyer_id", "last_message_at" DESC);

CREATE INDEX IF NOT EXISTS "conversations_seller_last_message_idx"
  ON "conversations" ("seller_id", "last_message_at" DESC);

CREATE INDEX IF NOT EXISTS "messages_conversation_created_idx"
  ON "messages" ("conversation_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "notifications_user_created_desc_idx"
  ON "notifications" ("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "notifications_user_unread_created_idx"
  ON "notifications" ("user_id", "created_at" DESC)
  WHERE "read" = false;

CREATE INDEX IF NOT EXISTS "buyer_requests_status_created_idx"
  ON "buyer_requests" ("status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "buyer_requests_material_types_gin_idx"
  ON "buyer_requests" USING gin ("material_types");

CREATE INDEX IF NOT EXISTS "buyer_request_responses_seller_created_idx"
  ON "buyer_request_responses" ("seller_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "followups_seller_status_due_idx"
  ON "followups" ("seller_id", "status", "due_at");

CREATE INDEX IF NOT EXISTS "followups_pending_due_id_idx"
  ON "followups" ("due_at", "id")
  WHERE "status" = 'pending';

CREATE INDEX IF NOT EXISTS "shipments_status_updated_id_idx"
  ON "shipments" ("status", "updated_at", "id");
