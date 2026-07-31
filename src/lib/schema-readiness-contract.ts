export const MARKETPLACE_SCHEMA_VERSION = "0026";

export const marketplaceSchemaContract = {
  columns: [
    ["users", "verification_submission_id"],
    ["users", "stripe_subscription_event_created_at"],
    ["media", "uploader_id"],
    ["orders", "stripe_transfer_reversal_id"],
    ["orders", "transfer_reversed_amount"],
    ["orders", "shipping_booking_snapshot"],
    ["orders", "freight_funding_mode"],
    ["orders", "buyer_freight_charge"],
    ["orders", "seller_freight_contribution"],
    ["orders", "commercial_policy_snapshot"],
    ["orders", "original_seller_payout"],
    ["orders", "tax_policy_snapshot"],
    ["orders", "tax_liability"],
    ["orders", "tax_status"],
    ["orders", "tax_amount"],
    ["orders", "taxable_inventory_amount"],
    ["orders", "taxable_freight_amount"],
    ["orders", "taxable_buyer_fee_amount"],
    ["orders", "stripe_tax_calculation_id"],
    ["orders", "stripe_tax_transaction_id"],
    ["orders", "stripe_tax_account_id"],
    ["orders", "tax_jurisdiction_summary"],
    ["orders", "tax_calculation_evidence"],
    ["orders", "tax_calculated_at"],
    ["orders", "tax_committed_at"],
    ["orders", "tax_reversal_status"],
    ["orders", "stripe_tax_reversal_transaction_ids"],
    ["orders", "tax_reversal_evidence"],
    ["shipments", "is_dry_run"],
    ["shipments", "dispatch_attempted_at"],
    ["stripe_webhook_events", "status"],
    ["stripe_webhook_events", "attempt_count"],
    ["stripe_webhook_events", "processing_started_at"],
    ["stripe_webhook_events", "completed_at"],
    ["stripe_webhook_events", "last_error"],
    ["promotion_credits", "stripe_invoice_id"],
    ["verification_drafts", "user_id"],
    ["verification_drafts", "current_step"],
    ["verification_drafts", "verification_doc_url"],
    ["listings", "last_confirmed_at"],
    ["listings", "confirmation_due_at"],
    ["listings", "full_lot_only"],
    ["listings", "partial_quantity_markup_percent"],
    ["listings", "automatic_markdown_enabled"],
    ["listings", "allow_sample_requests"],
    ["listings", "territory_mode"],
    ["listings", "freight_payment_mode"],
    ["listings", "stripe_tax_code"],
    ["listings", "tax_code_status"],
    ["listings", "tax_code_verified_at"],
    ["listings", "tax_code_verified_by"],
    ["user_preferences", "partial_quantity_markup_percent"],
    ["user_preferences", "automatic_markdown_enabled"],
    ["user_preferences", "allow_sample_requests"],
    ["user_preferences", "selling_territory_mode"],
    ["user_preferences", "freight_payment_mode"],
    ["user_preferences", "tax_registered_states"],
    ["disputes", "reason_code"],
    ["disputes", "source"],
    ["disputes", "reporting_deadline_at"],
    ["disputes", "resolved_refund_amount_cents"],
    ["listing_promotions", "refund_idempotency_key"],
    ["listing_promotions", "refund_attempt_count"],
    ["listing_promotions", "refund_next_attempt_at"],
    ["inventory_sources", "api_key_hash"],
    ["inventory_sources", "status"],
    ["inventory_source_items", "external_item_id"],
    ["inventory_source_items", "listing_id"],
    ["inventory_ingest_batches", "idempotency_key"],
    ["inventory_ingest_batches", "request_hash"],
    ["inventory_adjustments", "idempotency_key"],
    ["inventory_adjustments", "delta_quantity"],
    ["inventory_reconciliations", "reconciliation_key"],
    ["inventory_reconciliations", "status"],
  ],
  sensitiveTables: [
    "verification_drafts",
    "sample_requests",
    "dispute_evidence",
    "reconciliation_cases",
    "reconciliation_case_events",
    "email_deliveries",
    "resend_webhook_events",
    "email_recipient_suppressions",
    "audit_events",
    "inventory_sources",
    "inventory_source_items",
    "inventory_ingest_batches",
    "inventory_adjustments",
    "inventory_reconciliations",
  ],
  indexes: [
    "media_uploadthing_key_unique_idx",
    "promotion_credits_stripe_invoice_id_unique_idx",
    "sample_requests_listing_buyer_open_idx",
    "dispute_evidence_dispute_id_idx",
    "reconciliation_cases_status_severity_idx",
    "reconciliation_case_events_case_created_idx",
    "email_deliveries_provider_message_id_uidx",
    "email_deliveries_status_updated_idx",
    "audit_events_entity_created_idx",
    "audit_events_idempotency_key_unique_idx",
    "orders_open_inventory_reservation_idx",
    "buyer_request_responses_request_seller_unique_idx",
    "buyer_request_responses_one_accepted_per_request_idx",
    "inventory_sources_seller_external_uidx",
    "inventory_sources_api_key_hash_uidx",
    "inventory_source_items_source_external_uidx",
    "inventory_source_items_source_listing_uidx",
    "inventory_ingest_batches_source_idempotency_uidx",
    "listings_tax_code_status_idx",
    "orders_stripe_tax_calculation_id_unique_idx",
    "orders_stripe_tax_transaction_id_unique_idx",
  ],
  constraints: [
    "users_verification_status_check",
    "users_verification_state_consistent_check",
    "media_uploader_required_check",
    "stripe_webhook_events_status_check",
    "stripe_webhook_events_attempt_count_check",
    "verification_drafts_current_step_check",
    "orders_freight_funding_mode_check",
    "orders_freight_funding_amounts_nonnegative_check",
    "orders_freight_funding_split_check",
    "email_deliveries_status_check",
    "email_deliveries_attempt_count_check",
    "reconciliation_cases_amount_nonnegative_check",
    "reconciliation_cases_attempt_count_nonnegative_check",
    "orders_payment_status_check",
    "orders_payment_hold_status_check",
    "listings_total_sq_ft_nonnegative_check",
    "inventory_sources_stale_after_check",
    "inventory_sources_api_key_hash_check",
    "inventory_source_items_quantity_check",
    "inventory_ingest_batches_request_hash_check",
    "inventory_ingest_batches_counts_check",
    "inventory_adjustments_idempotency_key_unique",
    "inventory_adjustments_quantities_check",
    "inventory_adjustments_reason_check",
    "inventory_adjustments_actor_type_check",
    "inventory_reconciliations_reconciliation_key_unique",
    "inventory_reconciliations_quantities_check",
    "inventory_reconciliations_reason_check",
    "listings_tax_code_status_check",
    "listings_stripe_tax_code_format_check",
    "listings_verified_tax_code_evidence_check",
    "orders_total_price_arithmetic_check",
    "orders_financial_amounts_nonnegative_check",
    "orders_tax_liability_check",
    "orders_tax_status_check",
    "orders_tax_reversal_status_check",
    "orders_disabled_tax_consistency_check",
    "orders_calculated_tax_evidence_check",
    "orders_committed_tax_evidence_check",
    "orders_connected_tax_checkout_incomplete_check",
  ],
  triggers: [
    "orders_set_legacy_freight_funding_defaults",
    "orders_prevent_freight_funding_snapshot_update",
    "orders_00_set_original_seller_payout",
    "orders_enforce_financial_snapshot",
    "orders_prevent_commercial_snapshot_update",
    "audit_events_prevent_update_delete",
    "inventory_adjustments_append_only",
    "orders_prevent_tax_evidence_mutation",
  ],
  functions: [
    "enforce_order_financial_snapshot()",
    "prevent_inventory_adjustment_mutation()",
    "prevent_order_tax_evidence_mutation()",
  ],
} as const;

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function oneColumnValues(values: readonly string[]): string {
  return values.map((value) => `(${sqlLiteral(value)})`).join(",\n");
}

