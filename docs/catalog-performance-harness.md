# Catalog Performance Harness

This harness is for pre-launch query verification on a disposable local scratch database only. It is intentionally read-only by default and refuses non-local hosts or database names that do not look disposable.

## What it covers

- Public browse page retrieval
- Public browse bounded count
- Public wildcard text search
- Public proximity search
- Bounded daily and weekly saved-search due selection
- Newly published listing matching for saved-search digests
- Seller analytics across orders, listings, offers, and reviews
  - Includes listing status and top-viewed inventory plus both review aggregations

The scenarios are derived from the current query shapes in:

- `src/server/routers/listing.ts`
- `src/lib/inngest/functions/saved-search-alerts.ts`
- `src/server/routers/analytics.ts`

## Safety rules

- Never point this at production, preview, staging, or any shared cloud database.
- The harness only accepts `localhost`, `127.0.0.1`, `::1`, or `host.docker.internal`.
- The database name must include `scratch`, `perf`, `benchmark`, `local`, `dev`, `test`, or `clone`.
- `--explain` runs `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)` inside `BEGIN READ ONLY`.

## Commands

Inspect the scenario catalog without connecting to any database:

```powershell
npx tsx scripts/run-catalog-performance-harness.ts --list
```

Run the harness against a local scratch database:

```powershell
$env:DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:5432/plankmarket_perf_scratch"
npx tsx scripts/run-catalog-performance-harness.ts --explain
```

Run only a subset and save JSON output:

```powershell
npx tsx scripts/run-catalog-performance-harness.ts `
  --explain `
  --scenario public_text_search,saved_search_due_selection_daily,seller_analytics_overview `
  --json `
  --out .\\test-results\\catalog-performance-harness.json
```

## Synthetic-data workflow

Do this only on a disposable local scratch database.

1. Resolve the migration baseline and apply the current schema to the scratch database.
2. Use the existing `scripts/seed.ts` only as a smoke seed. It is far too small for performance validation.
3. Populate realistic bulk test data outside production with one of these approaches:
   - Preferred: restore an anonymized local clone of the current schema and data shape into the scratch database.
   - Alternative: generate synthetic fixture data that preserves the same column distributions and join cardinalities.
4. Target at least:
   - `100,000` listings
   - `150,000` orders
   - `250,000` offers
   - `40,000` reviews
   - `10,000` saved searches
5. Preserve realistic selectivity:
   - A majority of listings should be `active`, but not all of them.
   - Only a subset should be currently confirmed and territory-unrestricted.
   - Use multiple material types, conditions, states, and created-at ranges.
   - Seller-heavy skew matters. Include a few high-volume sellers and many low-volume sellers.
   - Saved searches should include a mix of `instant`, `daily`, and `weekly`, with varied `last_alert_at` values.
6. Run the harness before and after any index or query-shape changes and keep the JSON output under `test-results/` for comparison.

## What to look for

- Public browse and its 5,001-row bounded count should not fall back to wide sequential scans once realistic data exists.
- Wildcard search should select the generated search-document trigram index.
- Proximity should apply latitude/longitude bounds before exact distance math.
- Daily and weekly digest selectors should remain bounded and use the due-search partial expression index.
- Digest listing scans should use publication time so draft age cannot hide newly released inventory.
- Seller analytics should use the seller/status/date, seller/views, seller/payment/date, seller/date, and reviewee/direction/date composite indexes before grouping.

## Suggested verification order

1. `public_browse_page`
2. `public_browse_count`
3. `public_text_search`
4. `public_proximity_search`
5. `saved_search_due_selection_daily`
6. `saved_search_due_selection_weekly`
7. `saved_search_listing_match`
8. `seller_analytics_overview`
9. `seller_analytics_inventory_status`
10. `seller_analytics_inventory_top_viewed`
11. `seller_analytics_offers_top_negotiated`
12. `seller_analytics_reviews_distribution`
13. `seller_analytics_reviews_time_series`
