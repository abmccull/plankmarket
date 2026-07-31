DO $$
BEGIN
  CREATE TYPE "selling_territory_mode" AS ENUM ('unrestricted', 'allowed_states');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "freight_payment_mode" AS ENUM ('buyer_pays', 'seller_pays');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "listings"
  ADD COLUMN IF NOT EXISTS "full_lot_only" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "partial_quantity_markup_percent" real,
  ADD COLUMN IF NOT EXISTS "automatic_markdown_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "automatic_markdown_floor_percent" real,
  ADD COLUMN IF NOT EXISTS "automatic_markdown_interval_days" integer,
  ADD COLUMN IF NOT EXISTS "automatic_markdown_started_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "automatic_markdown_current_step" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "automatic_markdown_last_applied_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "pricing_rules_version" integer DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS "allow_sample_requests" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "territory_mode" "selling_territory_mode" DEFAULT 'unrestricted' NOT NULL,
  ADD COLUMN IF NOT EXISTS "allowed_destination_states" jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "freight_payment_mode" "freight_payment_mode" DEFAULT 'buyer_pays' NOT NULL,
  ADD COLUMN IF NOT EXISTS "seller_freight_states" jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "freight_drop_charge" numeric(12, 4);

UPDATE "listings"
SET
  "allowed_destination_states" = COALESCE("allowed_destination_states", '[]'::jsonb),
  "seller_freight_states" = COALESCE("seller_freight_states", '[]'::jsonb),
  "automatic_markdown_current_step" = COALESCE("automatic_markdown_current_step", 0),
  "pricing_rules_version" = COALESCE("pricing_rules_version", 1)
WHERE "allowed_destination_states" IS NULL
   OR "seller_freight_states" IS NULL
   OR "automatic_markdown_current_step" IS NULL
   OR "pricing_rules_version" IS NULL;
