import { describe, expect, it } from "vitest";

import {
  DATABASE_CONNECT_TIMEOUT_SECONDS,
  DATABASE_STATEMENT_TIMEOUT_MS,
  DEFAULT_DEPLOYED_DATABASE_POOL_MAX,
  DEFAULT_LOCAL_DATABASE_POOL_MAX,
  resolveDatabasePoolMax,
} from "@/server/db/connection-config";

describe("database request bounds", () => {
  it("fails unavailable or stalled application queries within a visible recovery window", () => {
    expect(DATABASE_CONNECT_TIMEOUT_SECONDS).toBeGreaterThan(0);
    expect(DATABASE_CONNECT_TIMEOUT_SECONDS).toBeLessThanOrEqual(10);
    expect(DATABASE_STATEMENT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(DATABASE_STATEMENT_TIMEOUT_MS).toBeLessThanOrEqual(20_000);
  });
});

describe("resolveDatabasePoolMax", () => {
  it("keeps the configured value when explicitly provided", () => {
    expect(resolveDatabasePoolMax(3, "production")).toBe(3);
  });

  it("defaults to a conservative deployed pool size outside local envs", () => {
    expect(resolveDatabasePoolMax(undefined, "production")).toBe(
      DEFAULT_DEPLOYED_DATABASE_POOL_MAX,
    );
  });

  it("allows a slightly larger default pool only for local development and test", () => {
    expect(resolveDatabasePoolMax(undefined, "development")).toBe(
      DEFAULT_LOCAL_DATABASE_POOL_MAX,
    );
    expect(resolveDatabasePoolMax(undefined, "test")).toBe(
      DEFAULT_LOCAL_DATABASE_POOL_MAX,
    );
  });
});
