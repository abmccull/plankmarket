ALTER TABLE "user_preferences"
  ADD COLUMN "partial_quantity_markup_percent" real,
  ADD COLUMN "automatic_markdown_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN "automatic_markdown_floor_percent" real,
  ADD COLUMN "automatic_markdown_interval_days" integer,
  ADD COLUMN "default_allow_offers" boolean DEFAULT true NOT NULL,
  ADD COLUMN "allow_sample_requests" boolean DEFAULT false NOT NULL,
  ADD COLUMN "selling_territory_mode" varchar(20) DEFAULT 'unrestricted' NOT NULL,
  ADD COLUMN "allowed_destination_states" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN "freight_payment_mode" varchar(20) DEFAULT 'buyer_pays' NOT NULL,
  ADD COLUMN "seller_freight_states" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN "freight_drop_charge" numeric(12, 4),
  ADD COLUMN "tax_registered_states" jsonb DEFAULT '[]'::jsonb NOT NULL;
