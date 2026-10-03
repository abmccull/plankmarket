-- Private, account-scoped form drafts. Incomplete forms are not inventory.
-- Terminal generations retain durable publication receipts for uncertain retries.
CREATE TABLE public.listing_form_drafts (
  id uuid PRIMARY KEY,
  seller_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'editing',
  snapshot jsonb NOT NULL,
  last_save_operation_id uuid NOT NULL,
  last_save_fingerprint text NOT NULL,
  published_listing_id uuid,
  published_revision integer,
  publication_fingerprint text,
  next_draft_id uuid,
  advance_operation_id uuid,
  advance_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listing_form_drafts_revision_check CHECK (revision > 0 AND generation > 0),
  CONSTRAINT listing_form_drafts_state_check CHECK (state IN ('editing', 'published', 'discarded')),
  CONSTRAINT listing_form_drafts_snapshot_check CHECK (coalesce(
    jsonb_typeof(snapshot) = 'object'
    AND snapshot->>'schemaVersion' = '2'
    AND (snapshot->>'currentStep')::integer BETWEEN 1 AND 3
    AND jsonb_typeof(snapshot->'formData') = 'object'
    AND jsonb_typeof(snapshot->'uploadedMediaIds') = 'array'
    AND jsonb_array_length(snapshot->'uploadedMediaIds') <= 20
    AND jsonb_typeof(snapshot->'defaultsApplied') = 'boolean'
    AND octet_length(snapshot::text) <= 110000, false)),
  CONSTRAINT listing_form_drafts_receipt_check CHECK (coalesce(
    (state = 'published' AND published_listing_id IS NOT NULL
      AND published_revision > 0 AND published_revision < revision
      AND publication_fingerprint ~ '^[0-9a-f]{64}$')
    OR (state <> 'published' AND published_listing_id IS NULL
      AND published_revision IS NULL AND publication_fingerprint IS NULL), false)),
  CONSTRAINT listing_form_drafts_operation_check CHECK (
    last_save_fingerprint ~ '^[0-9a-f]{64}$'
    AND (num_nonnulls(next_draft_id, advance_operation_id, advance_fingerprint) = 0
      OR (num_nonnulls(next_draft_id, advance_operation_id, advance_fingerprint) = 3
        AND advance_fingerprint ~ '^[0-9a-f]{64}$' AND state <> 'editing'))),
  CONSTRAINT listing_form_drafts_listing_owner_fk
    FOREIGN KEY (published_listing_id, seller_id) REFERENCES public.listings(id, seller_id)
);
CREATE UNIQUE INDEX listing_form_drafts_seller_generation_idx ON public.listing_form_drafts(seller_id, generation);
CREATE UNIQUE INDEX listing_form_drafts_one_editing_idx ON public.listing_form_drafts(seller_id) WHERE state = 'editing';
CREATE INDEX listing_form_drafts_seller_updated_idx ON public.listing_form_drafts(seller_id, updated_at);
ALTER TABLE public.listing_form_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.listing_form_drafts FROM PUBLIC;
DO $$
DECLARE target_role text;
BEGIN
  FOR target_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON public.listing_form_drafts FROM %I', target_role);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_form_drafts TO service_role;
  END IF;
END $$;
COMMENT ON TABLE public.listing_form_drafts IS 'Private unfinished seller forms and retained publication receipts; server access only. Photo UUIDs are soft references, not ownership or retention claims.';
