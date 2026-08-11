export type LoadScenarioName =
  | "catalog"
  | "saved_searches"
  | "messages"
  | "buyer_orders"
  | "seller_orders";

export interface LoadScenario {
  name: LoadScenarioName;
  path: string;
  weight: number;
  cookie?: string;
}

export interface LoadSample {
  scenario: LoadScenarioName;
  durationMs: number;
  status: number;
  ok: boolean;
  error?: string;
}

export function assertSafeLoadTestTarget(
  rawUrl: string,
  confirmedOrigin: string | undefined,
): URL {
  const target = new URL(rawUrl);
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error("Load-test target must use HTTP or HTTPS");
  }
  const hostname = target.hostname.toLowerCase();
  const looksNonProduction =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.includes("staging") ||
    hostname.includes("preview") ||
    hostname.includes("sandbox");
  if (!looksNonProduction) {
    throw new Error(
      "Refusing load test: target hostname must explicitly identify localhost, staging, preview, or sandbox",
    );
  }
  if (confirmedOrigin !== target.origin) {
    throw new Error(
      `Set LOAD_TEST_CONFIRM_TARGET exactly to ${target.origin} before running`,
    );
  }
  return target;
}

export function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(quantile * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

export function selectWeightedScenario(
  scenarios: readonly LoadScenario[],
  randomValue: number,
): LoadScenario {
  const totalWeight = scenarios.reduce(
    (total, scenario) => total + scenario.weight,
    0,
  );
  if (totalWeight <= 0) throw new Error("At least one positive scenario weight is required");
  let cursor = Math.min(Math.max(randomValue, 0), 0.999999) * totalWeight;
  for (const scenario of scenarios) {
    cursor -= scenario.weight;
    if (cursor < 0) return scenario;
  }
  return scenarios[scenarios.length - 1]!;
}

export function summarizeLoadSamples(samples: readonly LoadSample[]) {
  const durations = samples.map((sample) => sample.durationMs);
  const failures = samples.filter((sample) => !sample.ok);
  const byScenario = Object.fromEntries(
    ([
      "catalog",
      "saved_searches",
      "messages",
      "buyer_orders",
      "seller_orders",
    ] as const).map((name) => {
      const scoped = samples.filter((sample) => sample.scenario === name);
      const scopedDurations = scoped.map((sample) => sample.durationMs);
      return [
        name,
        {
          requests: scoped.length,
          failures: scoped.filter((sample) => !sample.ok).length,
          p95Ms: percentile(scopedDurations, 0.95),
        },
      ];
    }),
  );

  return {
    requests: samples.length,
    failures: failures.length,
    errorRate: samples.length === 0 ? 1 : failures.length / samples.length,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
    byScenario,
  };
}

export async function runStagingLoadTest(params: {
  target: URL;
  scenarios: readonly LoadScenario[];
  concurrency: number;
  durationMs: number;
  requestTimeoutMs: number;
}): Promise<LoadSample[]> {
  const deadline = Date.now() + params.durationMs;
  const samples: LoadSample[] = [];

  async function worker(workerId: number) {
    let requestNumber = 0;
    while (Date.now() < deadline) {
      requestNumber += 1;
      const scenario = selectWeightedScenario(params.scenarios, Math.random());
      const startedAt = performance.now();
      try {
        const response = await fetch(new URL(scenario.path, params.target), {
          method: "GET",
          redirect: "manual",
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": "PlankMarket-Staging-Load-Test/1.0",
            "X-Load-Test-Request": `${workerId}-${requestNumber}`,
            ...(scenario.cookie ? { Cookie: scenario.cookie } : {}),
          },
          signal: AbortSignal.timeout(params.requestTimeoutMs),
        });
        await response.arrayBuffer();
        samples.push({
          scenario: scenario.name,
          durationMs: performance.now() - startedAt,
          status: response.status,
          ok: response.status >= 200 && response.status < 400,
        });
      } catch (error) {
        samples.push({
          scenario: scenario.name,
          durationMs: performance.now() - startedAt,
          status: 0,
          ok: false,
          error: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: params.concurrency }, (_, index) => worker(index + 1)),
  );
  return samples;
}
