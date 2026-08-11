import process from "node:process";
import {
  assertSafeLoadTestTarget,
  runStagingLoadTest,
  summarizeLoadSamples,
  type LoadScenario,
} from "../src/server/perf/staging-load-test";

function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

async function main() {
  const target = assertSafeLoadTestTarget(
    process.env.LOAD_TEST_BASE_URL ?? "",
    process.env.LOAD_TEST_CONFIRM_TARGET,
  );
  const buyerCookie = process.env.LOAD_TEST_BUYER_COOKIE;
  const sellerCookie = process.env.LOAD_TEST_SELLER_COOKIE;
  if (!buyerCookie || !sellerCookie) {
    throw new Error(
      "LOAD_TEST_BUYER_COOKIE and LOAD_TEST_SELLER_COOKIE are required for authenticated workload coverage",
    );
  }

  const scenarios: LoadScenario[] = [
    { name: "catalog", path: "/listings?sort=date_newest&page=1", weight: 20 },
    { name: "catalog", path: "/listings?query=oak&sort=price_asc&page=1", weight: 15 },
    { name: "catalog", path: "/listings?materialType=vinyl_lvp&page=2", weight: 10 },
    { name: "saved_searches", path: "/buyer/saved-searches", weight: 15, cookie: buyerCookie },
    { name: "messages", path: "/messages", weight: 15, cookie: buyerCookie },
    { name: "buyer_orders", path: "/buyer/orders", weight: 15, cookie: buyerCookie },
    { name: "seller_orders", path: "/seller/orders", weight: 10, cookie: sellerCookie },
  ];
  const concurrency = boundedInteger(
    process.env.LOAD_TEST_CONCURRENCY,
    10,
    1,
    100,
  );
  const durationSeconds = boundedInteger(
    process.env.LOAD_TEST_DURATION_SECONDS,
    60,
    10,
    900,
  );
  const requestTimeoutMs = boundedInteger(
    process.env.LOAD_TEST_REQUEST_TIMEOUT_MS,
    10_000,
    1_000,
    60_000,
  );

  const samples = await runStagingLoadTest({
    target,
    scenarios,
    concurrency,
    durationMs: durationSeconds * 1_000,
    requestTimeoutMs,
  });
  const summary = summarizeLoadSamples(samples);
  console.log(JSON.stringify({ target: target.origin, concurrency, durationSeconds, ...summary }, null, 2));

  const maxErrorRate = Number(process.env.LOAD_TEST_MAX_ERROR_RATE ?? "0.02");
  const maxP95Ms = Number(process.env.LOAD_TEST_MAX_P95_MS ?? "2000");
  if (summary.errorRate > maxErrorRate || summary.p95Ms > maxP95Ms) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Staging load test failed");
  process.exitCode = 1;
});
