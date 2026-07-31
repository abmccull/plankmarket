import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { parse as parseDotEnv } from "dotenv";
import postgres from "postgres";
import {
  MARKETPLACE_SCHEMA_READINESS_SQL,
  MARKETPLACE_SCHEMA_VERSION,
} from "../src/lib/schema-readiness-contract.ts";

const args = process.argv.slice(2);
const fileFlagIndex = args.findIndex((arg) => arg === "--file");
const requestedFile =
  fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : undefined;

if (fileFlagIndex >= 0 && !requestedFile) {
  console.error("Missing value for --file");
  process.exit(1);
}

function loadDatabaseUrl() {
  if (requestedFile) {
    const filePath = resolve(process.cwd(), requestedFile);
    if (!existsSync(filePath)) {
      throw new Error(`Env file not found: ${filePath}`);
    }
    const databaseUrl = parseDotEnv(readFileSync(filePath)).DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(`DATABASE_URL is missing from ${filePath}`);
    }
    return databaseUrl;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required for the marketplace data audit.",
    );
  }
  return process.env.DATABASE_URL;
}

const failures = [];
const warnings = [];
const results = {};
let sql = null;

function record(name, count, severity, message) {
  results[name] = Number(count);
  if (Number(count) <= 0) return;
  (severity === "failure" ? failures : warnings).push(
    `${message} (${count})`,
  );
}

try {
  sql = postgres(loadDatabaseUrl(), {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 5,
  });

  await sql.begin(async (tx) => {
    await tx`set transaction read only`;

    const [schema] = await tx.unsafe(MARKETPLACE_SCHEMA_READINESS_SQL);
    if (!schema?.schemaReady) {
      throw new Error(
        `Marketplace schema ${MARKETPLACE_SCHEMA_VERSION} is not fully applied; missing ${(schema?.missingArtifacts ?? []).join(", ")}`,
      );
    }

    const [orderAudit] = await tx`
      select
        count(*) filter (
          where payment_status not in (
            'pending', 'processing', 'succeeded', 'failed',
            'reconciliation_required', 'refund_pending',
            'partially_refunded', 'refunded', 'paid'
          )
        )::int as invalid_payment_status,
        count(*) filter (
          where escrow_status not in (
            'none', 'held', 'released', 'refunded', 'disputed'
          )
        )::int as invalid_hold_status,
        count(*) filter (
          where quantity_sq_ft <= 0
            or price_per_sq_ft < 0
            or subtotal < 0
            or buyer_fee < 0
            or seller_fee < 0
            or total_price < 0
            or stripe_processing_fee < 0
            or seller_stripe_fee < 0
            or platform_stripe_fee < 0
            or original_seller_payout < 0
            or seller_payout < 0
            or tax_amount < 0
            or taxable_inventory_amount < 0
            or taxable_freight_amount < 0
            or taxable_buyer_fee_amount < 0
            or coalesce(refunded_amount, 0) < 0
            or transfer_reversed_amount < 0
        )::int as negative_financial_amount,
        count(*) filter (
          where total_price
            <> subtotal + buyer_freight_charge + buyer_fee + tax_amount
        )::int as buyer_charge_mismatch,
        count(*) filter (
          where original_seller_payout
            <> subtotal - seller_fee - seller_stripe_fee
              - seller_freight_contribution
        )::int as seller_payout_mismatch,
        count(*) filter (
          where stripe_processing_fee
            <> seller_stripe_fee + platform_stripe_fee
        )::int as processing_fee_mismatch,
        count(*) filter (
          where commercial_policy_snapshot is null
             or not (
               commercial_policy_snapshot
               ?& array[
                 'version',
                 'buyerMarketplaceFeeBps',
                 'sellerMarketplaceFeeBps',
                 'paymentProcessingRateBps',
                 'paymentProcessingFixedFeeCents',
                 'shippingMarkupBps',
                 'capturedAt'
               ]
             )
        )::int as missing_policy_snapshot
      from orders
    `;
    for (const [name, count] of Object.entries(orderAudit)) {
      record(
        name,
        count,
        "failure",
        `Order integrity check failed: ${name}`,
      );
    }

    const [listingAudit] = await tx`
      select count(*)::int as negative_listing_inventory
      from listings
      where total_sq_ft < 0
    `;
    record(
      "negative_listing_inventory",
      listingAudit.negative_listing_inventory,
      "failure",
      "Listings have negative available inventory",
    );

    const [duplicateConnect] = await tx`
      select count(*)::int as duplicate_stripe_accounts
      from (
        select stripe_account_id
        from users
        where stripe_account_id is not null
        group by stripe_account_id
        having count(*) > 1
      ) duplicates
    `;
    record(
      "duplicate_stripe_accounts",
      duplicateConnect.duplicate_stripe_accounts,
      "failure",
      "Stripe connected accounts are attached to multiple users",
    );

    const [operations] = await tx`
      select
        (
          select count(*) from reconciliation_cases
          where status in ('open', 'in_progress', 'waiting_external')
            and severity = 'critical'
        )::int as open_critical_cases,
        (
          select count(*) from email_deliveries
          where status in ('sending', 'acceptance_unknown')
            and updated_at < now() - interval '30 minutes'
        )::int as stale_email_acceptance,
        (
          select count(*) from listing_promotions
          where payment_status = 'refund_pending'
            and refund_attempt_count >= 8
        )::int as exhausted_promotion_refunds,
        (
          select count(*) from orders
          where tax_status = 'reconciliation_required'
             or tax_reversal_status = 'reconciliation_required'
        )::int as unresolved_tax_reconciliation,
        (
          select count(*) from inventory_reconciliations
          where status = 'open'
        )::int as open_inventory_reconciliations
    `;
    record(
      "open_critical_cases",
      operations.open_critical_cases,
      "failure",
      "Critical reconciliation cases remain open",
    );
    record(
      "stale_email_acceptance",
      operations.stale_email_acceptance,
      "failure",
      "Transactional email acceptance is unresolved",
    );
    record(
      "exhausted_promotion_refunds",
      operations.exhausted_promotion_refunds,
      "failure",
      "Promotion refunds exhausted automated retries",
    );
    record(
      "unresolved_tax_reconciliation",
      operations.unresolved_tax_reconciliation,
      "failure",
      "Tax calculation, commit, or reversal evidence requires reconciliation",
    );
    record(
      "open_inventory_reconciliations",
      operations.open_inventory_reconciliations,
      "warning",
      "Inventory observations are awaiting operator reconciliation",
    );

    const [legacyPolicy] = await tx`
      select count(*)::int as legacy_policy_markers
      from orders
      where commercial_policy_snapshot->>'capturedAt'
        = '1970-01-01T00:00:00.000Z'
    `;
    record(
      "legacy_policy_markers",
      legacyPolicy.legacy_policy_markers,
      "warning",
      "Historical orders use the explicit legacy policy marker",
    );
  });

  console.log(
    JSON.stringify(
      {
        status: failures.length === 0 ? "passed" : "failed",
        results,
        warnings,
        failures,
      },
      null,
      2,
    ),
  );
  if (failures.length > 0) process.exitCode = 1;
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Marketplace data audit failed.",
  );
  process.exitCode = 1;
} finally {
  if (sql) {
    await sql.end({ timeout: 5 });
  }
}
