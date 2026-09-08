-- Additive: historical orders retain null request fields.
ALTER TABLE orders ADD COLUMN checkout_request_id uuid;
ALTER TABLE orders ADD COLUMN checkout_input_fingerprint varchar(64);
ALTER TABLE orders ADD CONSTRAINT orders_checkout_request_fingerprint_pair CHECK ((checkout_request_id IS NULL) = (checkout_input_fingerprint IS NULL));
CREATE UNIQUE INDEX orders_buyer_checkout_request_unique ON orders (buyer_id, checkout_request_id);

CREATE TABLE checkout_abandonments (
  buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  abandoned_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (buyer_id, request_id)
);
ALTER TABLE checkout_abandonments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE checkout_abandonments FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE checkout_abandonments FROM authenticated; END IF;
END $$;
