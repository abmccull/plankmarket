-- Keep Priority1 PRO and BOL identities distinct. Existing orders.tracking_number
-- is intentionally not backfilled because legacy rows may contain either value.

ALTER TABLE "shipments"
  ADD COLUMN IF NOT EXISTS "bol_number" varchar(255);
