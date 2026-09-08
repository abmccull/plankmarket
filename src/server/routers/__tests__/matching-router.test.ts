import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

process.env.SKIP_ENV_VALIDATION = "1";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/plankmarket_test";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";
process.env.STRIPE_SECRET_KEY ??= "sk_test_123";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test_123";
process.env.UPLOADTHING_TOKEN ??= "uploadthing-test";
process.env.UPSTASH_REDIS_REST_URL ??= "https://example.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN ??= "upstash-token";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= "pk_test_123";

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    async limit() {
      return { success: true };
    }
  },
}));

vi.mock("@/lib/redis/client", () => ({
  getRedisClient: () => ({}),
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
  },
}));

vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: vi.fn(),
}));

vi.mock("@/server/services/priority1", () => ({
  priority1: {
    getSuggestedClass: vi.fn(),
  },
}));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { matchingRouter } = await import("@/server/routers/matching");


const router = createTRPCRouter({
  matching: matchingRouter,
});

const createCaller = createCallerFactory(router);

function createCallerContext(overrides: Record<string, unknown> = {}) {
  return {
    db: overrides.db,
    authUser: { id: "auth-seller-1" },
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      role: "buyer" as const,
      active: true,
      verificationStatus: "verified",
      businessName: "Seller Co",
      name: "Seller User",
      proStatus: "active",
      proExpiresAt: null,
    },
    supabase: {},
    clientIp: "127.0.0.1",
    ...overrides,
  } as Parameters<typeof createCaller>[0];
}

describe("matching waterproof requirements", () => {
  it("does not recommend any lot without a supported waterproof specification", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { query: {
      userPreferences: { findFirst: vi.fn().mockResolvedValue({ profileComplete: true, waterproofRequired: true }) },
      listings: { findMany },
    } };
    const caller = createCaller(createCallerContext({ db }));
    expect(await caller.matching.recommendedListings()).toEqual({
      items: [], prefsIncomplete: false,
    });
    expect(findMany).toHaveBeenCalled();
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const serialized = new PgDialect().sqlToQuery(findMany.mock.calls[0][0].where).sql;
    expect(serialized).toContain("waterproof");
    expect(serialized).toContain("evidence_reviewed");
  });
});


describe("matching price and geography", () => {
  it("uses the purchase price and enforces the saved radius", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { query: {
      userPreferences: { findFirst: vi.fn().mockResolvedValue({
        profileComplete: true, waterproofRequired: false, preferredZip: "84101",
        preferredRadiusMiles: 100, priceMaxPerSqFt: 3,
      }) }, listings: { findMany },
    } };
    const caller = createCaller(createCallerContext({ db }));
    await caller.matching.recommendedListings();
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const query = new PgDialect().sqlToQuery(findMany.mock.calls[0][0].where);
    expect(query.sql).toContain('"buy_now_price"');
    expect(query.sql).toContain("acos");
    expect(query.params).toContain(100);
  });

  it("does not silently ignore an unresolved preferred radius", async () => {
    const findMany = vi.fn();
    const db = { query: {
      userPreferences: { findFirst: vi.fn().mockResolvedValue({
        profileComplete: true, preferredZip: "00000", preferredRadiusMiles: 100,
      }) }, listings: { findMany },
    } };
    const caller = createCaller(createCallerContext({ db }));
    expect(await caller.matching.recommendedListings()).toEqual({
      items: [], prefsIncomplete: false, limitation: "location_unverified",
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});
