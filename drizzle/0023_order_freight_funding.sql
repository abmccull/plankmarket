ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "freight_funding_mode" varchar(32) NOT NULL DEFAULT 'buyer_pays',
  ADD COLUMN IF NOT EXISTS "buyer_freight_charge" numeric(12, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "seller_freight_contribution" numeric(12, 4) NOT NULL DEFAULT 0;

-- Every pre-migration order was buyer-funded. Preserve shipping_price as the
-- full booked freight and materialize the legacy split without recomputing it.
UPDATE "orders"
SET
  "freight_funding_mode" = 'buyer_pays',
  "buyer_freight_charge" = COALESCE("shipping_price", 0),
  "seller_freight_contribution" = 0
WHERE "freight_funding_mode" = 'buyer_pays'
  AND "buyer_freight_charge" = 0
  AND "seller_freight_contribution" = 0
  AND COALESCE("shipping_price", 0) <> 0;

-- Keep a rolling deployment compatible with the previous application version:
-- an insert that omits the new fields receives the historical buyer-pays split.
CREATE OR REPLACE FUNCTION set_legacy_order_freight_funding_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."freight_funding_mode" = 'buyer_pays'
     AND NEW."buyer_freight_charge" = 0
     AND NEW."seller_freight_contribution" = 0
     AND COALESCE(NEW."shipping_price", 0) <> 0 THEN
    NEW."buyer_freight_charge" := COALESCE(NEW."shipping_price", 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "orders_set_legacy_freight_funding_defaults"
  ON "orders";
CREATE TRIGGER "orders_set_legacy_freight_funding_defaults"
BEFORE INSERT ON "orders"
FOR EACH ROW
EXECUTE FUNCTION set_legacy_order_freight_funding_defaults();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_freight_funding_mode_check'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_freight_funding_mode_check"
      CHECK (
        "freight_funding_mode" IN (
          'buyer_pays',
          'seller_pays',
          'seller_pays_selected_states'
        )
      ) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_freight_funding_amounts_nonnegative_check'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_freight_funding_amounts_nonnegative_check"
      CHECK (
        "buyer_freight_charge" >= 0
        AND "seller_freight_contribution" >= 0
      ) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_freight_funding_split_check'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_freight_funding_split_check"
      CHECK (
        "buyer_freight_charge" + "seller_freight_contribution"
        = COALESCE("shipping_price", 0)
      ) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_buyer_pays_has_no_seller_contribution_check'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_buyer_pays_has_no_seller_contribution_check"
      CHECK (
        "freight_funding_mode" <> 'buyer_pays'
        OR "seller_freight_contribution" = 0
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE "orders"
  VALIDATE CONSTRAINT "orders_freight_funding_mode_check";
ALTER TABLE "orders"
  VALIDATE CONSTRAINT "orders_freight_funding_amounts_nonnegative_check";
ALTER TABLE "orders"
  VALIDATE CONSTRAINT "orders_freight_funding_split_check";
ALTER TABLE "orders"
  VALIDATE CONSTRAINT "orders_buyer_pays_has_no_seller_contribution_check";

-- These are order-time accounting snapshots. Any correction must be an
-- explicit audited migration, never an ordinary application update.
CREATE OR REPLACE FUNCTION prevent_order_freight_funding_snapshot_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."shipping_price" IS DISTINCT FROM OLD."shipping_price"
     OR NEW."freight_funding_mode" IS DISTINCT FROM OLD."freight_funding_mode"
     OR NEW."buyer_freight_charge" IS DISTINCT FROM OLD."buyer_freight_charge"
     OR NEW."seller_freight_contribution" IS DISTINCT FROM OLD."seller_freight_contribution" THEN
    RAISE EXCEPTION
      'order freight funding snapshots are immutable (order_id=%)',
      OLD."id";
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "orders_prevent_freight_funding_snapshot_update"
  ON "orders";
CREATE TRIGGER "orders_prevent_freight_funding_snapshot_update"
BEFORE UPDATE OF
  "shipping_price",
  "freight_funding_mode",
  "buyer_freight_charge",
  "seller_freight_contribution"
ON "orders"
FOR EACH ROW
EXECUTE FUNCTION prevent_order_freight_funding_snapshot_update();

COMMENT ON COLUMN "orders"."shipping_price" IS
  'Immutable full booked freight, including marketplace margin.';
COMMENT ON COLUMN "orders"."freight_funding_mode" IS
  'Applied order-time freight funding mode; immutable after insert.';
COMMENT ON COLUMN "orders"."buyer_freight_charge" IS
  'Freight included in the buyer charge; immutable after insert.';
COMMENT ON COLUMN "orders"."seller_freight_contribution" IS
  'Freight deducted from seller payout; immutable after insert.';
