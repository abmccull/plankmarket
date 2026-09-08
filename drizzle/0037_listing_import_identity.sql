CREATE TABLE IF NOT EXISTS import_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  fingerprint varchar(64) NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS import_requests_seller_request_unique ON import_requests(seller_id, request_id);
ALTER TABLE import_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON import_requests FROM anon, authenticated;
