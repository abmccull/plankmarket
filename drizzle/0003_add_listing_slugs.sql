-- Add slug column to listings table
ALTER TABLE listings ADD COLUMN slug TEXT UNIQUE;

-- Add index for fast slug lookups
CREATE INDEX idx_listings_slug ON listings(slug);
