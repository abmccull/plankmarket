import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
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

export const SEED_PAYMENT_INTENT_PREFIX = "pi_seed_";
export const SEED_PROMOTION_PAYMENT_INTENT_PREFIX = "pi_seed_promo_";
export const PLACEHOLDER_VERIFICATION_DOC_PREFIX =
  "https://placehold.co/800x600/EEE/999?text=";
export const KNOWN_MARKETPLACE_FIXTURE_EMAILS = Object.freeze([
  "admin@plankmarket.com",
  "sarah@mitchellflooring.com",
  "james@chenfloors.com",
  "maria@garciahardwoods.com",
  "robert@thompsonlumber.com",
  "emily@davisflooring.com",
  "michael@browncontracting.com",
  "lisa@wilsonrenovations.com",
]);
export const KNOWN_MARKETPLACE_FIXTURE_USER_THRESHOLD = 3;

function toSqlStringLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export const KNOWN_MARKETPLACE_FIXTURE_SIGNATURE_SQL = `
  select
    (
      select count(*)
      from orders
      where stripe_payment_intent_id like ${toSqlStringLiteral(`${SEED_PAYMENT_INTENT_PREFIX}%`)}
    )::int as seed_order_payment_intents,
    (
      select count(*)
      from listing_promotions
      where stripe_payment_intent_id like ${toSqlStringLiteral(`${SEED_PROMOTION_PAYMENT_INTENT_PREFIX}%`)}
    )::int as seed_promotion_payment_intents,
    (
      select count(*)
      from users
      where verification_doc_url like ${toSqlStringLiteral(`${PLACEHOLDER_VERIFICATION_DOC_PREFIX}%`)}
    )::int as placeholder_verification_docs,
    (
      select count(*)
      from users
      where lower(email) in (
        ${KNOWN_MARKETPLACE_FIXTURE_EMAILS.map((email) => toSqlStringLiteral(email)).join(",\n        ")}
      )
    )::int as known_fixture_users
`;

function loadDatabaseTarget() {
  if (requestedFile) {
    const filePath = resolve(process.cwd(), requestedFile);
    if (!existsSync(filePath)) {
      throw new Error(`Env file not found: ${filePath}`);
    }
    const parsedEnv = parseDotEnv(readFileSync(filePath));
    const databaseUrl =
      parsedEnv.DATABASE_MIGRATION_URL ?? parsedEnv.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        `DATABASE_URL or DATABASE_MIGRATION_URL is missing from ${filePath}`,
      );
    }
    return {
      databaseUrl,
      sourceLabel: filePath,
    };
  }

  const databaseUrl =
    process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL or DATABASE_MIGRATION_URL is required for the marketplace data audit.",
    );
  }
  return {
    databaseUrl,
    sourceLabel: "process environment",
  };
}

function record(results, failures, warnings, name, count, severity, message) {
  results[name] = Number(count);
  if (Number(count) <= 0) return;
  (severity === "failure" ? failures : warnings).push(
    `${message} (${count})`,
  );
}

function recordThreshold(
  results,
  failures,
  warnings,
  name,
  count,
  minimumCount,
  severity,
  message,
) {
  results[name] = Number(count);
  if (Number(count) < minimumCount) return;
  (severity === "failure" ? failures : warnings).push(
    `${message} (${count})`,
  );
}

