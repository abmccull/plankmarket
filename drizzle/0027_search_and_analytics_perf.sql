-- Query-shape hardening for public catalog search/browse, saved-search digests,
-- and seller analytics. This is intentionally a forward-only performance
-- migration; it does not attempt to reconstruct the missing historical
-- baseline.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

ALTER TABLE "listings"
  ADD COLUMN IF NOT EXISTS "search_document" text
  GENERATED ALWAYS AS (
    lower(coalesce("title", ''))
      || E'\x1F' || lower(coalesce("description", ''))
      || E'\x1F' || lower(coalesce("brand", ''))
      || E'\x1F' || lower(coalesce("species", ''))
  ) STORED;

ALTER TABLE "listings"
  ADD COLUMN IF NOT EXISTS "published_at" timestamptz;

-- Existing non-draft inventory has already been exposed to buyers. Prefer the
-- most recent confirmation as conservative evidence when reconstructing the
-- original publication timestamp; this can cause one extra digest, but cannot
-- make newly visible inventory disappear from a buyer's first digest window.
UPDATE "listings"
SET "published_at" = greatest(
  "created_at",
  coalesce("last_confirmed_at", "created_at")
)
WHERE "published_at" IS NULL
  AND "status" <> 'draft';

CREATE OR REPLACE FUNCTION "ensure_listing_published_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW."status" = 'active' THEN
    NEW."published_at" := coalesce(NEW."published_at", now());
  ELSIF TG_OP = 'UPDATE'
    AND NEW."status" = 'active'
    AND OLD."status" IS DISTINCT FROM 'active'
  THEN
    NEW."published_at" := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "listings_set_published_at" ON "listings";
CREATE TRIGGER "listings_set_published_at"
  BEFORE INSERT OR UPDATE OF "status" ON "listings"
  FOR EACH ROW
  EXECUTE FUNCTION "ensure_listing_published_at"();

DO $$
DECLARE
  trgm_schema text;
BEGIN
  SELECT n.nspname
    INTO trgm_schema
  FROM pg_extension e
  INNER JOIN pg_namespace n
    ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  IF trgm_schema IS NULL THEN
    RAISE EXCEPTION 'pg_trgm extension must be installed before creating listings_search_document_trgm_idx';
  END IF;

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS "listings_search_document_trgm_idx"
      ON "listings" USING gin ("search_document" %I.gin_trgm_ops)',
    trgm_schema
  );
END
$$;

CREATE INDEX IF NOT EXISTS "listings_public_browse_due_created_idx"
  ON "listings" ("confirmation_due_at", "created_at" DESC)
  WHERE "status" = 'active'
    AND "last_confirmed_at" IS NOT NULL
    AND "confirmation_due_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "listings_published_at_idx"
  ON "listings" ("published_at" DESC)
  WHERE "published_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "listings_certifications_gin_idx"
  ON "listings"
  USING gin ((coalesce("certifications", '[]'::jsonb)));

CREATE INDEX IF NOT EXISTS "listings_seller_status_created_idx"
  ON "listings" ("seller_id", "status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "listings_seller_views_idx"
  ON "listings" ("seller_id", "views_count" DESC);

CREATE INDEX IF NOT EXISTS "saved_searches_due_alerts_idx"
  ON "saved_searches" (
    "alert_frequency",
    (coalesce("last_alert_at", "created_at")),
    "id"
  )
  WHERE "alert_enabled" = true;

CREATE INDEX IF NOT EXISTS "orders_seller_payment_confirmed_idx"
  ON "orders" ("seller_id", "payment_status", "confirmed_at" DESC)
  WHERE "confirmed_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "orders_seller_refunded_at_idx"
  ON "orders" ("seller_id", "refunded_at" DESC)
  WHERE "refunded_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "offers_seller_created_idx"
  ON "offers" ("seller_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "reviews_reviewee_direction_created_idx"
  ON "reviews" ("reviewee_id", "direction", "created_at" DESC);

COMMENT ON COLUMN "listings"."search_document" IS
  'Lowercased generated search surface for substring search across title, description, brand, and species. Unit-separator boundaries preserve current single-field matching semantics.';
