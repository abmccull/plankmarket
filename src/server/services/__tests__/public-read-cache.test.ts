import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/redis/client", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import { buildPublicReadCacheKey } from "@/server/services/public-read-cache";

describe("public read cache keys", () => {
  it("is deterministic for the same typed input", () => {
    expect(
      buildPublicReadCacheKey("catalog", {
        page: 1,
        publishedAfter: new Date("2026-07-31T12:00:00.000Z"),
      }),
    ).toBe(
      buildPublicReadCacheKey("catalog", {
        page: 1,
        publishedAfter: new Date("2026-07-31T12:00:00.000Z"),
      }),
    );
  });

  it("separates namespaces and inputs", () => {
    const catalog = buildPublicReadCacheKey("catalog", { page: 1 });
    expect(buildPublicReadCacheKey("catalog", { page: 2 })).not.toBe(catalog);
    expect(buildPublicReadCacheKey("facets", { page: 1 })).not.toBe(catalog);
  });
});
