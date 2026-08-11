import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    fetchRequestHandler: vi.fn(),
    isSameOriginWrite: vi.fn(),
    createTRPCContext: vi.fn(),
  };
});

vi.mock("@trpc/server/adapters/fetch", () => ({
  fetchRequestHandler: mocks.fetchRequestHandler,
}));

vi.mock("@/server/routers/_app", () => ({
  appRouter: {},
}));

vi.mock("@/server/trpc", () => ({
  createTRPCContext: mocks.createTRPCContext,
}));

vi.mock("@/lib/security/request-origin", () => ({
  isSameOriginWrite: mocks.isSameOriginWrite,
}));

const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

const { GET, POST } = await import("../route");

describe("/api/trpc route observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginWrite.mockReturnValue(true);
    mocks.fetchRequestHandler.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterAll(() => {
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  it("returns a request identifier when same-origin policy rejects the call", async () => {
    mocks.isSameOriginWrite.mockReturnValue(false);

    const response = await POST(
      new Request("https://www.plankmarket.com/api/trpc/listing.list", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(consoleWarn).toHaveBeenCalledWith(
      "[trpc] origin rejected",
      expect.objectContaining({
        method: "POST",
        pathname: "/api/trpc/listing.list",
      }),
    );
  });

  it("propagates the inbound request id and logs slow requests", async () => {
    const nowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_250);

    mocks.fetchRequestHandler.mockImplementation(async ({ req }) => {
      expect(req.headers.get("x-request-id")).toBe("req-inbound-12345678");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await GET(
      new Request("https://www.plankmarket.com/api/trpc/listing.list", {
        headers: { "x-request-id": "req-inbound-12345678" },
      }),
    );

    expect(response.headers.get("x-request-id")).toBe("req-inbound-12345678");
    expect(response.headers.get("server-timing")).toBe("app;dur=1250");
    expect(consoleWarn).toHaveBeenCalledWith(
      "[trpc] request slow",
      expect.objectContaining({
        requestId: "req-inbound-12345678",
        pathname: "/api/trpc/listing.list",
        durationMs: 1250,
        status: 200,
      }),
    );

    nowSpy.mockRestore();
  });

  it("logs structured failures without forwarding request identifiers to analytics", async () => {
    mocks.fetchRequestHandler.mockImplementation(async ({ onError }) => {
      onError({
        path: "listing.list",
        error: {
          code: "INTERNAL_SERVER_ERROR",
          cause: new Error("boom"),
        },
      });

      return new Response(JSON.stringify({ error: true }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("https://www.plankmarket.com/api/trpc/listing.list", {
        method: "POST",
        headers: { "x-request-id": "req-error-12345678" },
      }),
    );

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith(
      "[trpc] request failed",
      expect.objectContaining({
        requestId: "req-error-12345678",
        pathname: "/api/trpc/listing.list",
        status: 500,
        procedurePaths: ["listing.list"],
        errorCodes: ["INTERNAL_SERVER_ERROR"],
      }),
    );
  });
});
