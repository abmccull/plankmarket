-- Stripe Tax readiness and immutable order-tax evidence.
--
-- Historical orders remain explicitly tax-disabled. Tax-enabled checkout is
-- fail-closed until an administrator verifies a listing tax code and the
-- configured liability policy passes the production preflight.

ALTER TABLE "listings"
  ADD COLUMN "stripe_tax_code" varchar(64),
  ADD COLUMN "tax_code_status" varchar(32) DEFAULT 'unassigned' NOT NULL,
  ADD COLUMN "tax_code_verified_at" timestamptz,
  ADD COLUMN "tax_code_verified_by" uuid
    REFERENCES "users" ("id") ON DELETE SET NULL;

CREATE INDEX "listings_tax_code_status_idx"
  ON "listings" ("tax_code_status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_tax_code_status_check'
      AND conrelid = 'public.listings'::regclass
  ) THEN
    ALTER TABLE "listings"
      ADD CONSTRAINT "listings_tax_code_status_check"
      CHECK (
        "tax_code_status" IN (
          'unassigned',
          'pending_review',
          'verified'
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_stripe_tax_code_format_check'
      AND conrelid = 'public.listings'::regclass
  ) THEN
    ALTER TABLE "listings"
      ADD CONSTRAINT "listings_stripe_tax_code_format_check"
      CHECK (
        "stripe_tax_code" IS NULL
        OR "stripe_tax_code" ~ '^txcd_[0-9]+$'
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_verified_tax_code_evidence_check'
      AND conrelid = 'public.listings'::regclass
  ) THEN
    ALTER TABLE "listings"
      ADD CONSTRAINT "listings_verified_tax_code_evidence_check"
      CHECK (
        "tax_code_status" <> 'verified'
        OR (
          "stripe_tax_code" IS NOT NULL
          AND "tax_code_verified_at" IS NOT NULL
          AND "tax_code_verified_by" IS NOT NULL
        )
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE "orders"
  ADD COLUMN "tax_policy_snapshot" jsonb
    DEFAULT '{
      "mode":"disabled",
      "version":1,
      "legalDecisionAcknowledged":false,
      "legalDecisionReference":null,
      "shippingTaxCode":null,
      "buyerFeeTreatment":"undecided",
      "buyerFeeTaxCode":null,
      "liabilityOwner":"none",
      "capturedAt":"1970-01-01T00:00:00.000Z",
      "connectedAccountFlowStatus":"not_applicable"
    }'::jsonb NOT NULL,
  ADD COLUMN "tax_liability" varchar(32) DEFAULT 'none' NOT NULL,
  ADD COLUMN "tax_status" varchar(32) DEFAULT 'disabled' NOT NULL,
  ADD COLUMN "tax_amount" numeric(12, 4) DEFAULT 0 NOT NULL,
  ADD COLUMN "taxable_inventory_amount" numeric(12, 4) DEFAULT 0 NOT NULL,
  ADD COLUMN "taxable_freight_amount" numeric(12, 4) DEFAULT 0 NOT NULL,
  ADD COLUMN "taxable_buyer_fee_amount" numeric(12, 4) DEFAULT 0 NOT NULL,
  ADD COLUMN "stripe_tax_calculation_id" varchar(255),
  ADD COLUMN "stripe_tax_transaction_id" varchar(255),
  ADD COLUMN "stripe_tax_account_id" varchar(255),
  ADD COLUMN "tax_jurisdiction_summary" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN "tax_calculation_evidence" jsonb,
  ADD COLUMN "tax_calculated_at" timestamptz,
  ADD COLUMN "tax_committed_at" timestamptz,
  ADD COLUMN "tax_reversal_status" varchar(32)
    DEFAULT 'not_required' NOT NULL,
  ADD COLUMN "stripe_tax_reversal_transaction_ids" jsonb
    DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN "tax_reversal_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL;

CREATE UNIQUE INDEX "orders_stripe_tax_calculation_id_unique_idx"
  ON "orders" ("stripe_tax_calculation_id")
  WHERE "stripe_tax_calculation_id" IS NOT NULL;
CREATE UNIQUE INDEX "orders_stripe_tax_transaction_id_unique_idx"
  ON "orders" ("stripe_tax_transaction_id")
  WHERE "stripe_tax_transaction_id" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_tax_liability_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_tax_liability_check"
      CHECK (
        "tax_liability" IN ('none', 'platform', 'connected_account')
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_tax_status_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_tax_status_check"
      CHECK (
        "tax_status" IN (
          'disabled',
          'calculated',
          'committed',
          'reconciliation_required'
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_tax_reversal_status_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_tax_reversal_status_check"
      CHECK (
        "tax_reversal_status" IN (
          'not_required',
          'pending',
          'partially_reversed',
          'reversed',
          'reconciliation_required'
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_disabled_tax_consistency_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_disabled_tax_consistency_check"
      CHECK (
        "tax_status" <> 'disabled'
        OR (
          "tax_liability" = 'none'
          AND "tax_amount" = 0
          AND "stripe_tax_calculation_id" IS NULL
          AND "stripe_tax_transaction_id" IS NULL
          AND "tax_calculation_evidence" IS NULL
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_calculated_tax_evidence_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_calculated_tax_evidence_check"
      CHECK (
        "tax_status" = 'disabled'
        OR (
          "tax_liability" <> 'none'
          AND "stripe_tax_calculation_id" IS NOT NULL
          AND "tax_calculation_evidence" IS NOT NULL
          AND "tax_calculated_at" IS NOT NULL
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_committed_tax_evidence_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_committed_tax_evidence_check"
      CHECK (
        "tax_status" <> 'committed'
        OR (
          "stripe_tax_transaction_id" IS NOT NULL
          AND "tax_committed_at" IS NOT NULL
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_connected_tax_checkout_incomplete_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_connected_tax_checkout_incomplete_check"
      CHECK ("tax_liability" <> 'connected_account') NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_total_price_arithmetic_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_total_price_arithmetic_check"
      CHECK (
        "total_price" =
          "subtotal"
          + "buyer_freight_charge"
          + "buyer_fee"
          + "tax_amount"
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_financial_amounts_nonnegative_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_financial_amounts_nonnegative_check"
      CHECK (
        "quantity_sq_ft" > 0
        AND "price_per_sq_ft" >= 0
        AND "subtotal" >= 0
        AND "buyer_fee" >= 0
        AND "seller_fee" >= 0
        AND "total_price" >= 0
        AND "stripe_processing_fee" >= 0
        AND "seller_stripe_fee" >= 0
        AND "platform_stripe_fee" >= 0
        AND "original_seller_payout" >= 0
        AND "seller_payout" >= 0
        AND "tax_amount" >= 0
        AND "taxable_inventory_amount" >= 0
        AND "taxable_freight_amount" >= 0
        AND "taxable_buyer_fee_amount" >= 0
        AND COALESCE("refunded_amount", 0) >= 0
        AND "transfer_reversed_amount" >= 0
      ) NOT VALID;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "enforce_order_financial_snapshot"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."quantity_sq_ft" <= 0
     OR NEW."price_per_sq_ft" < 0
     OR NEW."subtotal" < 0
     OR NEW."buyer_fee" < 0
     OR NEW."seller_fee" < 0
     OR NEW."total_price" < 0
     OR NEW."stripe_processing_fee" < 0
     OR NEW."seller_stripe_fee" < 0
     OR NEW."platform_stripe_fee" < 0
     OR NEW."original_seller_payout" < 0
     OR NEW."seller_payout" < 0
     OR NEW."tax_amount" < 0
     OR NEW."taxable_inventory_amount" < 0
     OR NEW."taxable_freight_amount" < 0
     OR NEW."taxable_buyer_fee_amount" < 0
     OR COALESCE(NEW."refunded_amount", 0) < 0
     OR NEW."transfer_reversed_amount" < 0 THEN
    RAISE EXCEPTION 'order financial amounts must be nonnegative';
  END IF;

  IF NEW."total_price"
     <> NEW."subtotal"
        + NEW."buyer_freight_charge"
        + NEW."buyer_fee"
        + NEW."tax_amount" THEN
    RAISE EXCEPTION 'order buyer charge arithmetic is inconsistent';
  END IF;
  IF NEW."original_seller_payout"
     <> NEW."subtotal" - NEW."seller_fee" - NEW."seller_stripe_fee"
        - NEW."seller_freight_contribution" THEN
    RAISE EXCEPTION 'order original seller payout arithmetic is inconsistent';
  END IF;
  IF NEW."stripe_processing_fee"
     <> NEW."seller_stripe_fee" + NEW."platform_stripe_fee" THEN
    RAISE EXCEPTION 'order processing fee allocation is inconsistent';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "orders_enforce_financial_snapshot" ON "orders";
CREATE TRIGGER "orders_enforce_financial_snapshot"
BEFORE INSERT OR UPDATE OF
  "quantity_sq_ft",
  "price_per_sq_ft",
  "subtotal",
  "buyer_fee",
  "seller_fee",
  "total_price",
  "stripe_processing_fee",
  "seller_stripe_fee",
  "platform_stripe_fee",
  "original_seller_payout",
  "seller_payout",
  "buyer_freight_charge",
  "seller_freight_contribution",
  "tax_amount",
  "taxable_inventory_amount",
  "taxable_freight_amount",
  "taxable_buyer_fee_amount",
  "refunded_amount",
  "transfer_reversed_amount"
ON "orders"
FOR EACH ROW
EXECUTE FUNCTION "enforce_order_financial_snapshot"();

CREATE OR REPLACE FUNCTION "prevent_order_tax_evidence_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."tax_policy_snapshot" IS DISTINCT FROM OLD."tax_policy_snapshot"
     OR NEW."tax_liability" IS DISTINCT FROM OLD."tax_liability"
     OR NEW."tax_amount" IS DISTINCT FROM OLD."tax_amount"
     OR NEW."taxable_inventory_amount"
        IS DISTINCT FROM OLD."taxable_inventory_amount"
     OR NEW."taxable_freight_amount"
        IS DISTINCT FROM OLD."taxable_freight_amount"
     OR NEW."taxable_buyer_fee_amount"
        IS DISTINCT FROM OLD."taxable_buyer_fee_amount"
     OR NEW."stripe_tax_calculation_id"
        IS DISTINCT FROM OLD."stripe_tax_calculation_id"
     OR NEW."stripe_tax_account_id"
        IS DISTINCT FROM OLD."stripe_tax_account_id"
     OR NEW."tax_jurisdiction_summary"
        IS DISTINCT FROM OLD."tax_jurisdiction_summary"
     OR NEW."tax_calculation_evidence"
        IS DISTINCT FROM OLD."tax_calculation_evidence"
     OR NEW."tax_calculated_at" IS DISTINCT FROM OLD."tax_calculated_at" THEN
    RAISE EXCEPTION
      'order tax calculation snapshots are immutable (order_id=%)',
      OLD."id";
  END IF;

  IF OLD."stripe_tax_transaction_id" IS NOT NULL
     AND NEW."stripe_tax_transaction_id"
       IS DISTINCT FROM OLD."stripe_tax_transaction_id" THEN
    RAISE EXCEPTION
      'order tax transaction evidence cannot be changed or cleared (order_id=%)',
      OLD."id";
  END IF;
  IF OLD."tax_committed_at" IS NOT NULL
     AND NEW."tax_committed_at" IS DISTINCT FROM OLD."tax_committed_at" THEN
    RAISE EXCEPTION
      'order tax commitment timestamp cannot be changed or cleared (order_id=%)',
      OLD."id";
  END IF;

  IF jsonb_typeof(NEW."stripe_tax_reversal_transaction_ids") <> 'array'
     OR NOT (
       NEW."stripe_tax_reversal_transaction_ids"
       @> OLD."stripe_tax_reversal_transaction_ids"
     )
     OR jsonb_typeof(NEW."tax_reversal_evidence") <> 'array'
     OR NOT (
       NEW."tax_reversal_evidence" @> OLD."tax_reversal_evidence"
     ) THEN
    RAISE EXCEPTION
      'order tax reversal evidence is append-only (order_id=%)',
      OLD."id";
  END IF;

  IF NOT (
    (OLD."tax_status" = 'disabled'
      AND NEW."tax_status" = 'disabled')
    OR (OLD."tax_status" = 'calculated'
      AND NEW."tax_status" IN (
        'calculated',
        'committed',
        'reconciliation_required'
      ))
    OR (OLD."tax_status" = 'committed'
      AND NEW."tax_status" IN ('committed', 'reconciliation_required'))
    OR (OLD."tax_status" = 'reconciliation_required'
      AND NEW."tax_status" IN ('reconciliation_required', 'committed'))
  ) THEN
    RAISE EXCEPTION
      'invalid order tax status transition % -> % (order_id=%)',
      OLD."tax_status",
      NEW."tax_status",
      OLD."id";
  END IF;

  IF NOT (
    (OLD."tax_reversal_status" = 'not_required'
      AND NEW."tax_reversal_status" IN (
        'not_required',
        'pending',
        'reconciliation_required'
      ))
    OR (OLD."tax_reversal_status" = 'pending'
      AND NEW."tax_reversal_status" IN (
        'pending',
        'partially_reversed',
        'reversed',
        'reconciliation_required'
      ))
    OR (OLD."tax_reversal_status" = 'partially_reversed'
      AND NEW."tax_reversal_status" IN (
        'partially_reversed',
        'pending',
        'reversed',
        'reconciliation_required'
      ))
    OR (OLD."tax_reversal_status" = 'reversed'
      AND NEW."tax_reversal_status" IN (
        'reversed',
        'reconciliation_required'
      ))
    OR (OLD."tax_reversal_status" = 'reconciliation_required'
      AND NEW."tax_reversal_status" IN (
        'reconciliation_required',
        'pending',
        'partially_reversed',
        'reversed'
      ))
  ) THEN
    RAISE EXCEPTION
      'invalid order tax reversal status transition % -> % (order_id=%)',
      OLD."tax_reversal_status",
      NEW."tax_reversal_status",
      OLD."id";
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "orders_prevent_tax_evidence_mutation" ON "orders";
CREATE TRIGGER "orders_prevent_tax_evidence_mutation"
BEFORE UPDATE OF
  "tax_policy_snapshot",
  "tax_liability",
  "tax_status",
  "tax_amount",
  "taxable_inventory_amount",
  "taxable_freight_amount",
  "taxable_buyer_fee_amount",
  "stripe_tax_calculation_id",
  "stripe_tax_transaction_id",
  "stripe_tax_account_id",
  "tax_jurisdiction_summary",
  "tax_calculation_evidence",
  "tax_calculated_at",
  "tax_committed_at",
  "tax_reversal_status",
  "stripe_tax_reversal_transaction_ids",
  "tax_reversal_evidence"
ON "orders"
FOR EACH ROW
EXECUTE FUNCTION "prevent_order_tax_evidence_mutation"();

COMMENT ON COLUMN "listings"."stripe_tax_code" IS
  'Admin-reviewed Stripe Tax product code; sellers cannot self-verify.';
COMMENT ON COLUMN "orders"."tax_policy_snapshot" IS
  'Immutable tax-liability and treatment policy captured at order creation.';
COMMENT ON COLUMN "orders"."tax_calculation_evidence" IS
  'Immutable provider calculation inputs and jurisdiction evidence.';
