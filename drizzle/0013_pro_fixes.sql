-- Add index on stripe_customer_id for webhook lookups
CREATE INDEX IF NOT EXISTS "users_stripe_customer_id_idx" ON "users" ("stripe_customer_id");

-- Add original ask price column to listings for repricer floor tracking
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "original_ask_price_per_sq_ft" numeric(12, 4);

-- Backfill original price from current ask price for existing listings
UPDATE "listings" SET "original_ask_price_per_sq_ft" = "ask_price_per_sq_ft" WHERE "original_ask_price_per_sq_ft" IS NULL;
