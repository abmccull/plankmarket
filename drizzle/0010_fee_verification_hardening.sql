ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "seller_stripe_fee" numeric(12, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "platform_stripe_fee" numeric(12, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "inventory_released_at" timestamp with time zone;

UPDATE "orders"
SET
  "seller_stripe_fee" = "stripe_processing_fee",
  "platform_stripe_fee" = 0
WHERE
  "seller_stripe_fee" = 0
  AND "platform_stripe_fee" = 0;

CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "event_type" varchar(100) NOT NULL,
  "processed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "stripe_webhook_events_processed_at_idx"
  ON "stripe_webhook_events" ("processed_at");
