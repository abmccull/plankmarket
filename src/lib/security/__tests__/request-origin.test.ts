import { afterEach, describe, expect, it, vi } from "vitest";
import { isSameOriginWrite } from "../request-origin";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isSameOriginWrite", () => {
  it("allows read-only requests without an Origin header", () => {
    expect(isSameOriginWrite(new Request("https://market.test/api", { method: "GET" }))).toBe(true);
  });

  it("allows same-origin HTTPS writes in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = new Request("https://market.test/api", {
      method: "POST",
      headers: { origin: "https://market.test", host: "market.test" },
    });

    expect(isSameOriginWrite(request)).toBe(true);
  });

  it("uses the first trusted forwarded host", () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = new Request("https://internal/api", {
      method: "POST",
      headers: {
        origin: "https://market.test",
        host: "internal",
        "x-forwarded-host": "market.test, proxy.internal",
      },
    });

    expect(isSameOriginWrite(request)).toBe(true);
  });

  it("rejects cross-origin, insecure, malformed, and missing origins in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const makeRequest = (origin?: string) =>
      new Request("https://market.test/api", {
        method: "POST",
        headers: {
          host: "market.test",
          ...(origin ? { origin } : {}),
        },
      });

    expect(isSameOriginWrite(makeRequest("https://evil.test"))).toBe(false);
    expect(isSameOriginWrite(makeRequest("http://market.test"))).toBe(false);
    expect(isSameOriginWrite(makeRequest("not a url"))).toBe(false);
    expect(isSameOriginWrite(makeRequest())).toBe(false);
  });
});
