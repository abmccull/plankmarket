-- Resumable, server-side business verification drafts.
-- EIN and verification document references must never be persisted in browser
-- storage; all access to this table is mediated by authenticated server routes.

CREATE TABLE IF NOT EXISTS "verification_drafts" (
  "user_id" uuid PRIMARY KEY
    REFERENCES "users" ("id") ON DELETE CASCADE,
  "current_step" integer NOT NULL DEFAULT 1,
  "business_website" text,
  "ein_tax_id" text,
  "verification_doc_url" text,
  "business_address" text,
  "business_city" varchar(100),
  "business_state" varchar(2),
  "business_zip" varchar(10),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'verification_drafts_current_step_check'
      AND conrelid = 'public.verification_drafts'::regclass
  ) THEN
    ALTER TABLE "verification_drafts"
      ADD CONSTRAINT "verification_drafts_current_step_check"
      CHECK ("current_step" BETWEEN 1 AND 3);
  END IF;
END
$$;

ALTER TABLE "verification_drafts" ENABLE ROW LEVEL SECURITY;

-- The app uses a trusted server-side Drizzle connection. Keep verification
-- drafts unreachable from Supabase's browser Data API, even if project-wide
-- default privileges change later.
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
      'REVOKE ALL PRIVILEGES ON TABLE public.verification_drafts FROM %I',
      target_role
    );
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public.verification_drafts TO service_role;
  END IF;
END
$$;

COMMENT ON TABLE "verification_drafts" IS
  'Sensitive business verification work in progress; server access only.';
