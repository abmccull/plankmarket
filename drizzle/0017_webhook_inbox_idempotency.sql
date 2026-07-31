-- Durable Stripe webhook inbox and effect-level subscription idempotency.

ALTER TABLE "stripe_webhook_events"
  ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'processing',
  ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "processing_started_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "completed_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "last_error" text;

-- Rows written by the historical handler were acknowledged only after its
-- normal return path. Preserve them as completed inbox records.
UPDATE "stripe_webhook_events"
SET
  "status" = 'completed',
  "attempt_count" = GREATEST("attempt_count", 1),
  "completed_at" = COALESCE("completed_at", "processed_at"),
  "processing_started_at" = NULL,
  "last_error" = NULL
WHERE "completed_at" IS NULL;

CREATE INDEX IF NOT EXISTS "stripe_webhook_events_status_started_idx"
  ON "stripe_webhook_events" ("status", "processing_started_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stripe_webhook_events_status_check'
      AND conrelid = 'public.stripe_webhook_events'::regclass
  ) THEN
    ALTER TABLE "stripe_webhook_events"
      ADD CONSTRAINT "stripe_webhook_events_status_check"
      CHECK ("status" IN ('processing', 'completed', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stripe_webhook_events_attempt_count_check'
      AND conrelid = 'public.stripe_webhook_events'::regclass
  ) THEN
    ALTER TABLE "stripe_webhook_events"
      ADD CONSTRAINT "stripe_webhook_events_attempt_count_check"
      CHECK ("attempt_count" >= 0);
  END IF;
END
$$;

ALTER TABLE "promotion_credits"
  ADD COLUMN IF NOT EXISTS "stripe_invoice_id" varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS "promotion_credits_stripe_invoice_id_unique_idx"
  ON "promotion_credits" ("stripe_invoice_id");

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "stripe_subscription_event_created_at" timestamptz;
