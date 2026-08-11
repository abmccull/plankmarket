import { Client } from "pg";
import { getBoundingBoxForRadius } from "@/lib/geo-bounds";

const SAFE_LOCAL_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "host.docker.internal",
]);

const BLOCKED_HOST_SUFFIXES = [
  ".supabase.co",
  ".neon.tech",
  ".amazonaws.com",
  ".render.com",
  ".railway.app",
  ".fly.dev",
  ".azure.com",
  ".googleusercontent.com",
];

const SAFE_DATABASE_NAME_PATTERN =
  /(scratch|perf|benchmark|local|dev|test|clone)/i;

const DEFAULT_STATEMENT_TIMEOUT_MS = 15_000;

export type HarnessScenarioKey =
  | "public_browse_page"
  | "public_browse_count"
  | "public_text_search"
  | "public_proximity_search"
  | "saved_search_due_selection_daily"
  | "saved_search_due_selection_weekly"
  | "saved_search_listing_match"
  | "seller_analytics_overview"
  | "seller_analytics_inventory_status"
  | "seller_analytics_inventory_top_viewed"
  | "seller_analytics_offers_top_negotiated"
  | "seller_analytics_reviews_distribution"
  | "seller_analytics_reviews_time_series";

export interface HarnessScenario {
  key: HarnessScenarioKey;
  category: "browse" | "saved_search" | "analytics";
  label: string;
  source: string;
  sql: string;
  params: readonly unknown[];
  notes: readonly string[];
}

export interface SafeScratchTarget {
  hostname: string;
  databaseName: string;
  normalizedUrl: string;
}

export interface ExplainScenarioResult {
  key: HarnessScenarioKey;
  label: string;
  planningTimeMs: number | null;
  executionTimeMs: number | null;
  planRows: number | null;
  rootNodeType: string | null;
  rawPlan: unknown;
}

export interface RunExplainOptions {
  databaseUrl: string;
  scenarios?: readonly HarnessScenario[];
  statementTimeoutMs?: number;
}

type ExplainJsonEnvelope = {
  Plan?: {
    "Node Type"?: string;
    "Plan Rows"?: number;
  };
  "Planning Time"?: number;
  "Execution Time"?: number;
};