export async function runMarketplaceDataAudit() {
  const failures = [];
  const warnings = [];
  const results = {};
  const { databaseUrl, sourceLabel } = loadDatabaseTarget();
  let sql = null;

  try {
    sql = postgres(databaseUrl, {
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
          `Marketplace schema ${MARKETPLACE_SCHEMA_VERSION} is not fully applied on ${sourceLabel}; missing ${(schema?.missingArtifacts ?? []).join(", ")}`,
        );
      }

      const [fixtureAudit] = await tx.unsafe(
        KNOWN_MARKETPLACE_FIXTURE_SIGNATURE_SQL,
      );
      record(
        results,
        failures,
        warnings,
        "seed_order_payment_intents",
        fixtureAudit.seed_order_payment_intents,
        "failure",
        "Known seed fixture orders remain in the target database",
      );
      record(
        results,
        failures,
        warnings,
        "seed_promotion_payment_intents",
        fixtureAudit.seed_promotion_payment_intents,
        "failure",
        "Known seed fixture promotion payments remain in the target database",
      );
      record(
        results,
        failures,
        warnings,
        "placeholder_verification_docs",
        fixtureAudit.placeholder_verification_docs,
        "failure",
        "Placeholder verification evidence URLs remain in the target database",
      );
      recordThreshold(
        results,
        failures,
        warnings,
        "known_fixture_users",
        fixtureAudit.known_fixture_users,
        KNOWN_MARKETPLACE_FIXTURE_USER_THRESHOLD,
        "failure",
        "Known seed/demo fixture user cluster remains in the target database",
      );

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
          results,
          failures,
          warnings,
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
        results,
        failures,
        warnings,
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
        results,
        failures,
        warnings,
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
        results,
        failures,
        warnings,
        "open_critical_cases",
        operations.open_critical_cases,
        "failure",
        "Critical reconciliation cases remain open",
      );
      record(
        results,
        failures,
        warnings,
        "stale_email_acceptance",
        operations.stale_email_acceptance,
        "failure",
        "Transactional email acceptance is unresolved",
      );
      record(
        results,
        failures,
        warnings,
        "exhausted_promotion_refunds",
        operations.exhausted_promotion_refunds,
        "failure",
        "Promotion refunds exhausted automated retries",
      );
      record(
        results,
        failures,
        warnings,
        "unresolved_tax_reconciliation",
        operations.unresolved_tax_reconciliation,
        "failure",
        "Tax calculation, commit, or reversal evidence requires reconciliation",
      );
      record(
        results,
        failures,
        warnings,
        "open_inventory_reconciliations",
        operations.open_inventory_reconciliations,
        "warning",
        "Inventory observations are awaiting operator reconciliation",
      );

      const [lineageAudit] = await tx`
        select
          (
            select count(*)
            from conversations c
            left join listings l on l.id = c.listing_id
            where l.id is null or c.seller_id <> l.seller_id
          )::int as conversations_listing_seller_lineage_mismatch,
          (
            select count(*)
            from sample_requests sr
            left join listings l on l.id = sr.listing_id
            where l.id is null or sr.seller_id <> l.seller_id
          )::int as sample_requests_listing_seller_lineage_mismatch,
          (
            select count(*)
            from offers o
            left join listings l on l.id = o.listing_id
            where l.id is null or o.seller_id <> l.seller_id
          )::int as offers_listing_seller_lineage_mismatch,
          (
            select count(*)
            from orders o
            left join listings l on l.id = o.listing_id
            where l.id is null or o.seller_id <> l.seller_id
          )::int as orders_listing_seller_lineage_mismatch,
          (
            select count(*)
            from orders o
            left join offers off on off.id = o.offer_id
            where o.offer_id is not null
              and (
                off.id is null
                or o.buyer_id <> off.buyer_id
                or o.seller_id <> off.seller_id
                or o.listing_id <> off.listing_id
              )
          )::int as orders_offer_lineage_mismatch,
          (
            select count(*)
            from buyer_request_responses brr
            left join listings l on l.id = brr.listing_id
            where brr.listing_id is not null
              and (l.id is null or brr.seller_id <> l.seller_id)
          )::int as buyer_request_responses_listing_seller_lineage_mismatch,
          (
            select count(*)
            from inventory_source_items isi
            left join inventory_sources src on src.id = isi.source_id
            where src.id is null or isi.seller_id <> src.seller_id
          )::int as inventory_source_items_source_seller_lineage_mismatch,
          (
            select count(*)
            from inventory_source_items isi
            left join listings l on l.id = isi.listing_id
            where isi.listing_id is not null
              and (l.id is null or isi.seller_id <> l.seller_id)
          )::int as inventory_source_items_listing_seller_lineage_mismatch,
          (
            select count(*)
            from inventory_ingest_batches iib
            left join inventory_sources src on src.id = iib.source_id
            where src.id is null or iib.seller_id <> src.seller_id
          )::int as inventory_ingest_batches_source_seller_lineage_mismatch,
          (
            select count(*)
            from inventory_adjustments ia
            left join listings l on l.id = ia.listing_id
            where l.id is null or ia.seller_id <> l.seller_id
          )::int as inventory_adjustments_listing_seller_lineage_mismatch,
          (
            select count(*)
            from inventory_adjustments ia
            left join inventory_sources src on src.id = ia.source_id
            where ia.source_id is not null
              and (src.id is null or ia.seller_id <> src.seller_id)
          )::int as inventory_adjustments_source_seller_lineage_mismatch,
          (
            select count(*)
            from inventory_adjustments ia
            left join inventory_source_items isi on isi.id = ia.source_item_id
            where ia.source_item_id is not null
              and (
                isi.id is null
                or ia.source_id is distinct from isi.source_id
                or ia.seller_id is distinct from isi.seller_id
              )
          )::int as inventory_adjustments_source_item_lineage_mismatch,
          (
            select count(*)
            from inventory_adjustments ia
            where ia.source_item_id is not null and ia.source_id is null
          )::int as inventory_adjustments_source_item_requires_source_violation,
          (
            select count(*)
            from inventory_adjustments ia
            left join inventory_ingest_batches iib on iib.id = ia.ingest_batch_id
            where ia.ingest_batch_id is not null
              and (
                iib.id is null
                or ia.source_id is distinct from iib.source_id
                or ia.seller_id is distinct from iib.seller_id
              )
          )::int as inventory_adjustments_ingest_batch_lineage_mismatch,
          (
            select count(*)
            from inventory_adjustments ia
            where ia.ingest_batch_id is not null and ia.source_id is null
          )::int as inventory_adjustments_ingest_batch_requires_source_violation,
          (
            select count(*)
            from inventory_reconciliations ir
            left join inventory_sources src on src.id = ir.source_id
            where src.id is null or ir.seller_id <> src.seller_id
          )::int as inventory_reconciliations_source_seller_lineage_mismatch,
          (
            select count(*)
            from inventory_reconciliations ir
            left join inventory_source_items isi on isi.id = ir.source_item_id
            where isi.id is null
              or ir.source_id <> isi.source_id
              or ir.seller_id <> isi.seller_id
          )::int as inventory_reconciliations_source_item_lineage_mismatch,
          (
            select count(*)
            from inventory_reconciliations ir
            left join inventory_ingest_batches iib on iib.id = ir.ingest_batch_id
            where ir.ingest_batch_id is not null
              and (
                iib.id is null
                or ir.source_id <> iib.source_id
                or ir.seller_id <> iib.seller_id
              )
          )::int as inventory_reconciliations_ingest_batch_lineage_mismatch,
          (
            select count(*)
            from inventory_reconciliations ir
            left join listings l on l.id = ir.listing_id
            where ir.listing_id is not null
              and (l.id is null or ir.seller_id <> l.seller_id)
          )::int as inventory_reconciliations_listing_seller_lineage_mismatch,
          (
            select count(*)
            from media
            where num_nonnulls(listing_id, buyer_request_id) > 1
          )::int as media_one_parent_max_violation,
          (
            select count(*)
            from media m
            left join listings l on l.id = m.listing_id
            where m.listing_id is not null
              and (l.id is null or m.uploader_id <> l.seller_id)
          )::int as media_listing_owner_lineage_mismatch,
          (
            select count(*)
            from media m
            left join buyer_requests br on br.id = m.buyer_request_id
            where m.buyer_request_id is not null
              and (br.id is null or m.uploader_id <> br.buyer_id)
          )::int as media_buyer_request_owner_lineage_mismatch
      `;
      for (const [name, count] of Object.entries(lineageAudit)) {
        record(
          results,
          failures,
          warnings,
          name,
          count,
          "failure",
          `Lineage or media integrity check failed: ${name}`,
        );
      }

      const [legacyPolicy] = await tx`
        select count(*)::int as legacy_policy_markers
        from orders
        where commercial_policy_snapshot->>'capturedAt'
          = '1970-01-01T00:00:00.000Z'
      `;
      record(
        results,
        failures,
        warnings,
        "legacy_policy_markers",
        legacyPolicy.legacy_policy_markers,
        "warning",
        "Historical orders use the explicit legacy policy marker",
      );
    });

    return {
      status: failures.length === 0 ? "passed" : "failed",
      sourceLabel,
      results,
      warnings,
      failures,
    };
  } finally {
    if (sql) {
      await sql.end({ timeout: 5 });
    }
  }
}

export async function main() {
  try {
    const summary = await runMarketplaceDataAudit();
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failures.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Marketplace data audit failed.",
    );
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  await main();
}
