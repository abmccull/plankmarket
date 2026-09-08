import { expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sellerFinancialAggregates } from "../seller-financials";
it("excludes unpaid and cancelled proceeds before exact aggregation", () => {
  const dialect = new PgDialect();
  const query = dialect.sqlToQuery(sellerFinancialAggregates.proceedsCents).sql;
  expect(query).toContain("'succeeded', 'partially_refunded'");
  expect(query).toContain("not in ('pending', 'cancelled', 'refunded')");
  expect(query).toContain("as bigint)::text");
  expect(dialect.sqlToQuery(sellerFinancialAggregates.netTransfersCents).sql).toContain('"stripe_transfer_id" is not null');
});
