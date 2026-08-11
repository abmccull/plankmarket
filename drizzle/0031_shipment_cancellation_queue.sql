-- Make freight cancellation a durable request/claim/finalize workflow so
-- Priority1 latency never occurs while order or shipment rows are locked.

ALTER TABLE "shipments"
  ADD COLUMN IF NOT EXISTS "cancellation_requested_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "cancellation_claim_token" varchar(64),
  ADD COLUMN IF NOT EXISTS "cancellation_claimed_at" timestamptz;

DO $$
BEGIN
  ALTER TABLE "shipments"
    ADD CONSTRAINT "shipments_cancellation_claim_consistency_check"
    CHECK (
      ("cancellation_claim_token" IS NULL) =
      ("cancellation_claimed_at" IS NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "shipments_cancellation_requested_idx"
  ON "shipments" ("cancellation_requested_at", "id")
  WHERE "cancellation_requested_at" IS NOT NULL
    AND "status" <> 'cancelled';
