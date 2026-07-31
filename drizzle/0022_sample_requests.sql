DO $$
BEGIN
  CREATE TYPE "sample_request_status" AS ENUM (
    'requested',
    'approved',
    'declined',
    'cancelled',
    'shipped',
    'delivered'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "sample_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "listing_id" uuid NOT NULL REFERENCES "listings"("id") ON DELETE cascade,
  "buyer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "seller_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "status" "sample_request_status" DEFAULT 'requested' NOT NULL,
  "buyer_message" text,
  "shipping_name" varchar(255) NOT NULL,
  "shipping_address_1" text NOT NULL,
  "shipping_address_2" text,
  "shipping_city" varchar(100) NOT NULL,
  "shipping_state" varchar(2) NOT NULL,
  "shipping_zip" varchar(10) NOT NULL,
  "shipping_phone" varchar(20),
  "buyer_consented_to_share_address_at" timestamp with time zone,
  "carrier" varchar(100),
  "tracking_number" varchar(120),
  "approved_at" timestamp with time zone,
  "declined_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "shipped_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "last_action_reason" text,
  "audit_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "sample_requests_listing_id_idx"
  ON "sample_requests" ("listing_id");

CREATE INDEX IF NOT EXISTS "sample_requests_buyer_id_idx"
  ON "sample_requests" ("buyer_id");

CREATE INDEX IF NOT EXISTS "sample_requests_seller_id_idx"
  ON "sample_requests" ("seller_id");

CREATE INDEX IF NOT EXISTS "sample_requests_status_idx"
  ON "sample_requests" ("status", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "sample_requests_listing_buyer_open_idx"
  ON "sample_requests" ("listing_id", "buyer_id")
  WHERE "status" IN ('requested', 'approved', 'shipped');

ALTER TABLE "sample_requests" ENABLE ROW LEVEL SECURITY;

-- Sample requests contain buyer shipping addresses. All access is mediated by
-- authenticated server routes, so keep the table unavailable through the
-- browser Data API even if project-wide default grants change later.
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
      'REVOKE ALL PRIVILEGES ON TABLE public.sample_requests FROM %I',
      target_role
    );
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public.sample_requests TO service_role;
  END IF;
END
$$;

COMMENT ON TABLE "sample_requests" IS
  'Server-only sample workflow containing buyer address data revealed to sellers only after approval and consent.';
