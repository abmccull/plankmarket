-- Privacy retention, analytics consent persistence, and seller-lineage hardening.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "ein_last_4" varchar(4),
  ADD COLUMN IF NOT EXISTS "verification_data_purge_after" timestamptz,
  ADD COLUMN IF NOT EXISTS "verification_evidence_purged_at" timestamptz;

UPDATE "users"
SET
  "ein_tax_id" = nullif(btrim("ein_tax_id"), ''),
  "verification_doc_url" = nullif(btrim("verification_doc_url"), '');

UPDATE "users"
SET "ein_last_4" = CASE
  WHEN "ein_tax_id" IS NULL THEN NULL
  ELSE right(regexp_replace("ein_tax_id", '\D', '', 'g'), 4)
END;

UPDATE "users"
SET "verification_data_purge_after" = coalesce(
  "verification_requested_at",
  "updated_at",
  "created_at",
  now()
) + interval '30 days'
WHERE "verification_data_purge_after" IS NULL
  AND "verification_evidence_purged_at" IS NULL
  AND (
    nullif(btrim("ein_tax_id"), '') IS NOT NULL
    OR nullif(btrim("verification_doc_url"), '') IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS "users_verification_data_purge_after_idx"
  ON "users" ("verification_data_purge_after");

CREATE OR REPLACE FUNCTION "set_user_verification_retention_defaults"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."ein_tax_id" := nullif(btrim(NEW."ein_tax_id"), '');
  NEW."verification_doc_url" := nullif(btrim(NEW."verification_doc_url"), '');
  NEW."ein_last_4" := CASE
    WHEN NEW."ein_tax_id" IS NULL THEN NULL
    ELSE right(regexp_replace(NEW."ein_tax_id", '\D', '', 'g'), 4)
  END;

  IF NEW."ein_tax_id" IS NOT NULL OR NEW."verification_doc_url" IS NOT NULL THEN
    IF TG_OP = 'INSERT'
      OR NEW."ein_tax_id" IS DISTINCT FROM OLD."ein_tax_id"
      OR NEW."verification_doc_url" IS DISTINCT FROM OLD."verification_doc_url"
    THEN
      NEW."verification_data_purge_after" := coalesce(NEW."updated_at", now()) + interval '30 days';
      NEW."verification_evidence_purged_at" := NULL;
    END IF;
  ELSE
    NEW."verification_data_purge_after" := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "users_set_verification_retention_defaults" ON "users";
CREATE TRIGGER "users_set_verification_retention_defaults"
  BEFORE INSERT OR UPDATE ON "users"
  FOR EACH ROW
  EXECUTE FUNCTION "set_user_verification_retention_defaults"();

ALTER TABLE "verification_drafts"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "purge_after" timestamptz;

UPDATE "verification_drafts"
SET
  "expires_at" = coalesce(
    "expires_at",
    coalesce("updated_at", "created_at", now()) + interval '30 days'
  ),
  "purge_after" = coalesce(
    "purge_after",
    coalesce("updated_at", "created_at", now()) + interval '30 days'
  );

CREATE INDEX IF NOT EXISTS "verification_drafts_purge_after_idx"
  ON "verification_drafts" ("purge_after");

CREATE OR REPLACE FUNCTION "set_verification_draft_retention_defaults"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  base_timestamp timestamptz;
BEGIN
  NEW."business_website" := nullif(btrim(NEW."business_website"), '');
  NEW."ein_tax_id" := nullif(btrim(NEW."ein_tax_id"), '');
  NEW."verification_doc_url" := nullif(btrim(NEW."verification_doc_url"), '');
  NEW."business_address" := nullif(btrim(NEW."business_address"), '');
  NEW."business_city" := nullif(btrim(NEW."business_city"), '');
  NEW."business_state" := nullif(upper(btrim(NEW."business_state")), '');
  NEW."business_zip" := nullif(btrim(NEW."business_zip"), '');

  base_timestamp := coalesce(NEW."updated_at", now());
  NEW."expires_at" := base_timestamp + interval '30 days';
  NEW."purge_after" := base_timestamp + interval '30 days';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "verification_drafts_set_retention_defaults" ON "verification_drafts";
CREATE TRIGGER "verification_drafts_set_retention_defaults"
  BEFORE INSERT OR UPDATE ON "verification_drafts"
  FOR EACH ROW
  EXECUTE FUNCTION "set_verification_draft_retention_defaults"();

ALTER TABLE "sample_requests"
  ADD COLUMN IF NOT EXISTS "retention_purge_after" timestamptz,
  ADD COLUMN IF NOT EXISTS "pii_purged_at" timestamptz;

UPDATE "sample_requests"
SET "retention_purge_after" = CASE
  WHEN "status" IN ('declined', 'cancelled', 'delivered') THEN
    coalesce(
      "delivered_at",
      "cancelled_at",
      "declined_at",
      "updated_at",
      "created_at",
      now()
    ) + interval '180 days'
  ELSE NULL
END
WHERE "retention_purge_after" IS NULL;

CREATE INDEX IF NOT EXISTS "sample_requests_retention_purge_after_idx"
  ON "sample_requests" ("retention_purge_after");

CREATE OR REPLACE FUNCTION "set_sample_request_retention_defaults"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  terminal_at timestamptz;
BEGIN
  IF NEW."status" IN ('declined', 'cancelled', 'delivered')
    AND NEW."pii_purged_at" IS NULL
  THEN
    terminal_at := CASE
      WHEN NEW."status" = 'declined' THEN coalesce(NEW."declined_at", NEW."updated_at", now())
      WHEN NEW."status" = 'cancelled' THEN coalesce(NEW."cancelled_at", NEW."updated_at", now())
      ELSE coalesce(NEW."delivered_at", NEW."updated_at", now())
    END;
    NEW."retention_purge_after" := coalesce(
      NEW."retention_purge_after",
      terminal_at + interval '180 days'
    );
  ELSIF NEW."pii_purged_at" IS NULL THEN
    NEW."retention_purge_after" := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "sample_requests_set_retention_defaults" ON "sample_requests";
CREATE TRIGGER "sample_requests_set_retention_defaults"
  BEFORE INSERT OR UPDATE ON "sample_requests"
  FOR EACH ROW
  EXECUTE FUNCTION "set_sample_request_retention_defaults"();

ALTER TABLE "shipping_addresses"
  ADD COLUMN IF NOT EXISTS "last_used_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "retention_purge_after" timestamptz;

ALTER TABLE "shipping_addresses"
  ALTER COLUMN "last_used_at" SET DEFAULT now();

UPDATE "shipping_addresses"
SET "last_used_at" = coalesce("last_used_at", "updated_at", "created_at", now());

ALTER TABLE "shipping_addresses"
  ALTER COLUMN "last_used_at" SET NOT NULL;

UPDATE "shipping_addresses"
SET "retention_purge_after" = coalesce(
  "retention_purge_after",
  "last_used_at" + interval '365 days'
);

CREATE INDEX IF NOT EXISTS "shipping_addresses_retention_purge_after_idx"
  ON "shipping_addresses" ("retention_purge_after");

CREATE OR REPLACE FUNCTION "set_shipping_address_retention_defaults"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."last_used_at" := coalesce(NEW."last_used_at", NEW."updated_at", now());
  NEW."retention_purge_after" := NEW."last_used_at" + interval '365 days';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "shipping_addresses_set_retention_defaults" ON "shipping_addresses";
CREATE TRIGGER "shipping_addresses_set_retention_defaults"
  BEFORE INSERT OR UPDATE ON "shipping_addresses"
  FOR EACH ROW
  EXECUTE FUNCTION "set_shipping_address_retention_defaults"();

ALTER TABLE "shipping_addresses" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_role text;
BEGIN
  FOR target_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated')
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.shipping_addresses FROM %I',
      target_role
    );
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public.shipping_addresses TO service_role;
  END IF;
