import { describe, expect, it } from "vitest";
import {
  assertSafeLoadTestTarget,
  percentile,
  selectWeightedScenario,
  summarizeLoadSamples,
} from "../staging-load-test";

describe("staging load-test safety and metrics", () => {
  it("requires an explicitly non-production and confirmed origin", () => {
    expect(() =>
      assertSafeLoadTestTarget(
        "https://www.plankmarket.com",
        "https://www.plankmarket.com",
      ),
    ).toThrow("Refusing load test");
    expect(() =>
      assertSafeLoadTestTarget(
        "https://staging.plankmarket.com",
        undefined,
      ),
    ).toThrow("LOAD_TEST_CONFIRM_TARGET");
    expect(
      assertSafeLoadTestTarget(
        "https://staging.plankmarket.com",
        "https://staging.plankmarket.com",
      ).origin,
    ).toBe("https://staging.plankmarket.com");
  });

  it("calculates nearest-rank percentiles and scenario summaries", () => {
    expect(percentile([10, 20, 30, 40], 0.95)).toBe(40);
    expect(
      summarizeLoadSamples([
        { scenario: "catalog", durationMs: 20, status: 200, ok: true },
        { scenario: "catalog", durationMs: 40, status: 500, ok: false },
      ]),
    ).toMatchObject({ requests: 2, failures: 1, errorRate: 0.5, p95Ms: 40 });
  });

  it("selects scenarios according to cumulative weights", () => {
    const scenarios = [
      { name: "catalog" as const, path: "/listings", weight: 3 },
      { name: "messages" as const, path: "/messages", weight: 1 },
    ];
    expect(selectWeightedScenario(scenarios, 0.1).name).toBe("catalog");
    expect(selectWeightedScenario(scenarios, 0.9).name).toBe("messages");
  });
});
