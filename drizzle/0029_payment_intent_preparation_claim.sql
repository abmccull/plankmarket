-- Keep Stripe network latency outside the order row lock while retaining a
-- durable, recoverable owner for payment-intent preparation.

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "payment_intent_claim_token" varchar(64),
  ADD COLUMN IF NOT EXISTS "payment_intent_claimed_at" timestamptz;

DO $$
BEGIN
  ALTER TABLE "orders"
    ADD CONSTRAINT "orders_payment_intent_claim_consistency_check"
    CHECK (
      ("payment_intent_claim_token" IS NULL) =
      ("payment_intent_claimed_at" IS NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