END
$$;

COMMENT ON TABLE "shipping_addresses" IS
  'Server-only saved shipping destinations containing buyer address data.';

ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "analytics_tracking_enabled" boolean,
  ADD COLUMN IF NOT EXISTS "analytics_consent_updated_at" timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_id_seller_idx'
      AND conrelid = 'public.listings'::regclass
  ) THEN
    IF to_regclass('public.listings_id_seller_idx') IS NOT NULL THEN
      ALTER TABLE "listings"
        ADD CONSTRAINT "listings_id_seller_idx"
        UNIQUE USING INDEX "listings_id_seller_idx";
    ELSE
      ALTER TABLE "listings"
        ADD CONSTRAINT "listings_id_seller_idx"
        UNIQUE ("id", "seller_id");
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'buyer_requests_id_buyer_idx'
      AND conrelid = 'public.buyer_requests'::regclass
  ) THEN
    IF to_regclass('public.buyer_requests_id_buyer_idx') IS NOT NULL THEN
      ALTER TABLE "buyer_requests"
        ADD CONSTRAINT "buyer_requests_id_buyer_idx"
        UNIQUE USING INDEX "buyer_requests_id_buyer_idx";
    ELSE
      ALTER TABLE "buyer_requests"
        ADD CONSTRAINT "buyer_requests_id_buyer_idx"
        UNIQUE ("id", "buyer_id");
    END IF;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "offers_id_buyer_seller_listing_idx"
  ON "offers" ("id", "buyer_id", "seller_id", "listing_id");

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_sources_id_seller_idx"
  ON "inventory_sources" ("id", "seller_id");

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_source_items_id_source_seller_idx"
  ON "inventory_source_items" ("id", "source_id", "seller_id");

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_ingest_batches_id_source_seller_idx"
  ON "inventory_ingest_batches" ("id", "source_id", "seller_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'media_one_parent_max_check'
      AND conrelid = 'public.media'::regclass
  ) THEN
    ALTER TABLE "media"
      ADD CONSTRAINT "media_one_parent_max_check"
      CHECK (num_nonnulls("listing_id", "buyer_request_id") <= 1)
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'media_listing_owner_lineage_fk'
      AND conrelid = 'public.media'::regclass
  ) THEN
    ALTER TABLE "media"
      ADD CONSTRAINT "media_listing_owner_lineage_fk"
      FOREIGN KEY ("listing_id", "uploader_id")
      REFERENCES "listings" ("id", "seller_id")
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'media_buyer_request_owner_lineage_fk'
      AND conrelid = 'public.media'::regclass
  ) THEN
    ALTER TABLE "media"
      ADD CONSTRAINT "media_buyer_request_owner_lineage_fk"
      FOREIGN KEY ("buyer_request_id", "uploader_id")
      REFERENCES "buyer_requests" ("id", "buyer_id")
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_listing_seller_lineage_fk'
      AND conrelid = 'public.conversations'::regclass
  ) THEN
    ALTER TABLE "conversations"
      ADD CONSTRAINT "conversations_listing_seller_lineage_fk"
      FOREIGN KEY ("listing_id", "seller_id")
      REFERENCES "listings" ("id", "seller_id")
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sample_requests_listing_seller_lineage_fk'
      AND conrelid = 'public.sample_requests'::regclass
  ) THEN
    ALTER TABLE "sample_requests"
      ADD CONSTRAINT "sample_requests_listing_seller_lineage_fk"
      FOREIGN KEY ("listing_id", "seller_id")
      REFERENCES "listings" ("id", "seller_id")
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'offers_listing_seller_lineage_fk'
      AND conrelid = 'public.offers'::regclass
  ) THEN
    ALTER TABLE "offers"
      ADD CONSTRAINT "offers_listing_seller_lineage_fk"
      FOREIGN KEY ("listing_id", "seller_id")
      REFERENCES "listings" ("id", "seller_id")
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_listing_seller_lineage_fk'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_listing_seller_lineage_fk"
      FOREIGN KEY ("listing_id", "seller_id")
      REFERENCES "listings" ("id", "seller_id")
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_offer_lineage_fk'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_offer_lineage_fk"
      FOREIGN KEY ("offer_id", "buyer_id", "seller_id", "listing_id")
      REFERENCES "offers" ("id", "buyer_id", "seller_id", "listing_id")
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'buyer_request_responses_listing_seller_lineage_fk'
      AND conrelid = 'public.buyer_request_responses'::regclass
  ) THEN
    ALTER TABLE "buyer_request_responses"
      ADD CONSTRAINT "buyer_request_responses_listing_seller_lineage_fk"
      FOREIGN KEY ("listing_id", "seller_id")
      REFERENCES "listings" ("id", "seller_id")
      ON DELETE SET NULL ("listing_id")
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_source_items_source_seller_lineage_fk'
      AND conrelid = 'public.inventory_source_items'::regclass
  ) THEN
    ALTER TABLE "inventory_source_items"
      ADD CONSTRAINT "inventory_source_items_source_seller_lineage_fk"
      FOREIGN KEY ("source_id", "seller_id")
      REFERENCES "inventory_sources" ("id", "seller_id")
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_source_items_listing_seller_lineage_fk'
      AND conrelid = 'public.inventory_source_items'::regclass
  ) THEN
    ALTER TABLE "inventory_source_items"
      ADD CONSTRAINT "inventory_source_items_listing_seller_lineage_fk"
      FOREIGN KEY ("listing_id", "seller_id")
      REFERENCES "listings" ("id", "seller_id")
      ON DELETE SET NULL ("listing_id")
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_ingest_batches_source_seller_lineage_fk'
      AND conrelid = 'public.inventory_ingest_batches'::regclass
  ) THEN
    ALTER TABLE "inventory_ingest_batches"
      ADD CONSTRAINT "inventory_ingest_batches_source_seller_lineage_fk"
      FOREIGN KEY ("source_id", "seller_id")
      REFERENCES "inventory_sources" ("id", "seller_id")
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_adjustments_listing_seller_lineage_fk'
      AND conrelid = 'public.inventory_adjustments'::regclass
  ) THEN
    ALTER TABLE "inventory_adjustments"
      ADD CONSTRAINT "inventory_adjustments_listing_seller_lineage_fk"
      FOREIGN KEY ("listing_id", "seller_id")
      REFERENCES "listings" ("id", "seller_id")
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_adjustments_source_seller_lineage_fk'
      AND conrelid = 'public.inventory_adjustments'::regclass
  ) THEN
    ALTER TABLE "inventory_adjustments"
      ADD CONSTRAINT "inventory_adjustments_source_seller_lineage_fk"
      FOREIGN KEY ("source_id", "seller_id")
      REFERENCES "inventory_sources" ("id", "seller_id")
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_adjustments_source_item_requires_source_check'
      AND conrelid = 'public.inventory_adjustments'::regclass
  ) THEN
    ALTER TABLE "inventory_adjustments"
      ADD CONSTRAINT "inventory_adjustments_source_item_requires_source_check"
      CHECK ("source_item_id" IS NULL OR "source_id" IS NOT NULL)
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_adjustments_ingest_batch_requires_source_check'
      AND conrelid = 'public.inventory_adjustments'::regclass
  ) THEN
    ALTER TABLE "inventory_adjustments"
      ADD CONSTRAINT "inventory_adjustments_ingest_batch_requires_source_check"
      CHECK ("ingest_batch_id" IS NULL OR "source_id" IS NOT NULL)
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_adjustments_source_item_lineage_fk'
      AND conrelid = 'public.inventory_adjustments'::regclass
  ) THEN
    ALTER TABLE "inventory_adjustments"
      ADD CONSTRAINT "inventory_adjustments_source_item_lineage_fk"
      FOREIGN KEY ("source_item_id", "source_id", "seller_id")
      REFERENCES "inventory_source_items" ("id", "source_id", "seller_id")
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_adjustments_ingest_batch_lineage_fk'
      AND conrelid = 'public.inventory_adjustments'::regclass
  ) THEN
    ALTER TABLE "inventory_adjustments"
      ADD CONSTRAINT "inventory_adjustments_ingest_batch_lineage_fk"
      FOREIGN KEY ("ingest_batch_id", "source_id", "seller_id")
      REFERENCES "inventory_ingest_batches" ("id", "source_id", "seller_id")
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_reconciliations_source_seller_lineage_fk'
      AND conrelid = 'public.inventory_reconciliations'::regclass
  ) THEN
    ALTER TABLE "inventory_reconciliations"
      ADD CONSTRAINT "inventory_reconciliations_source_seller_lineage_fk"
      FOREIGN KEY ("source_id", "seller_id")
      REFERENCES "inventory_sources" ("id", "seller_id")
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_reconciliations_source_item_lineage_fk'
      AND conrelid = 'public.inventory_reconciliations'::regclass
  ) THEN
    ALTER TABLE "inventory_reconciliations"
      ADD CONSTRAINT "inventory_reconciliations_source_item_lineage_fk"
      FOREIGN KEY ("source_item_id", "source_id", "seller_id")
      REFERENCES "inventory_source_items" ("id", "source_id", "seller_id")
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_reconciliations_ingest_batch_lineage_fk'
      AND conrelid = 'public.inventory_reconciliations'::regclass
  ) THEN
    ALTER TABLE "inventory_reconciliations"
      ADD CONSTRAINT "inventory_reconciliations_ingest_batch_lineage_fk"
      FOREIGN KEY ("ingest_batch_id", "source_id", "seller_id")
      REFERENCES "inventory_ingest_batches" ("id", "source_id", "seller_id")
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_reconciliations_listing_seller_lineage_fk'
      AND conrelid = 'public.inventory_reconciliations'::regclass
  ) THEN
    ALTER TABLE "inventory_reconciliations"
      ADD CONSTRAINT "inventory_reconciliations_listing_seller_lineage_fk"
      FOREIGN KEY ("listing_id", "seller_id")
      REFERENCES "listings" ("id", "seller_id")
      ON DELETE SET NULL ("listing_id")
      NOT VALID;
  END IF;
END
$$;