function twoColumnValues(
  values: readonly (readonly [string, string])[],
): string {
  return values
    .map(
      ([first, second]) =>
        `(${sqlLiteral(first)}, ${sqlLiteral(second)})`,
    )
    .join(",\n");
}

/**
 * Shared by the public health route and the read-only pre-deploy target check.
 * Keeping one contract prevents a staged deployment from checking a different
 * migration surface than CI checked before deployment.
 */
export const MARKETPLACE_SCHEMA_READINESS_SQL = `
with required_columns(table_name, column_name) as (
  values
    ${twoColumnValues(marketplaceSchemaContract.columns)}
),
missing_columns as (
  select required_columns.*
  from required_columns
  left join information_schema.columns
    on columns.table_schema = 'public'
    and columns.table_name = required_columns.table_name
    and columns.column_name = required_columns.column_name
  where columns.column_name is null
),
required_sensitive_tables(table_name) as (
  values
    ${oneColumnValues(marketplaceSchemaContract.sensitiveTables)}
),
missing_or_unsecured_tables as (
  select required.table_name
  from required_sensitive_tables required
  left join pg_class
    on pg_class.oid = to_regclass('public.' || required.table_name)
  where pg_class.oid is null or not pg_class.relrowsecurity
),
overgranted_sensitive_tables as (
  select distinct grants.table_name, grants.grantee
  from information_schema.role_table_grants grants
  inner join required_sensitive_tables required
    on required.table_name = grants.table_name
  where grants.table_schema = 'public'
    and grants.grantee in ('anon', 'authenticated', 'PUBLIC')
),
required_indexes(index_name) as (
  values
    ${oneColumnValues(marketplaceSchemaContract.indexes)}
),
missing_indexes as (
  select index_name
  from required_indexes
  where to_regclass('public.' || index_name) is null
),
required_constraints(constraint_name) as (
  values
    ${oneColumnValues(marketplaceSchemaContract.constraints)}
),
missing_constraints as (
  select required.constraint_name
  from required_constraints required
  left join pg_constraint
    on pg_constraint.conname = required.constraint_name
  where pg_constraint.oid is null
),
required_triggers(trigger_name) as (
  values
    ${oneColumnValues(marketplaceSchemaContract.triggers)}
),
missing_triggers as (
  select required.trigger_name
  from required_triggers required
  left join pg_trigger
    on pg_trigger.tgname = required.trigger_name
    and not pg_trigger.tgisinternal
  where pg_trigger.oid is null
),
required_functions(function_identity) as (
  values
    ${oneColumnValues(marketplaceSchemaContract.functions)}
),
missing_functions as (
  select function_identity
  from required_functions
  where to_regprocedure('public.' || function_identity) is null
),
missing_artifacts(artifact) as (
  select 'column:' || table_name || '.' || column_name from missing_columns
  union all
  select 'table_or_rls:' || table_name from missing_or_unsecured_tables
  union all
  select 'overgrant:' || table_name || ':' || grantee
    from overgranted_sensitive_tables
  union all
  select 'index:' || index_name from missing_indexes
  union all
  select 'constraint:' || constraint_name from missing_constraints
  union all
  select 'trigger:' || trigger_name from missing_triggers
  union all
  select 'function:' || function_identity from missing_functions
)
select
  not exists (select 1 from missing_artifacts) as "schemaReady",
  count(*)::int as "missingArtifactCount",
  coalesce(
    json_agg(artifact order by artifact),
    '[]'::json
  ) as "missingArtifacts"
from missing_artifacts
`;
