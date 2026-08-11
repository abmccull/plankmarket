import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    execute: mocks.execute,
  },
}));

const routeModule = await import("../route");
const { GET, __resetReadinessCacheForTests } = routeModule;
const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

describe("GET /api/health/ready", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.PLANKMARKET_BUILD_SHA =
      "89abcdef0123456789abcdef0123456789abcdef";
    vi.clearAllMocks();
    __resetReadinessCacheForTests();
  });

  afterAll(() => {
    consoleError.mockRestore();
  });

  it("rejects unauthenticated readiness checks before touching the database", async () => {
    const response = await GET(
      new Request("https://www.plankmarket.com/api/health/ready"),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      status: "unauthorized",
    });
    expect(body).not.toHaveProperty("meta");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns protected schema readiness when the contract passes", async () => {
    mocks.execute.mockResolvedValue([
      {
        schemaReady: true,
        missingArtifactCount: 0,
        missingArtifacts: [],
      },
    ]);

    const response = await GET(
      new Request("https://www.plankmarket.com/api/health/ready", {
        headers: {
          authorization: `Bearer ${process.env.CRON_SECRET}`,
          "x-request-id": "ready-test-req-1234",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      checks: { database: "ok", schema: "ok" },
      meta: {
        requestId: "ready-test-req-1234",
        release: {
          buildSha: "89abcdef0123456789abcdef0123456789abcdef",
          commercialPolicyVersion: 1,
          packageVersion: "0.1.0",
          schemaVersion: "0034",
        },
        service: "plankmarket",
      },
    });
    expect(body.meta.release.fingerprint).toContain(
      "sha:89abcdef0123456789abcdef0123456789abcdef",
    );
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("caches deep readiness checks for repeated requests", async () => {
    mocks.execute.mockResolvedValue([
      {
        schemaReady: true,
        missingArtifactCount: 0,
        missingArtifacts: [],
      },
    ]);

    const first = await GET(
      new Request("https://www.plankmarket.com/api/health/ready", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    const second = await GET(
      new Request("https://www.plankmarket.com/api/health/ready", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("surfaces schema misses on the protected readiness route", async () => {
    mocks.execute.mockResolvedValue([
      {
        schemaReady: false,
        missingArtifactCount: 2,
        missingArtifacts: ["index:orders_payment_status_idx"],
      },
    ]);

    const response = await GET(
      new Request("https://www.plankmarket.com/api/health/ready", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "unhealthy",
      checks: { database: "ok", schema: "not_ready" },
      details: {
        missingArtifactCount: 2,
        missingArtifacts: ["index:orders_payment_status_idx"],
      },
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[health:ready] readiness check failed",
      expect.objectContaining({
        checks: { database: "ok", schema: "not_ready" },
      }),
    );
  });
});
