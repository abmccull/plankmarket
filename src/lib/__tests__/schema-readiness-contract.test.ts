import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MARKETPLACE_SCHEMA_READINESS_SQL,
  MARKETPLACE_SCHEMA_VERSION,
  marketplaceSchemaContract,
} from "@/lib/schema-readiness-contract";

describe("marketplace schema readiness contract", () => {
  it("requires the durable role-write fence and private deletion guard", () => {
    expect(marketplaceSchemaContract.sensitiveTables).toContain("role_provider_writes");
    for (const column of ["id", "version", "user_id", "auth_id", "expected_role", "activation_marker", "purpose", "source_id", "issued_at", "confirmed_at"]) {
      expect(marketplaceSchemaContract.columns).toContainEqual(["role_provider_writes", column]);
    }
    for (const index of ["role_provider_writes_pkey", "role_provider_writes_user_id_version_key", "role_provider_one_unconfirmed_user_idx", "role_provider_one_unconfirmed_auth_idx", "role_provider_latest_user_idx", "verification_documents_pending_deletion_idx"]) {
      expect(marketplaceSchemaContract.indexes).toContain(index);
    }
    for (const constraint of ["role_provider_writes_pkey", "role_provider_writes_version_check", "role_provider_writes_user_id_fkey", "role_provider_writes_purpose_check", "role_provider_writes_check", "role_provider_writes_user_id_version_key", "verification_documents_deletion_time_check"]) {
      expect(marketplaceSchemaContract.constraints).toContain(constraint);
    }
    expect(marketplaceSchemaContract.triggers).toContain("role_provider_write_guard");
    expect(marketplaceSchemaContract.functions).toContain("guard_role_provider_write()");
    expect(marketplaceSchemaContract.columns).toContainEqual(["verification_documents", "deletion_requested_at"]);
    expect(marketplaceSchemaContract.triggers).toContain("verification_documents_deletion_intent_guard");
    expect(marketplaceSchemaContract.functions).toContain("protect_private_verification_deletion()");
  });

  it("binds health and pre-deploy checks through privacy, lineage, and operations artifacts", () => {
    expect(MARKETPLACE_SCHEMA_VERSION).toBe("0048");
    expect(marketplaceSchemaContract.columns).toContainEqual(["user_preferences", "buyer_match_in_app_enabled"]);
    expect(marketplaceSchemaContract.columns).toContainEqual(["user_preferences", "buyer_match_email_enabled"]);
    expect(marketplaceSchemaContract.extensions).toContain("pg_trgm");
    expect(marketplaceSchemaContract.sensitiveTables).toContain(
      "inventory_adjustments",
    );
    expect(marketplaceSchemaContract.sensitiveTables).toContain(
      "shipping_addresses",
    );
    expect(marketplaceSchemaContract.indexes).toContain(
      "listings_search_document_trgm_idx",
    );
    expect(marketplaceSchemaContract.indexes).toContain(
      "sample_requests_retention_purge_after_idx",
    );
    expect(marketplaceSchemaContract.triggers).toContain(
      "orders_prevent_tax_evidence_mutation",
    );
    expect(marketplaceSchemaContract.triggers).toContain(
      "users_set_verification_retention_defaults",
    );
    expect(marketplaceSchemaContract.indexes).toContain(
      "messages_conversation_created_idx",
    );
  });

  it("checks extensions, columns, RLS, grants, indexes, constraints, triggers, and functions", () => {
    expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain("missing_extensions");
    expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain("missing_columns");
    expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain(
      "missing_or_unsecured_tables",
    );
    expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain(
      "overgranted_sensitive_tables",
    );
    expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain("missing_indexes");
    expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain(
      "missing_constraints",
    );
    expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain("missing_triggers");
    expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain("missing_functions");
  });

  it("uses the exact critical artifact names created by migrations 0025 through 0034", () => {
    const inventoryMigration = readFileSync(
      resolve(process.cwd(), "drizzle/0025_inventory_integrations.sql"),
      "utf8",
    );
    const taxMigration = readFileSync(
      resolve(process.cwd(), "drizzle/0026_tax_readiness.sql"),
      "utf8",
    );
    const performanceMigration = readFileSync(
      resolve(process.cwd(), "drizzle/0027_search_and_analytics_perf.sql"),
      "utf8",
    );
    const operationsIndexMigration = readFileSync(
      resolve(process.cwd(), "drizzle/0028_comms_and_ops_query_indexes.sql"),
      "utf8",
    );
    const paymentClaimMigration = readFileSync(
      resolve(
        process.cwd(),
        "drizzle/0029_payment_intent_preparation_claim.sql",
      ),
      "utf8",
    );
    const stripeInboxMigration = readFileSync(
      resolve(process.cwd(), "drizzle/0030_stripe_webhook_durable_inbox.sql"),
      "utf8",
    );
    const shipmentCancellationMigration = readFileSync(
      resolve(process.cwd(), "drizzle/0031_shipment_cancellation_queue.sql"),
      "utf8",
    );
    const mediaDeletionMigration = readFileSync(
      resolve(process.cwd(), "drizzle/0032_media_deletion_claims.sql"),
      "utf8",
    );
    const privacyMigration = readFileSync(
      resolve(process.cwd(), "drizzle/0033_security_privacy_and_tenancy.sql"),
      "utf8",
    );
    const shipmentBolMigration = readFileSync(
      resolve(process.cwd(), "drizzle/0034_shipment_bol_number.sql"),
      "utf8",
    );

    for (const artifact of [
      "inventory_sources_api_key_hash_uidx",
      "inventory_ingest_batches_source_idempotency_uidx",
      "inventory_adjustments_append_only",
      "prevent_inventory_adjustment_mutation",
    ]) {
      expect(inventoryMigration).toContain(`"${artifact}"`);
      expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain(artifact);
    }

    for (const artifact of [
      "orders_stripe_tax_transaction_id_unique_idx",
      "orders_financial_amounts_nonnegative_check",
      "orders_prevent_tax_evidence_mutation",
      "prevent_order_tax_evidence_mutation",
    ]) {
      expect(taxMigration).toContain(`"${artifact}"`);
      expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain(artifact);
    }

    for (const artifact of [
      "listings_search_document_trgm_idx",
      "listings_public_browse_due_created_idx",
      "listings_published_at_idx",
      "listings_certifications_gin_idx",
      "listings_seller_status_created_idx",
      "listings_seller_views_idx",
      "saved_searches_due_alerts_idx",
      "orders_seller_payment_confirmed_idx",
      "orders_seller_refunded_at_idx",
      "offers_seller_created_idx",
      "reviews_reviewee_direction_created_idx",
    ]) {
      expect(performanceMigration).toContain(`"${artifact}"`);
      expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain(artifact);
    }

    for (const artifact of [
      "ensure_listing_published_at",
      "listings_set_published_at",
    ]) {
      expect(performanceMigration).toContain(`"${artifact}"`);
      expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain(artifact);
    }

    for (const artifact of [
      "conversations_buyer_last_message_idx",
      "conversations_seller_last_message_idx",
      "messages_conversation_created_idx",
      "notifications_user_created_desc_idx",
      "notifications_user_unread_created_idx",
      "buyer_requests_status_created_idx",
      "buyer_requests_material_types_gin_idx",
      "buyer_request_responses_seller_created_idx",
      "followups_seller_status_due_idx",
      "followups_pending_due_id_idx",
      "shipments_status_updated_id_idx",
    ]) {
      expect(operationsIndexMigration).toContain(`"${artifact}"`);
      expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain(artifact);
    }

    for (const artifact of [
      "payment_intent_claim_token",
      "payment_intent_claimed_at",
      "orders_payment_intent_claim_consistency_check",
    ]) {
      expect(paymentClaimMigration).toContain(`"${artifact}"`);
      expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain(artifact);
    }

    for (const artifact of [
      "received_at",
      "event_created_at",
      "payload",
      "stripe_webhook_events_pending_received_idx",
    ]) {
      expect(stripeInboxMigration).toContain(`"${artifact}"`);
      expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain(artifact);
    }

    for (const artifact of [
      "cancellation_requested_at",
      "cancellation_claim_token",
      "cancellation_claimed_at",
      "shipments_cancellation_requested_idx",
      "shipments_cancellation_claim_consistency_check",
    ]) {
      expect(shipmentCancellationMigration).toContain(`"${artifact}"`);
      expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain(artifact);
    }

    for (const artifact of [
      "deletion_claim_token",
      "deletion_claimed_at",
      "media_pending_deletion_claim_idx",
      "media_deletion_claim_consistency_check",
      "prevent_evidence_attachment_to_deleting_media",
      "dispute_evidence_block_deleting_media",
    ]) {
      expect(mediaDeletionMigration).toContain(`"${artifact}"`);
      expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain(artifact);
    }

    for (const artifact of [
      "ein_last_4",
      "verification_data_purge_after",
      "verification_evidence_purged_at",
      "expires_at",
      "purge_after",
      "retention_purge_after",
      "pii_purged_at",
      "analytics_tracking_enabled",
      "analytics_consent_updated_at",
      "users_verification_data_purge_after_idx",
      "verification_drafts_purge_after_idx",
      "sample_requests_retention_purge_after_idx",
      "shipping_addresses_retention_purge_after_idx",
      "users_set_verification_retention_defaults",
      "verification_drafts_set_retention_defaults",
      "sample_requests_set_retention_defaults",
      "shipping_addresses_set_retention_defaults",
      "set_user_verification_retention_defaults",
      "set_verification_draft_retention_defaults",
      "set_sample_request_retention_defaults",
      "set_shipping_address_retention_defaults",
      "conversations_listing_seller_lineage_fk",
      "sample_requests_listing_seller_lineage_fk",
      "offers_listing_seller_lineage_fk",
      "orders_listing_seller_lineage_fk",
      "orders_offer_lineage_fk",
      "buyer_request_responses_listing_seller_lineage_fk",
      "inventory_source_items_source_seller_lineage_fk",
      "inventory_source_items_listing_seller_lineage_fk",
      "inventory_ingest_batches_source_seller_lineage_fk",
      "inventory_adjustments_listing_seller_lineage_fk",
      "inventory_adjustments_source_seller_lineage_fk",
      "inventory_adjustments_source_item_requires_source_check",
      "inventory_adjustments_ingest_batch_requires_source_check",
      "inventory_adjustments_source_item_lineage_fk",
      "inventory_adjustments_ingest_batch_lineage_fk",
      "inventory_reconciliations_source_seller_lineage_fk",
      "inventory_reconciliations_source_item_lineage_fk",
      "inventory_reconciliations_ingest_batch_lineage_fk",
      "inventory_reconciliations_listing_seller_lineage_fk",
      "buyer_requests_id_buyer_idx",
      "media_one_parent_max_check",
      "media_listing_owner_lineage_fk",
      "media_buyer_request_owner_lineage_fk",
    ]) {
      expect(privacyMigration).toContain(`"${artifact}"`);
      expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain(artifact);
    }

    expect(shipmentBolMigration).toContain('"bol_number"');
    expect(MARKETPLACE_SCHEMA_READINESS_SQL).toContain("bol_number");

    expect(privacyMigration).toContain(
      'ON DELETE SET NULL ("listing_id")',
    );
  });
});
