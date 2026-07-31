ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "shipping_booking_snapshot" jsonb;

ALTER TABLE "shipments"
  ADD COLUMN IF NOT EXISTS "is_dry_run" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "dispatch_attempted_at" timestamptz;
