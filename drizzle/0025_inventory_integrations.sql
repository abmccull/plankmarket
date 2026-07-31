-- Seller inventory-feed foundation.
--
-- Feed credentials are stored only as one-way hashes. Ingestion is idempotent,
-- quantity changes are append-only, and ambiguous/reserved inventory fails
-- closed into reconciliation rather than overwriting marketplace stock.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_source_status') THEN
    CREATE TYPE "inventory_source_status" AS ENUM ('active', 'paused', 'revoked');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_source_auth_mode') THEN
    CREATE TYPE "inventory_source_auth_mode" AS ENUM ('bearer', 'signed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_ingest_status') THEN
    CREATE TYPE "inventory_ingest_status" AS ENUM ('processing', 'completed', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_reconciliation_status') THEN
    CREATE TYPE "inventory_reconciliation_status" AS ENUM ('open', 'resolved', 'dismissed');
  END IF;
END
$$;

CREATE TABLE "inventory_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "seller_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "external_source_id" varchar(128) NOT NULL,
  "auth_mode" "inventory_source_auth_mode" DEFAULT 'bearer' NOT NULL,
  "status" "inventory_source_status" DEFAULT 'active' NOT NULL,
  "api_key_hash" varchar(64) NOT NULL,
  "api_key_hint" varchar(32) NOT NULL,
  "stale_after_minutes" integer DEFAULT 1440 NOT NULL,
  "last_ingested_at" timestamptz,
  "last_successful_ingest_at" timestamptz,
  "last_error_at" timestamptz,
  "last_error_code" varchar(80),
  "key_rotated_at" timestamptz DEFAULT now() NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_sources_stale_after_check"
    CHECK ("stale_after_minutes" BETWEEN 15 AND 43200),
  CONSTRAINT "inventory_sources_api_key_hash_check"
    CHECK (length("api_key_hash") = 64)
);

CREATE UNIQUE INDEX "inventory_sources_seller_external_uidx"
  ON "inventory_sources" ("seller_id", "external_source_id");
CREATE UNIQUE INDEX "inventory_sources_api_key_hash_uidx"
  ON "inventory_sources" ("api_key_hash");
CREATE INDEX "inventory_sources_seller_status_idx"
  ON "inventory_sources" ("seller_id", "status");
CREATE INDEX "inventory_sources_staleness_idx"
  ON "inventory_sources" ("status", "last_successful_ingest_at");

CREATE TABLE "inventory_source_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_id" uuid NOT NULL REFERENCES "inventory_sources" ("id") ON DELETE CASCADE,
  "seller_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "listing_id" uuid REFERENCES "listings" ("id") ON DELETE SET NULL,
  "external_item_id" varchar(128) NOT NULL,
  "last_reported_quantity" real,
  "last_observed_at" timestamptz,
  "last_synced_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_source_items_quantity_check"
    CHECK ("last_reported_quantity" IS NULL OR "last_reported_quantity" >= 0)
);

CREATE UNIQUE INDEX "inventory_source_items_source_external_uidx"
  ON "inventory_source_items" ("source_id", "external_item_id");
CREATE UNIQUE INDEX "inventory_source_items_source_listing_uidx"
  ON "inventory_source_items" ("source_id", "listing_id")
  WHERE "listing_id" IS NOT NULL;
CREATE INDEX "inventory_source_items_seller_idx"
  ON "inventory_source_items" ("seller_id");
CREATE INDEX "inventory_source_items_listing_idx"
  ON "inventory_source_items" ("listing_id");

CREATE TABLE "inventory_ingest_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_id" uuid NOT NULL REFERENCES "inventory_sources" ("id") ON DELETE RESTRICT,
  "seller_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "status" "inventory_ingest_status" DEFAULT 'processing' NOT NULL,
  "item_count" integer NOT NULL,
  "applied_count" integer DEFAULT 0 NOT NULL,
  "unchanged_count" integer DEFAULT 0 NOT NULL,
  "mismatch_count" integer DEFAULT 0 NOT NULL,
  "unbound_count" integer DEFAULT 0 NOT NULL,
  "result" jsonb,
  "error_code" varchar(80),
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_ingest_batches_request_hash_check"
    CHECK (length("request_hash") = 64),
  CONSTRAINT "inventory_ingest_batches_counts_check"
    CHECK (
      "item_count" BETWEEN 1 AND 100
      AND "applied_count" >= 0
      AND "unchanged_count" >= 0
      AND "mismatch_count" >= 0
      AND "unbound_count" >= 0
    )
);

CREATE UNIQUE INDEX "inventory_ingest_batches_source_idempotency_uidx"
  ON "inventory_ingest_batches" ("source_id", "idempotency_key");
CREATE INDEX "inventory_ingest_batches_seller_created_idx"
  ON "inventory_ingest_batches" ("seller_id", "created_at");
CREATE INDEX "inventory_ingest_batches_status_idx"
  ON "inventory_ingest_batches" ("status");

