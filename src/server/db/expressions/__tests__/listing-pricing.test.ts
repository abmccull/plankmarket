import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  getDirectPurchaseLotValueSql,
  getDirectPurchaseUnitPriceSql,
} from "../listing-pricing";

describe("listing direct-purchase SQL expressions", () => {
  const dialect = new PgDialect();

  it("uses buy-now price first and falls back to ask price", () => {
    const query = dialect.sqlToQuery(getDirectPurchaseUnitPriceSql());
    const normalizedSql = query.sql.replace(/\s+/g, " ");

    expect(normalizedSql).toContain(
      'coalesce( "listings"."buy_now_price", "listings"."ask_price_per_sq_ft" )',
    );
  });

  it("uses the same effective unit price for lot value", () => {
    const query = dialect.sqlToQuery(getDirectPurchaseLotValueSql());
    const normalizedSql = query.sql.replace(/\s+/g, " ");

    expect(normalizedSql).toContain(
      'coalesce( "listings"."buy_now_price", "listings"."ask_price_per_sq_ft" )',
    );
    expect(normalizedSql).toContain('* "listings"."total_sq_ft"');
  });
});
