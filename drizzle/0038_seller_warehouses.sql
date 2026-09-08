-- Additive; no legacy address guessing or backfill. Existing paid shipment snapshots remain immutable.
CREATE TABLE warehouses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seller_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 label varchar(100) NOT NULL, address text NOT NULL, city varchar(100) NOT NULL, state varchar(2) NOT NULL, zip varchar(5) NOT NULL,
 contact_name varchar(255) NOT NULL, phone varchar(30) NOT NULL,
 pickup_start varchar(5) NOT NULL, pickup_end varchar(5) NOT NULL,
 has_loading_dock boolean NOT NULL DEFAULT false, has_forklift boolean NOT NULL DEFAULT false,
 latitude real, longitude real, coordinate_source varchar(30) NOT NULL DEFAULT 'zip_centroid',
 active boolean NOT NULL DEFAULT true, is_default boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT warehouse_default_active CHECK (NOT is_default OR active),
 CONSTRAINT warehouses_id_seller_key UNIQUE (id,seller_id)
);
CREATE INDEX warehouses_seller_idx ON warehouses(seller_id);
CREATE UNIQUE INDEX warehouses_one_default_idx ON warehouses(seller_id) WHERE is_default;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
-- Access only through the server-owned database role and scoped tRPC procedures.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE warehouses FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE warehouses FROM authenticated; END IF;
END $$;
ALTER TABLE listings ADD COLUMN warehouse_id uuid REFERENCES warehouses(id) ON DELETE RESTRICT;
ALTER TABLE listings ADD CONSTRAINT listings_warehouse_seller_fk FOREIGN KEY (warehouse_id,seller_id) REFERENCES warehouses(id,seller_id) ON DELETE RESTRICT;
CREATE INDEX listings_warehouse_idx ON listings(warehouse_id);
