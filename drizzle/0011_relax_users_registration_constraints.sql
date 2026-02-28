ALTER TABLE "users"
  ALTER COLUMN "phone" DROP NOT NULL,
  ALTER COLUMN "business_name" DROP NOT NULL,
  ALTER COLUMN "business_address" DROP NOT NULL,
  ALTER COLUMN "business_city" DROP NOT NULL,
  ALTER COLUMN "business_state" DROP NOT NULL,
  ALTER COLUMN "business_zip" DROP NOT NULL,
  ALTER COLUMN "avatar_url" DROP NOT NULL,
  ALTER COLUMN "stripe_account_id" DROP NOT NULL,
  ALTER COLUMN "verification_doc_url" DROP NOT NULL,
  ALTER COLUMN "verification_requested_at" DROP NOT NULL,
  ALTER COLUMN "verification_notes" DROP NOT NULL,
  ALTER COLUMN "business_website" DROP NOT NULL,
  ALTER COLUMN "ein_tax_id" DROP NOT NULL,
  ALTER COLUMN "ai_verification_score" DROP NOT NULL,
  ALTER COLUMN "ai_verification_notes" DROP NOT NULL,
  ALTER COLUMN "zip_code" DROP NOT NULL,
  ALTER COLUMN "lat" DROP NOT NULL,
  ALTER COLUMN "lng" DROP NOT NULL;

UPDATE "users"
SET "verification_status" = 'unverified'
WHERE "verification_status" IS NULL;

ALTER TABLE "users"
  ALTER COLUMN "verification_status" SET DEFAULT 'unverified';
