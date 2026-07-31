-- Marketplace control-plane hardening.
--
-- This migration is additive and rolling-deploy compatible. Historical order
-- arithmetic is not rewritten: new financial snapshots are enforced on insert,
-- while updates to immutable commercial terms are rejected.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dispute_reason_code') THEN
    CREATE TYPE "dispute_reason_code" AS ENUM (
      'freight_damage',
      'quantity_shortage',
      'wrong_item',
      'quality_mismatch',
      'condition_mismatch',
      'missing_documentation',
      'other'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dispute_source') THEN
    CREATE TYPE "dispute_source" AS ENUM ('buyer', 'admin', 'stripe');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dispute_evidence_type') THEN
    CREATE TYPE "dispute_evidence_type" AS ENUM (
      'photo',
      'bol',
      'delivery_receipt',
      'invoice',
      'correspondence',
      'other'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reconciliation_case_status') THEN
    CREATE TYPE "reconciliation_case_status" AS ENUM (
      'open',
      'in_progress',
      'waiting_external',
      'resolved',
      'dismissed'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reconciliation_case_severity') THEN
    CREATE TYPE "reconciliation_case_severity" AS ENUM (
      'low',
      'medium',
      'high',
      'critical'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reconciliation_case_type') THEN
    CREATE TYPE "reconciliation_case_type" AS ENUM (
      'payment_mismatch',
      'payout_failure',
      'refund_failure',
      'shipment_ambiguity',
      'provider_failure',
      'webhook_failure',
      'email_delivery',
      'promotion_refund',
      'dispute_resolution',
      'data_integrity',
      'other'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reconciliation_case_source') THEN
    CREATE TYPE "reconciliation_case_source" AS ENUM (
      'system',
      'admin',
      'stripe',
      'priority1',
      'resend',
      'inngest',
      'supabase',
      'other'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reconciliation_case_event_type') THEN
    CREATE TYPE "reconciliation_case_event_type" AS ENUM (
      'opened',
      'status_changed',
      'assigned',
      'note',
      'attempt',
      'provider_update',
      'resolved',
      'reopened'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_actor_type') THEN
    CREATE TYPE "audit_actor_type" AS ENUM (
      'user',
      'admin',
      'system',
      'provider'
    );
  END IF;
END
$$;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "commercial_policy_snapshot" jsonb NOT NULL
  DEFAULT '{"version":1,"buyerMarketplaceFeeBps":500,"sellerMarketplaceFeeBps":500,"paymentProcessingRateBps":290,"paymentProcessingFixedFeeCents":30,"shippingMarkupBps":2500,"capturedAt":"1970-01-01T00:00:00.000Z"}'::jsonb;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "original_seller_payout" numeric(12, 4);
UPDATE "orders"
SET "original_seller_payout" =
  "subtotal" - "seller_fee" - "seller_stripe_fee"
  - "seller_freight_contribution"
WHERE "original_seller_payout" IS NULL;
ALTER TABLE "orders"
  ALTER COLUMN "original_seller_payout" SET NOT NULL;

CREATE OR REPLACE FUNCTION set_order_original_seller_payout()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."original_seller_payout" IS NULL THEN
    NEW."original_seller_payout" := NEW."seller_payout";
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "orders_set_original_seller_payout"
  ON "orders";
DROP TRIGGER IF EXISTS "orders_00_set_original_seller_payout"
  ON "orders";
CREATE TRIGGER "orders_00_set_original_seller_payout"
BEFORE INSERT ON "orders"
FOR EACH ROW
EXECUTE FUNCTION set_order_original_seller_payout();

ALTER TABLE "disputes"
  ADD COLUMN IF NOT EXISTS "reason_code" "dispute_reason_code" NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS "source" "dispute_source" NOT NULL DEFAULT 'buyer',
  ADD COLUMN IF NOT EXISTS "delivery_occurred_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "reporting_deadline_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "reporting_window_override_reason" text,
  ADD COLUMN IF NOT EXISTS "reported_late" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "damage_visible_at_delivery" boolean,
  ADD COLUMN IF NOT EXISTS "bol_damage_noted" boolean,
  ADD COLUMN IF NOT EXISTS "bol_notes" text,
  ADD COLUMN IF NOT EXISTS "resolved_refund_amount_cents" integer,
  ADD COLUMN IF NOT EXISTS "payout_requeued_at" timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'disputes_resolved_refund_nonnegative_check'
      AND conrelid = 'public.disputes'::regclass
  ) THEN
    ALTER TABLE "disputes"
      ADD CONSTRAINT "disputes_resolved_refund_nonnegative_check"
      CHECK (
        "resolved_refund_amount_cents" IS NULL
        OR "resolved_refund_amount_cents" >= 0
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'disputes_late_admin_override_check'
      AND conrelid = 'public.disputes'::regclass
  ) THEN
    ALTER TABLE "disputes"
      ADD CONSTRAINT "disputes_late_admin_override_check"
      CHECK (
        NOT "reported_late"
        OR (
          "source" = 'admin'
          AND NULLIF(TRIM("reporting_window_override_reason"), '') IS NOT NULL
        )
      ) NOT VALID;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "dispute_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dispute_id" uuid NOT NULL REFERENCES "disputes"("id") ON DELETE CASCADE,
  "media_id" uuid NOT NULL UNIQUE REFERENCES "media"("id") ON DELETE RESTRICT,
  "uploader_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "evidence_type" "dispute_evidence_type" NOT NULL,
  "description" varchar(500),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "dispute_evidence_dispute_id_idx"
  ON "dispute_evidence" ("dispute_id");
CREATE INDEX IF NOT EXISTS "dispute_evidence_uploader_id_idx"
  ON "dispute_evidence" ("uploader_id");
CREATE INDEX IF NOT EXISTS "dispute_evidence_type_idx"
  ON "dispute_evidence" ("evidence_type");

CREATE TABLE IF NOT EXISTS "reconciliation_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "case_key" varchar(255) NOT NULL UNIQUE,
  "type" "reconciliation_case_type" NOT NULL,
  "source" "reconciliation_case_source" NOT NULL,
  "status" "reconciliation_case_status" NOT NULL DEFAULT 'open',
  "severity" "reconciliation_case_severity" NOT NULL DEFAULT 'medium',
  "title" varchar(255) NOT NULL,
  "summary" text NOT NULL,
  "order_id" uuid REFERENCES "orders"("id") ON DELETE RESTRICT,
  "dispute_id" uuid REFERENCES "disputes"("id") ON DELETE SET NULL,
  "external_reference" varchar(255),
  "amount_cents" integer,
  "currency" varchar(3) NOT NULL DEFAULT 'usd',
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "last_attempt_at" timestamptz,
  "next_retry_at" timestamptz,
  "assigned_to" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolution" text,
  "resolved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamptz,
  "first_detected_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "reconciliation_cases_amount_nonnegative_check"
    CHECK ("amount_cents" IS NULL OR "amount_cents" >= 0),
  CONSTRAINT "reconciliation_cases_attempt_count_nonnegative_check"
    CHECK ("attempt_count" >= 0)
);
CREATE INDEX IF NOT EXISTS "reconciliation_cases_status_severity_idx"
  ON "reconciliation_cases" ("status", "severity");
CREATE INDEX IF NOT EXISTS "reconciliation_cases_order_id_idx"
  ON "reconciliation_cases" ("order_id");
CREATE INDEX IF NOT EXISTS "reconciliation_cases_dispute_id_idx"
  ON "reconciliation_cases" ("dispute_id");
CREATE INDEX IF NOT EXISTS "reconciliation_cases_assigned_to_idx"
  ON "reconciliation_cases" ("assigned_to");
CREATE INDEX IF NOT EXISTS "reconciliation_cases_next_retry_idx"
  ON "reconciliation_cases" ("next_retry_at")
  WHERE "status" IN ('open', 'in_progress', 'waiting_external');

CREATE TABLE IF NOT EXISTS "reconciliation_case_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL
    REFERENCES "reconciliation_cases"("id") ON DELETE CASCADE,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "event_type" "reconciliation_case_event_type" NOT NULL,
  "message" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "reconciliation_case_events_case_created_idx"
  ON "reconciliation_case_events" ("case_id", "created_at");
CREATE INDEX IF NOT EXISTS "reconciliation_case_events_actor_id_idx"
  ON "reconciliation_case_events" ("actor_id");

CREATE TABLE IF NOT EXISTS "email_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "idempotency_key" varchar(256) NOT NULL,
  "provider_message_id" varchar(255),
  "category" varchar(100) NOT NULL,
  "payload_fingerprint" varchar(64) NOT NULL,
  "from_address" text NOT NULL,
  "recipient_emails" text[] NOT NULL,
  "subject" text NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'sending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "accepted_at" timestamptz,
  "delivered_at" timestamptz,
  "failed_at" timestamptz,
  "provider_status_at" timestamptz,
  "last_attempt_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "email_deliveries_status_check" CHECK (
    "status" IN (
      'sending',
      'acceptance_unknown',
      'accepted',
      'scheduled',
      'sent',
      'delivered',
      'delivery_delayed',
      'bounced',
      'complained',
      'failed',
      'suppressed'
    )
  ),
  CONSTRAINT "email_deliveries_attempt_count_check"
    CHECK ("attempt_count" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "email_deliveries_idempotency_key_uidx"
  ON "email_deliveries" ("idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "email_deliveries_provider_message_id_uidx"
  ON "email_deliveries" ("provider_message_id")
  WHERE "provider_message_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "email_deliveries_status_updated_idx"
  ON "email_deliveries" ("status", "updated_at");
CREATE INDEX IF NOT EXISTS "email_deliveries_recipient_emails_gin_idx"
  ON "email_deliveries" USING gin ("recipient_emails");

CREATE TABLE IF NOT EXISTS "resend_webhook_events" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "event_type" varchar(100) NOT NULL,
  "provider_message_id" varchar(255) NOT NULL,
  "event_created_at" timestamptz NOT NULL,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "payload" jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "resend_webhook_events_message_created_idx"
  ON "resend_webhook_events" ("provider_message_id", "event_created_at");

CREATE TABLE IF NOT EXISTS "email_recipient_suppressions" (
  "email" varchar(320) PRIMARY KEY NOT NULL,
  "reason" varchar(32) NOT NULL,
  "source_delivery_id" uuid
    REFERENCES "email_deliveries"("id") ON DELETE SET NULL,
  "provider_message_id" varchar(255),
  "suppressed_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "email_recipient_suppressions_reason_check"
    CHECK ("reason" IN ('bounced', 'complained', 'suppressed'))
);
CREATE INDEX IF NOT EXISTS "email_recipient_suppressions_reason_idx"
  ON "email_recipient_suppressions" ("reason");

ALTER TABLE "listing_promotions"
  ADD COLUMN IF NOT EXISTS "refund_amount_cents" integer,
  ADD COLUMN IF NOT EXISTS "refund_idempotency_key" varchar(255),
  ADD COLUMN IF NOT EXISTS "stripe_refund_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "refund_attempt_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "refund_requested_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "refund_last_attempt_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "refund_next_attempt_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "refund_last_error" text,
  ADD COLUMN IF NOT EXISTS "refunded_at" timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS
  "listing_promotions_stripe_refund_id_unique_idx"
  ON "listing_promotions" ("stripe_refund_id")
  WHERE "stripe_refund_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS
  "listing_promotions_refund_idempotency_key_unique_idx"
  ON "listing_promotions" ("refund_idempotency_key")
  WHERE "refund_idempotency_key" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "listing_promotions_refund_retry_idx"
  ON "listing_promotions" ("refund_next_attempt_at")
  WHERE "payment_status" = 'refund_pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'listing_promotions_refund_amount_nonnegative'
      AND conrelid = 'public.listing_promotions'::regclass
  ) THEN
    ALTER TABLE "listing_promotions"
      ADD CONSTRAINT "listing_promotions_refund_amount_nonnegative"
      CHECK ("refund_amount_cents" IS NULL OR "refund_amount_cents" >= 0)
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'listing_promotions_refund_attempt_count_nonnegative'
      AND conrelid = 'public.listing_promotions'::regclass
  ) THEN
    ALTER TABLE "listing_promotions"
      ADD CONSTRAINT "listing_promotions_refund_attempt_count_nonnegative"
      CHECK ("refund_attempt_count" >= 0)
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'listing_promotions_payment_status_check'
      AND conrelid = 'public.listing_promotions'::regclass
  ) THEN
    ALTER TABLE "listing_promotions"
      ADD CONSTRAINT "listing_promotions_payment_status_check"
      CHECK (
        "payment_status" IN (
          'pending',
          'processing',
          'succeeded',
          'failed',
          'refund_pending',
          'refunded',
          'reconciliation_required'
        )
      ) NOT VALID;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_type" "audit_actor_type" NOT NULL,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action" varchar(120) NOT NULL,
  "entity_type" varchar(80) NOT NULL,
  "entity_id" varchar(255),
  "idempotency_key" varchar(255),
  "request_id" varchar(255),
  "summary" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "audit_events_actor_identity_check" CHECK (
    "actor_type" IN ('system', 'provider')
    OR "actor_id" IS NOT NULL
  ),
  CONSTRAINT "audit_events_action_nonempty_check"
    CHECK (NULLIF(TRIM("action"), '') IS NOT NULL),
  CONSTRAINT "audit_events_entity_type_nonempty_check"
    CHECK (NULLIF(TRIM("entity_type"), '') IS NOT NULL),
  CONSTRAINT "audit_events_summary_nonempty_check"
    CHECK (NULLIF(TRIM("summary"), '') IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "audit_events_entity_created_idx"
  ON "audit_events" ("entity_type", "entity_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_events_actor_created_idx"
  ON "audit_events" ("actor_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_events_action_created_idx"
  ON "audit_events" ("action", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "audit_events_idempotency_key_unique_idx"
  ON "audit_events" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;
DROP TRIGGER IF EXISTS "audit_events_prevent_update_delete"
  ON "audit_events";
CREATE TRIGGER "audit_events_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_event_mutation();

CREATE OR REPLACE FUNCTION enforce_order_financial_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."quantity_sq_ft" <= 0
     OR NEW."price_per_sq_ft" < 0
     OR NEW."subtotal" < 0
     OR NEW."buyer_fee" < 0
     OR NEW."seller_fee" < 0
     OR NEW."total_price" < 0
     OR NEW."stripe_processing_fee" < 0
     OR NEW."seller_stripe_fee" < 0
     OR NEW."platform_stripe_fee" < 0
     OR NEW."original_seller_payout" < 0
     OR NEW."seller_payout" < 0
     OR COALESCE(NEW."refunded_amount", 0) < 0
     OR NEW."transfer_reversed_amount" < 0 THEN
    RAISE EXCEPTION 'order financial amounts must be nonnegative';
  END IF;

  IF NEW."total_price"
     <> NEW."subtotal" + NEW."buyer_freight_charge" + NEW."buyer_fee" THEN
    RAISE EXCEPTION 'order buyer charge arithmetic is inconsistent';
  END IF;
  IF NEW."original_seller_payout"
     <> NEW."subtotal" - NEW."seller_fee" - NEW."seller_stripe_fee"
        - NEW."seller_freight_contribution" THEN
    RAISE EXCEPTION 'order original seller payout arithmetic is inconsistent';
  END IF;
  IF NEW."stripe_processing_fee"
     <> NEW."seller_stripe_fee" + NEW."platform_stripe_fee" THEN
    RAISE EXCEPTION 'order processing fee allocation is inconsistent';
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "orders_enforce_financial_snapshot"
  ON "orders";
CREATE TRIGGER "orders_enforce_financial_snapshot"
BEFORE INSERT OR UPDATE OF
  "quantity_sq_ft",
  "price_per_sq_ft",
  "subtotal",
  "buyer_fee",
  "seller_fee",
  "total_price",
  "stripe_processing_fee",
  "seller_stripe_fee",
  "platform_stripe_fee",
  "original_seller_payout",
  "seller_payout",
  "buyer_freight_charge",
  "seller_freight_contribution",
  "refunded_amount",
  "transfer_reversed_amount"
ON "orders"
FOR EACH ROW
EXECUTE FUNCTION enforce_order_financial_snapshot();

CREATE OR REPLACE FUNCTION prevent_order_commercial_snapshot_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."quantity_sq_ft" IS DISTINCT FROM OLD."quantity_sq_ft"
     OR NEW."price_per_sq_ft" IS DISTINCT FROM OLD."price_per_sq_ft"
     OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
     OR NEW."buyer_fee" IS DISTINCT FROM OLD."buyer_fee"
     OR NEW."seller_fee" IS DISTINCT FROM OLD."seller_fee"
     OR NEW."total_price" IS DISTINCT FROM OLD."total_price"
     OR NEW."stripe_processing_fee" IS DISTINCT FROM OLD."stripe_processing_fee"
     OR NEW."seller_stripe_fee" IS DISTINCT FROM OLD."seller_stripe_fee"
     OR NEW."platform_stripe_fee" IS DISTINCT FROM OLD."platform_stripe_fee"
     OR NEW."original_seller_payout"
        IS DISTINCT FROM OLD."original_seller_payout"
     OR NEW."carrier_rate" IS DISTINCT FROM OLD."carrier_rate"
     OR NEW."shipping_margin" IS DISTINCT FROM OLD."shipping_margin"
     OR NEW."commercial_policy_snapshot"
        IS DISTINCT FROM OLD."commercial_policy_snapshot" THEN
    RAISE EXCEPTION
      'order commercial snapshots are immutable (order_id=%)',
      OLD."id";
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "orders_prevent_commercial_snapshot_update"
  ON "orders";
CREATE TRIGGER "orders_prevent_commercial_snapshot_update"
BEFORE UPDATE OF
  "quantity_sq_ft",
  "price_per_sq_ft",
  "subtotal",
  "buyer_fee",
  "seller_fee",
  "total_price",
  "stripe_processing_fee",
  "seller_stripe_fee",
  "platform_stripe_fee",
  "original_seller_payout",
  "carrier_rate",
  "shipping_margin",
  "commercial_policy_snapshot"
ON "orders"
FOR EACH ROW
EXECUTE FUNCTION prevent_order_commercial_snapshot_update();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_payment_status_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_payment_status_check"
      CHECK (
        "payment_status" IN (
          'pending',
          'processing',
          'succeeded',
          'failed',
          'reconciliation_required',
          'refund_pending',
          'partially_refunded',
          'refunded',
          'paid'
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_payment_hold_status_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_payment_hold_status_check"
      CHECK (
        "escrow_status" IN (
          'none',
          'held',
          'released',
          'refunded',
          'disputed'
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'listings_total_sq_ft_nonnegative_check'
      AND conrelid = 'public.listings'::regclass
  ) THEN
    ALTER TABLE "listings"
      ADD CONSTRAINT "listings_total_sq_ft_nonnegative_check"
      CHECK ("total_sq_ft" >= 0) NOT VALID;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "orders_open_inventory_reservation_idx"
  ON "orders" ("listing_id")
  WHERE "inventory_released_at" IS NULL
    AND "status" IN (
      'pending',
      'confirmed',
      'processing',
      'shipped',
      'cancelled'
    );

CREATE UNIQUE INDEX IF NOT EXISTS "users_stripe_account_id_unique_idx"
  ON "users" ("stripe_account_id")
  WHERE "stripe_account_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
  "buyer_request_responses_request_seller_unique_idx"
  ON "buyer_request_responses" ("request_id", "seller_id");
CREATE UNIQUE INDEX IF NOT EXISTS
  "buyer_request_responses_one_accepted_per_request_idx"
  ON "buyer_request_responses" ("request_id")
  WHERE "status" = 'accepted';

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dispute_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reconciliation_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reconciliation_case_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resend_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_recipient_suppressions" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
  table_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH table_name IN ARRAY ARRAY[
        'audit_events',
        'dispute_evidence',
        'reconciliation_cases',
        'reconciliation_case_events',
        'email_deliveries',
        'resend_webhook_events',
        'email_recipient_suppressions'
      ]
      LOOP
        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',
          table_name,
          role_name
        );
      END LOOP;
    END IF;
  END LOOP;
END
$$;

COMMENT ON COLUMN "orders"."commercial_policy_snapshot" IS
  'Immutable versioned rates applied when the order was created.';
COMMENT ON TABLE "audit_events" IS
  'Append-only security and financial audit ledger.';
COMMENT ON TABLE "reconciliation_cases" IS
  'Durable operator queue for money, provider, and data-integrity exceptions.';
