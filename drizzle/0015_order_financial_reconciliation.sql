ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "stripe_transfer_reversal_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "transfer_reversed_amount" numeric(12, 4) NOT NULL DEFAULT 0;
