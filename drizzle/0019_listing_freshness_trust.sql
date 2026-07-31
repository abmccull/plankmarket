ALTER TABLE "listings"
  ADD COLUMN IF NOT EXISTS "last_confirmed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "confirmation_due_at" timestamp with time zone;

UPDATE "listings"
SET
  "last_confirmed_at" = COALESCE("last_confirmed_at", "updated_at", "created_at", NOW()),
  "confirmation_due_at" = COALESCE(
    "confirmation_due_at",
    COALESCE("last_confirmed_at", "updated_at", "created_at", NOW()) + INTERVAL '14 days'
  )
WHERE "last_confirmed_at" IS NULL
   OR "confirmation_due_at" IS NULL;

CREATE INDEX IF NOT EXISTS "listings_confirmation_due_at_idx"
  ON "listings" ("confirmation_due_at");
