-- Keep UploadThing network calls outside database transactions while making
-- evidence retention authoritative during a deletion attempt.

ALTER TABLE "media"
  ADD COLUMN IF NOT EXISTS "deletion_claim_token" varchar(64),
  ADD COLUMN IF NOT EXISTS "deletion_claimed_at" timestamptz;

DO $$
BEGIN
  ALTER TABLE "media"
    ADD CONSTRAINT "media_deletion_claim_consistency_check"
    CHECK (
      ("deletion_claim_token" IS NULL) =
      ("deletion_claimed_at" IS NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "media_pending_deletion_claim_idx"
  ON "media" ("deletion_claimed_at")
  WHERE "deletion_claim_token" IS NOT NULL;

CREATE OR REPLACE FUNCTION "prevent_evidence_attachment_to_deleting_media"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."media_id" IS NOT NULL AND EXISTS (
    SELECT 1
    FROM "media"
    WHERE "media"."id" = NEW."media_id"
      AND "media"."deletion_claim_token" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'media deletion is already in progress';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "dispute_evidence_block_deleting_media"
  ON "dispute_evidence";
CREATE TRIGGER "dispute_evidence_block_deleting_media"
  BEFORE INSERT OR UPDATE OF "media_id" ON "dispute_evidence"
  FOR EACH ROW
  EXECUTE FUNCTION "prevent_evidence_attachment_to_deleting_media"();
