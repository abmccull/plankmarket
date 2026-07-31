-- Auth/data boundary hardening for the server-only Drizzle architecture.
-- This migration is intentionally repo-only; it must be reviewed and applied
-- through the normal database change process. It makes no live changes itself.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "verification_submission_id" uuid;

CREATE INDEX IF NOT EXISTS "users_verification_submission_id_idx"
  ON "users" ("verification_submission_id");

-- verification_status is the canonical authorization state. Normalize any
-- historical drift before enforcing the compatibility boolean invariant.
UPDATE "users"
SET "verification_status" = 'unverified'
WHERE "verification_status" NOT IN (
  'unverified',
  'pending',
  'verified',
  'rejected'
);

UPDATE "users"
SET "verified" = ("verification_status" = 'verified')
WHERE "verified" IS DISTINCT FROM ("verification_status" = 'verified');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_verification_status_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_verification_status_check"
      CHECK (
        "verification_status" IN (
          'unverified',
          'pending',
          'verified',
          'rejected'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_verification_state_consistent_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_verification_state_consistent_check"
      CHECK ("verified" = ("verification_status" = 'verified'));
  END IF;
END
$$;

ALTER TABLE "media"
  ADD COLUMN IF NOT EXISTS "uploader_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'media_uploader_id_users_id_fk'
      AND conrelid = 'public.media'::regclass
  ) THEN
    ALTER TABLE "media"
      ADD CONSTRAINT "media_uploader_id_users_id_fk"
      FOREIGN KEY ("uploader_id")
      REFERENCES "users" ("id")
      ON DELETE CASCADE;
  END IF;
END
$$;

-- Attached legacy media can be attributed deterministically. Truly orphaned
-- legacy rows remain visible for an explicit operator cleanup rather than
-- being silently assigned or deleted.
UPDATE "media" AS m
SET "uploader_id" = l."seller_id"
FROM "listings" AS l
WHERE m."listing_id" = l."id"
  AND m."uploader_id" IS NULL;

UPDATE "media" AS m
SET "uploader_id" = br."buyer_id"
FROM "buyer_requests" AS br
WHERE m."buyer_request_id" = br."id"
  AND m."uploader_id" IS NULL;

CREATE INDEX IF NOT EXISTS "media_uploader_id_idx"
  ON "media" ("uploader_id");

DO $$
DECLARE
  duplicate_count integer;
BEGIN
  SELECT count(*)
  INTO duplicate_count
  FROM (
    SELECT "key"
    FROM "media"
    WHERE "key" IS NOT NULL
    GROUP BY "key"
    HAVING count(*) > 1
  ) AS duplicate_keys;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Cannot create media UploadThing key uniqueness index: % duplicate key(s) require an ownership-preserving operator review',
      duplicate_count;
  END IF;
END
$$;

DROP INDEX IF EXISTS "media_uploadthing_key_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "media_uploadthing_key_unique_idx"
  ON "media" ("key")
  WHERE "key" IS NOT NULL;

-- NOT VALID preserves unattributable legacy rows while still rejecting new or
-- updated rows without ownership. Validate after the orphan audit is clean.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'media_uploader_required_check'
      AND conrelid = 'public.media'::regclass
  ) THEN
    ALTER TABLE "media"
      ADD CONSTRAINT "media_uploader_required_check"
      CHECK ("uploader_id" IS NOT NULL) NOT VALID;
  END IF;
END
$$;

-- The application uses Supabase Auth but performs all database access through
-- trusted server-side Drizzle connections. Remove the browser Data API path.
DO $$
DECLARE
  target_role text;
  owner_role text;
BEGIN
  FOR target_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated')
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I',
      target_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I',
      target_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %I',
      target_role
    );
    EXECUTE format(
      'REVOKE USAGE ON SCHEMA public FROM %I',
      target_role
    );

    FOR owner_role IN
      SELECT rolname
      FROM pg_roles
      WHERE rolname IN (current_user, 'postgres')
        AND (
          rolname = current_user
          OR pg_has_role(current_user, oid, 'MEMBER')
        )
    LOOP
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM %I',
        owner_role,
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM %I',
        owner_role,
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I',
        owner_role,
        target_role
      );
    END LOOP;
  END LOOP;

  REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

  FOR owner_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname IN (current_user, 'postgres')
      AND (
        rolname = current_user
        OR pg_has_role(current_user, oid, 'MEMBER')
      )
  LOOP
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
      owner_role
    );
  END LOOP;
END
$$;
