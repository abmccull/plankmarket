import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    execute: mocks.execute,
  },
}));

const { GET } = await import("../route");
const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    consoleError.mockRestore();
  });

  it("returns healthy only when the complete schema contract passes", async () => {
    mocks.execute.mockResolvedValue([
      {
        schemaReady: true,
        missingArtifactCount: 0,
        missingArtifacts: [],
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      checks: { database: "ok", schema: "ok" },
    });
  });

  it("distinguishes a reachable database from an incomplete schema", async () => {
    mocks.execute.mockResolvedValue([
      {
        schemaReady: false,
        missingArtifactCount: 2,
        missingArtifacts: ["column:orders.tax_amount"],
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unhealthy",
      checks: { database: "ok", schema: "not_ready" },
    });
  });

  it("fails closed when the database readiness query cannot run", async () => {
    mocks.execute.mockRejectedValue(new Error("database unavailable"));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unhealthy",
      checks: { database: "unavailable", schema: "unavailable" },
    });
  });
});
