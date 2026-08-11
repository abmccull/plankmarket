import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { GET } = await import("../route");

describe("GET /api/health", () => {
  const request = new Request("https://www.plankmarket.com/api/health", {
    headers: { "x-request-id": "health-test-req-1234" },
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("returns cheap public liveness without database or deploy metadata", async () => {
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("health-test-req-1234");
    expect(response.headers.get("server-timing")).toBeTruthy();
    expect(body).toMatchObject({
      status: "ok",
      checks: { app: "ok" },
    });
    expect(body).not.toHaveProperty("meta");
  });
});
