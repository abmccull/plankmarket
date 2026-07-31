import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MARKETPLACE_SCHEMA_READINESS_SQL,
  MARKETPLACE_SCHEMA_VERSION,
  marketplaceSchemaContract,
} from "@/lib/schema-readiness-contract";

describe("marketplace schema readiness contract", () => {
  it("binds health and pre-deploy checks through inventory and tax migrations", () => {
    expect(MARKETPLACE_SCHEMA_VERSION).toBe("0026");
    expect(marketplaceSchemaContract.sensitiveTables).toContain(
      "inventory_adjustments",
    );
    expect(marketplaceSchemaContract.indexes).toContain(
      "orders_stripe_tax_transaction_id_unique_idx",
    );
    expect(marketplaceSchemaContract.triggers).toContain(
      "orders_prevent_tax_evidence_mutation",
    );
  });

  it("checks missing columns, RLS, grants, indexes, constraints, triggers, and functions", () => {
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

  it("uses the exact critical artifact names created by migrations 0025 and 0026", () => {
    const inventoryMigration = readFileSync(
      resolve(process.cwd(), "drizzle/0025_inventory_integrations.sql"),
      "utf8",
    );
    const taxMigration = readFileSync(
      resolve(process.cwd(), "drizzle/0026_tax_readiness.sql"),
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
  });
});
