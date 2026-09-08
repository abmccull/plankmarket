import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/redis/client", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import { buildPublicReadCacheKey, readPublicReadCache, writePublicReadCache } from "@/server/services/public-read-cache";
import { redis } from "@/lib/redis/client";
import superjson from "superjson";

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

describe("public read cache round trips", () => {
  it.each([true, false])("restores typed dates with automatic JSON decoding = %s", async (autoDecode) => {
    const value = { items: [{ publishedAt: new Date("2026-09-08T12:00:00Z") }] };
    await writePublicReadCache("public-test", value, 20);
    expect(redis.set).toHaveBeenLastCalledWith("public-test", superjson.stringify(value), { ex: 20 });
    const stored = superjson.stringify(value);
    vi.mocked(redis.get).mockResolvedValueOnce(autoDecode ? JSON.parse(stored) : stored);
    expect(await readPublicReadCache("public-test")).toEqual(value);
  });

  it("falls back to the database when a cache entry is malformed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      vi.mocked(redis.get).mockResolvedValueOnce("invalid-json");
      expect(await readPublicReadCache("public-test")).toBeNull();
      expect(log).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });
});