CREATE TABLE "inventory_adjustments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "seller_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  "listing_id" uuid NOT NULL REFERENCES "listings" ("id") ON DELETE RESTRICT,
  "source_id" uuid REFERENCES "inventory_sources" ("id") ON DELETE RESTRICT,
  "source_item_id" uuid REFERENCES "inventory_source_items" ("id") ON DELETE RESTRICT,
  "ingest_batch_id" uuid REFERENCES "inventory_ingest_batches" ("id") ON DELETE RESTRICT,
  "previous_quantity" real NOT NULL,
  "new_quantity" real NOT NULL,
  "delta_quantity" real NOT NULL,
  "reason" varchar(80) NOT NULL,
  "actor_type" varchar(20) NOT NULL,
  "actor_user_id" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "idempotency_key" varchar(255) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_adjustments_idempotency_key_unique"
    UNIQUE ("idempotency_key"),
  CONSTRAINT "inventory_adjustments_quantities_check"
    CHECK (
      "previous_quantity" >= 0
      AND "new_quantity" >= 0
      AND abs(
        ("new_quantity" - "previous_quantity") - "delta_quantity"
      ) < 0.0001
    ),
  CONSTRAINT "inventory_adjustments_reason_check"
    CHECK ("reason" IN ('feed_sync', 'manual_reconciliation')),
  CONSTRAINT "inventory_adjustments_actor_type_check"
    CHECK ("actor_type" IN ('feed', 'seller', 'admin', 'system'))
);

CREATE INDEX "inventory_adjustments_listing_created_idx"
  ON "inventory_adjustments" ("listing_id", "created_at");
CREATE INDEX "inventory_adjustments_source_created_idx"
  ON "inventory_adjustments" ("source_id", "created_at");

CREATE TABLE "inventory_reconciliations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reconciliation_key" varchar(255) NOT NULL,
  "seller_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  "source_id" uuid NOT NULL REFERENCES "inventory_sources" ("id") ON DELETE RESTRICT,
  "source_item_id" uuid NOT NULL REFERENCES "inventory_source_items" ("id") ON DELETE RESTRICT,
  "listing_id" uuid REFERENCES "listings" ("id") ON DELETE SET NULL,
  "ingest_batch_id" uuid REFERENCES "inventory_ingest_batches" ("id") ON DELETE RESTRICT,
  "status" "inventory_reconciliation_status" DEFAULT 'open' NOT NULL,
  "reason" varchar(80) NOT NULL,
  "reported_quantity" real NOT NULL,
  "marketplace_quantity" real,
  "reserved_quantity" real DEFAULT 0 NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "detected_at" timestamptz DEFAULT now() NOT NULL,
  "resolved_at" timestamptz,
  "resolved_by" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "resolution" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_reconciliations_reconciliation_key_unique"
    UNIQUE ("reconciliation_key"),
  CONSTRAINT "inventory_reconciliations_quantities_check"
    CHECK (
      "reported_quantity" >= 0
      AND ("marketplace_quantity" IS NULL OR "marketplace_quantity" >= 0)
      AND "reserved_quantity" >= 0
    ),
  CONSTRAINT "inventory_reconciliations_reason_check"
    CHECK (
      "reason" IN (
        'unbound_item',
        'binding_conflict',
        'listing_not_owned',
        'active_reservation',
        'stale_observation',
        'invalid_observation_time'
      )
    )
);

CREATE INDEX "inventory_reconciliations_seller_status_idx"
  ON "inventory_reconciliations" ("seller_id", "status", "detected_at");
CREATE INDEX "inventory_reconciliations_source_status_idx"
  ON "inventory_reconciliations" ("source_id", "status");
CREATE INDEX "inventory_reconciliations_listing_idx"
  ON "inventory_reconciliations" ("listing_id");

CREATE OR REPLACE FUNCTION "prevent_inventory_adjustment_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'inventory_adjustments is append-only';
END;
$$;

CREATE TRIGGER "inventory_adjustments_append_only"
  BEFORE UPDATE OR DELETE ON "inventory_adjustments"
  FOR EACH ROW
  EXECUTE FUNCTION "prevent_inventory_adjustment_mutation"();

ALTER TABLE "inventory_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_source_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_ingest_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_reconciliations" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
  table_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH table_name IN ARRAY ARRAY[
        'inventory_sources',
        'inventory_source_items',
        'inventory_ingest_batches',
        'inventory_adjustments',
        'inventory_reconciliations'
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

COMMENT ON TABLE "inventory_sources" IS
  'Seller-owned inventory feed configuration; credentials are stored only as one-way hashes.';
COMMENT ON TABLE "inventory_adjustments" IS
  'Append-only evidence ledger for marketplace quantity changes.';
COMMENT ON TABLE "inventory_reconciliations" IS
  'Feed observations that require seller or operator review before stock changes.';