export function assertSafeLocalScratchDatabaseUrl(
  databaseUrl: string,
): SafeScratchTarget {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch (error) {
    throw new Error(
      `Invalid DATABASE_URL for performance harness: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  const databaseName = parsed.pathname.replace(/^\/+/, "");

  if (!SAFE_LOCAL_HOSTNAMES.has(hostname)) {
    const blockedSuffix = BLOCKED_HOST_SUFFIXES.find((suffix) =>
      hostname.endsWith(suffix),
    );
    if (blockedSuffix) {
      throw new Error(
        `Refusing performance harness connection to remote provider host "${hostname}". Use a local disposable scratch database only.`,
      );
    }

    throw new Error(
      `Refusing performance harness connection to non-local host "${hostname}". Use localhost, 127.0.0.1, ::1, or host.docker.internal.`,
    );
  }

  if (!databaseName || !SAFE_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      `Refusing database "${databaseName || "(empty)"}". Scratch database names must include one of: scratch, perf, benchmark, local, dev, test, clone.`,
    );
  }

  return {
    hostname,
    databaseName,
    normalizedUrl: parsed.toString(),
  };
}

export function getCatalogHarnessScenarios(now = new Date()): HarnessScenario[] {
  const nowIso = now.toISOString();
  const last90DaysIso = new Date(
    now.getTime() - 90 * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const last30DaysIso = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const last7DaysIso = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const dailyDigestCutoffIso = new Date(
    now.getTime() - 24 * 60 * 60 * 1_000,
  ).toISOString();
  const weeklyDigestCutoffIso = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const proximityOrigin = { latitude: 32.7767, longitude: -96.797 };
  const proximityRadiusMiles = 300;
  const proximityBounds = getBoundingBoxForRadius(
    proximityOrigin,
    proximityRadiusMiles,
  );

  return [
    {
      key: "public_browse_page",
      category: "browse",
      label: "Public browse page retrieval",
      source: "src/server/routers/listing.ts:list",
      sql: `
select
  l.id,
  l.slug,
  l.title,
  l.material_type,
  l.condition,
  l.location_state,
  l.created_at
from listings l
where l.status = 'active'
  and l.last_confirmed_at is not null
  and l.confirmation_due_at is not null
  and l.confirmation_due_at >= $1::timestamptz
  and l.territory_mode = 'unrestricted'
  and l.material_type::text = any($2::text[])
  and l.condition::text = any($3::text[])
  and l.location_state = any($4::text[])
order by
  case
    when l.promotion_tier is not null and l.promotion_expires_at > now() then
      case l.promotion_tier
        when 'premium' then 3
        when 'featured' then 2
        when 'spotlight' then 1
        else 0
      end
    else 0
  end desc,
  l.created_at desc
limit $5::int
offset $6::int
      `.trim(),
      params: [
        nowIso,
        ["hardwood", "engineered"],
        ["new_overstock", "closeout"],
        ["TX", "CA", "FL"],
        24,
        0,
      ] as const,
      notes: [
        "Matches the crawlable public catalog page path with offset pagination.",
        "Useful for validating a partial composite index on active, confirmed inventory plus created_at.",
      ],
    },
    {
      key: "public_browse_count",
      category: "browse",
      label: "Public browse bounded total count",
      source: "src/server/routers/listing.ts:list",
      sql: `
select count(*)::int as total
from (
  select l.id
  from listings l
  where l.status = 'active'
    and l.last_confirmed_at is not null
    and l.confirmation_due_at is not null
    and l.confirmation_due_at >= $1::timestamptz
    and l.territory_mode = 'unrestricted'
    and l.material_type::text = any($2::text[])
    and l.condition::text = any($3::text[])
    and l.location_state = any($4::text[])
  limit 5001
) bounded_public_listing_count
      `.trim(),
      params: [
        nowIso,
        ["hardwood", "engineered"],
        ["new_overstock", "closeout"],
        ["TX", "CA", "FL"],
      ] as const,
      notes: [
        "Measures the capped count query paired with paginated retrieval.",
        "The 5,001-row probe distinguishes exact totals from a truthful 5,000+ result.",
      ],
    },
    {
      key: "public_text_search",
      category: "browse",
      label: "Public wildcard text search",
      source: "src/server/routers/listing.ts:list",
      sql: `
select
  l.id,
  l.slug,
  l.title,
  l.brand,
  l.species,
  l.created_at
from listings l
where l.status = 'active'
  and l.last_confirmed_at is not null
  and l.confirmation_due_at is not null
  and l.confirmation_due_at >= $1::timestamptz
  and l.territory_mode = 'unrestricted'
  and l.search_document ilike $2
order by l.created_at desc
limit $3::int
offset $4::int
      `.trim(),
      params: [nowIso, "%oak%", 24, 0] as const,
      notes: [
        "Measures the generated search_document ILIKE path.",
        "Verify that the planner selects listings_search_document_trgm_idx.",
      ],
    },
    {
      key: "public_proximity_search",
      category: "browse",
      label: "Public proximity search",
      source: "src/server/routers/listing.ts:list",
      sql: `
select
  l.id,
  l.slug,
  l.title,
  (
    3959 * acos(
      least(1, greatest(-1,
        cos(radians($2::double precision))
        * cos(radians(l.location_lat))
        * cos(radians(l.location_lng) - radians($3::double precision))
        + sin(radians($2::double precision)) * sin(radians(l.location_lat))
      ))
    )
  ) as distance_miles
from listings l
where l.status = 'active'
  and l.last_confirmed_at is not null
  and l.confirmation_due_at is not null
  and l.confirmation_due_at >= $1::timestamptz
  and l.territory_mode = 'unrestricted'
  and l.location_lat is not null
  and l.location_lng is not null
  and l.location_lat between $4::double precision and $5::double precision
  and l.location_lng between $6::double precision and $7::double precision
  and (
    3959 * acos(
      least(1, greatest(-1,
        cos(radians($2::double precision))
        * cos(radians(l.location_lat))
        * cos(radians(l.location_lng) - radians($3::double precision))
        + sin(radians($2::double precision)) * sin(radians(l.location_lat))
      ))
    )
  ) <= $8::double precision
order by distance_miles asc
limit $9::int
      `.trim(),
      params: [
        nowIso,
        proximityOrigin.latitude,
        proximityOrigin.longitude,
        proximityBounds.minLatitude,
        proximityBounds.maxLatitude,
        proximityBounds.longitudeRanges[0]!.minLongitude,
        proximityBounds.longitudeRanges[0]!.maxLongitude,
        proximityRadiusMiles,
        24,
      ] as const,
      notes: [
        "Measures the bounding-box prefilter followed by exact Haversine distance.",
        "The representative Dallas radius does not cross the antimeridian.",
      ],
    },
    {
      key: "saved_search_due_selection_daily",
      category: "saved_search",
      label: "Daily saved-search due selection",
      source: "src/lib/inngest/functions/saved-search-alerts.ts:select-digest-search-batch",
      sql: `
select
  s.id,
  s.user_id,
  s.last_alert_at,
  s.alert_frequency,
  s.created_at
from saved_searches s
inner join users u on u.id = s.user_id
where s.alert_enabled = true
  and s.alert_frequency = 'daily'
  and coalesce(s.last_alert_at, s.created_at) <= $1::timestamptz
order by coalesce(s.last_alert_at, s.created_at) asc, s.id asc
limit $2::int
      `.trim(),
      params: [dailyDigestCutoffIso, 25] as const,
      notes: [
        "Matches the bounded production selector for daily digests.",
        "Verify that the planner selects saved_searches_due_alerts_idx.",
      ],
    },
    {
      key: "saved_search_due_selection_weekly",
      category: "saved_search",
      label: "Weekly saved-search due selection",
      source: "src/lib/inngest/functions/saved-search-alerts.ts:select-digest-search-batch",
      sql: `
select
  s.id,
  s.user_id,
  s.last_alert_at,
  s.alert_frequency,
  s.created_at
from saved_searches s
where s.alert_enabled = true
  and s.alert_frequency = 'weekly'
  and coalesce(s.last_alert_at, s.created_at) <= $1::timestamptz
order by coalesce(s.last_alert_at, s.created_at) asc, s.id asc
limit $2::int
      `.trim(),
      params: [weeklyDigestCutoffIso, 25] as const,
      notes: [
        "Matches the bounded production selector for weekly digests.",
        "Verify that the planner selects saved_searches_due_alerts_idx.",
      ],
    },
    {
      key: "saved_search_listing_match",
      category: "saved_search",
      label: "Saved-search newly published listing match",
      source: "src/lib/inngest/functions/saved-search-alerts.ts:process-digest-alerts",
      sql: `
select
  l.id,
  l.slug,
  l.title,
  l.published_at
from listings l
where l.status = 'active'
  and l.last_confirmed_at is not null
  and l.confirmation_due_at is not null
  and l.confirmation_due_at >= $1::timestamptz
  and l.territory_mode = 'unrestricted'
  and l.published_at >= $2::timestamptz
  and l.published_at <= $1::timestamptz
  and l.search_document ilike $3
order by l.published_at desc
limit $4::int
      `.trim(),
      params: [nowIso, dailyDigestCutoffIso, "%oak%", 10] as const,
      notes: [
        "Matches the digest window on publication time rather than draft creation time.",
        "Verify use of listings_published_at_idx and listings_search_document_trgm_idx at realistic selectivity.",
      ],
    },
    {
      key: "seller_analytics_overview",
      category: "analytics",
      label: "Seller analytics overview revenue cohort",
      source: "src/server/routers/analytics.ts:overview",
      sql: `
select
  coalesce(sum(o.seller_payout), 0)::float as revenue,
  count(*)::int as order_count
from orders o
where o.seller_id = $1::uuid
  and o.payment_status = any($2::text[])
  and o.confirmed_at is not null
  and o.confirmed_at >= $3::timestamptz
  and o.confirmed_at < $4::timestamptz
      `.trim(),
      params: [
        "11111111-1111-1111-1111-111111111111",
        ["succeeded", "partially_refunded"],
        last90DaysIso,
        nowIso,
      ] as const,
      notes: [
        "Measures the seller revenue/order cohort that is used repeatedly across the dashboard.",
        "Verify that the planner selects orders_seller_payment_confirmed_idx.",
      ],
    },
    {
      key: "seller_analytics_inventory_status",
      category: "analytics",
      label: "Seller analytics inventory status aggregation",
      source: "src/server/routers/analytics.ts:inventory",
      sql: `
select
  l.status,
  count(*)::int as count,
  coalesce(sum(l.total_sq_ft), 0)::float as total_sq_ft
from listings l
where l.seller_id = $1::uuid
group by l.status
      `.trim(),
      params: ["11111111-1111-1111-1111-111111111111"] as const,
      notes: [
        "Covers the per-seller listings aggregation used on the inventory dashboard.",
        "Verify that the planner selects listings_seller_status_created_idx.",
      ],
    },
    {
      key: "seller_analytics_inventory_top_viewed",
      category: "analytics",
      label: "Seller analytics top-viewed inventory",
      source: "src/server/routers/analytics.ts:inventory",
      sql: `
select
  l.id,
  l.title,
  l.views_count,
  l.status,
  l.created_at
from listings l
where l.seller_id = $1::uuid
order by l.views_count desc
limit 10
      `.trim(),
      params: ["11111111-1111-1111-1111-111111111111"] as const,
      notes: [
        "Matches the seller dashboard's top-viewed inventory query.",
        "Verify that the planner selects listings_seller_views_idx.",
      ],
    },
    {
      key: "seller_analytics_offers_top_negotiated",
      category: "analytics",
      label: "Seller analytics offers top-negotiated listings",
      source: "src/server/routers/analytics.ts:offers",
      sql: `
select
  o.listing_id,
  l.title,
  l.slug,
  count(*)::int as offer_count,
  coalesce(avg(o.current_round), 0)::float as avg_rounds
from offers o
inner join listings l on l.id = o.listing_id
where o.seller_id = $1::uuid
  and o.created_at >= $2::timestamptz
  and o.created_at < $3::timestamptz
group by o.listing_id, l.title, l.slug
order by count(*) desc
limit 10
      `.trim(),
      params: [
        "11111111-1111-1111-1111-111111111111",
        last90DaysIso,
        nowIso,
      ] as const,
      notes: [
        "Captures the offers-side aggregation plus join used by the seller analytics page.",
        "Verify that the planner selects offers_seller_created_idx before the grouping step.",
      ],
    },
    {
      key: "seller_analytics_reviews_distribution",
      category: "analytics",
      label: "Seller analytics reviews distribution",
      source: "src/server/routers/analytics.ts:reviews",
      sql: `
select
  r.rating,
  count(*)::int as count
from reviews r
where r.reviewee_id = $1::uuid
  and r.direction = 'buyer_to_seller'
  and r.created_at >= $2::timestamptz
  and r.created_at < $3::timestamptz
group by r.rating
order by r.rating asc
      `.trim(),
      params: [
        "11111111-1111-1111-1111-111111111111",
        last30DaysIso,
        nowIso,
      ] as const,
      notes: [
        "Captures the reviews-side grouped aggregation on the seller analytics page.",
      ],
    },
    {
      key: "seller_analytics_reviews_time_series",
      category: "analytics",
      label: "Seller analytics reviews time series",
      source: "src/server/routers/analytics.ts:reviews",
      sql: `
select
  date_trunc('week', r.created_at)::text as bucket,
  coalesce(avg(r.rating), 0)::float as avg_rating,
  count(*)::int as count
from reviews r
where r.reviewee_id = $1::uuid
  and r.direction = 'buyer_to_seller'
  and r.created_at >= $2::timestamptz
  and r.created_at < $3::timestamptz
group by date_trunc('week', r.created_at)
order by date_trunc('week', r.created_at) asc
      `.trim(),
      params: [
        "11111111-1111-1111-1111-111111111111",
        last7DaysIso,
        nowIso,
      ] as const,
      notes: [
        "Short-window review time series to check fresher dashboard ranges and bucketed grouping cost.",
      ],
    },
  ];
}

export async function runExplainPlans(
  options: RunExplainOptions,
): Promise<ExplainScenarioResult[]> {
  const target = assertSafeLocalScratchDatabaseUrl(options.databaseUrl);
  const statementTimeoutMs =
    options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;
  const scenarios = [...(options.scenarios ?? getCatalogHarnessScenarios())];
  const client = new Client({ connectionString: target.normalizedUrl });

  try {
    await client.connect();

    const results: ExplainScenarioResult[] = [];

    for (const scenario of scenarios) {
      await client.query("BEGIN READ ONLY");
      try {
        await client.query(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`);
        const explainSql = `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON) ${scenario.sql}`;
        const explainResult = await client.query(explainSql, [...scenario.params]);
        const rawPlan = normalizeExplainJson(explainResult.rows);
        results.push({
          key: scenario.key,
          label: scenario.label,
          planningTimeMs: readNumber(rawPlan?.["Planning Time"]),
          executionTimeMs: readNumber(rawPlan?.["Execution Time"]),
          planRows: readNumber(rawPlan?.Plan?.["Plan Rows"]),
          rootNodeType:
            typeof rawPlan?.Plan?.["Node Type"] === "string"
              ? rawPlan.Plan["Node Type"]
              : null,
          rawPlan,
        });
      } finally {
        await client.query("ROLLBACK");
      }
    }

    return results;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function formatScenarioCatalog(
  scenarios = getCatalogHarnessScenarios(),
): string {
  return scenarios
    .map((scenario) => {
      const notes = scenario.notes.map((note) => `  - ${note}`).join("\n");
      const params = JSON.stringify(scenario.params, null, 2)
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");
      return [
        `${scenario.key} (${scenario.category})`,
        `  label: ${scenario.label}`,
        `  source: ${scenario.source}`,
        `  params:`,
        params,
        notes,
      ].join("\n");
    })
    .join("\n\n");
}

export function formatExplainSummary(
  results: readonly ExplainScenarioResult[],
): string {
  return results
    .map((result) =>
      [
        `${result.key}`,
        `  node: ${result.rootNodeType ?? "unknown"}`,
        `  plan_rows: ${result.planRows ?? "unknown"}`,
        `  planning_ms: ${result.planningTimeMs ?? "unknown"}`,
        `  execution_ms: ${result.executionTimeMs ?? "unknown"}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function normalizeExplainJson(rows: unknown[]): ExplainJsonEnvelope | null {
  const firstRow = rows[0] as Record<string, unknown> | undefined;
  const rawPlan = firstRow?.["QUERY PLAN"];
  if (!Array.isArray(rawPlan)) return null;
  const firstEntry = rawPlan[0];
  if (firstEntry && typeof firstEntry === "object") {
    return firstEntry as ExplainJsonEnvelope;
  }
  return null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
