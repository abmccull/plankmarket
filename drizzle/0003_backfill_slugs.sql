-- Backfill slugs for all existing listings
-- Generate slug from title + first 6 characters of UUID
UPDATE listings
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(title, '[^\w\s-]', '', 'g'),
    '[\s_-]+', '-', 'g'
  ) || '-' || LEFT(id::text, 6)
)
WHERE slug IS NULL;
