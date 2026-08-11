import {
  assertSafeLocalScratchDatabaseUrl,
  formatScenarioCatalog,
  getCatalogHarnessScenarios,
} from "../catalog-query-harness";

describe("catalog query harness safety", () => {
  it("accepts a local scratch database URL", () => {
    expect(
      assertSafeLocalScratchDatabaseUrl(
        "postgres://postgres:postgres@127.0.0.1:5432/plankmarket_perf_scratch",
      ),
    ).toMatchObject({
      hostname: "127.0.0.1",
      databaseName: "plankmarket_perf_scratch",
    });
  });

  it("rejects a remote provider host", () => {
    expect(() =>
      assertSafeLocalScratchDatabaseUrl(
        "postgres://postgres:postgres@db.abcdef.supabase.co:5432/plankmarket_perf_scratch",
      ),
    ).toThrow(/remote provider host/i);
  });

  it("rejects a local database name that does not look disposable", () => {
    expect(() =>
      assertSafeLocalScratchDatabaseUrl(
        "postgres://postgres:postgres@localhost:5432/plankmarket",
      ),
    ).toThrow(/scratch database names/i);
  });
});

describe("catalog query harness scenarios", () => {
  it("includes the expected scenario families", () => {
    const keys = getCatalogHarnessScenarios().map((scenario) => scenario.key);

    expect(keys).toEqual([
      "public_browse_page",
      "public_browse_count",
      "public_text_search",
      "public_proximity_search",
      "saved_search_due_selection_daily",
      "saved_search_due_selection_weekly",
      "saved_search_listing_match",
      "seller_analytics_overview",
      "seller_analytics_inventory_status",
      "seller_analytics_inventory_top_viewed",
      "seller_analytics_offers_top_negotiated",
      "seller_analytics_reviews_distribution",
      "seller_analytics_reviews_time_series",
    ]);
  });

  it("renders a readable catalog summary", () => {
    const summary = formatScenarioCatalog(getCatalogHarnessScenarios().slice(0, 2));

    expect(summary).toContain("public_browse_page");
    expect(summary).toContain("Public browse page retrieval");
    expect(summary).toContain("src/server/routers/listing.ts:list");
  });
});
