-- Persist verified Stripe events before acknowledging delivery. Inngest then
-- processes the durable payload outside the webhook request lifecycle.

ALTER TABLE "stripe_webhook_events"
  ADD COLUMN IF NOT EXISTS "received_at" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "event_created_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "payload" jsonb;

ALTER TABLE "stripe_webhook_events"
  ALTER COLUMN "status" SET DEFAULT 'pending';

ALTER TABLE "stripe_webhook_events"
  DROP CONSTRAINT IF EXISTS "stripe_webhook_events_status_check";
ALTER TABLE "stripe_webhook_events"
  ADD CONSTRAINT "stripe_webhook_events_status_check"
  CHECK ("status" IN ('pending', 'processing', 'completed', 'failed'));

CREATE INDEX IF NOT EXISTS "stripe_webhook_events_pending_received_idx"
  ON "stripe_webhook_events" ("status", "received_at", "id");
