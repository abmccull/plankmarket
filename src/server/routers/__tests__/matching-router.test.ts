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

const COMPLETE_BUYER_PREFERENCES = {
  preferredZip: "84101", preferredRadiusMiles: 100,
  preferredMaterialTypes: ["engineered"], priceMaxPerSqFt: 5,
  preferredShippingMode: "both", urgency: "2_weeks",
};

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
      userPreferences: { findFirst: vi.fn().mockResolvedValue({ ...COMPLETE_BUYER_PREFERENCES, profileComplete: true, waterproofRequired: true }) },
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
        ...COMPLETE_BUYER_PREFERENCES, profileComplete: true, waterproofRequired: false, preferredZip: "84101",
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
        ...COMPLETE_BUYER_PREFERENCES, profileComplete: true, preferredZip: "00000", preferredRadiusMiles: 100,
      }) }, listings: { findMany },
    } };
    const caller = createCaller(createCallerContext({ db }));
    expect(await caller.matching.recommendedListings()).toEqual({
      items: [], prefsIncomplete: false, limitation: "location_unverified",
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("matching derives completion for each preference context", () => {
  const OWNER = "11111111-1111-4111-8111-111111111111";
  const COMPLETE_SELLER = {
    originZip: "84101", shipCapable: true, typicalMaterialTypes: ["hardwood"],
    minLotSqFt: 400, preferredBuyerRadiusMiles: 250, pricingStyle: "fixed", leadTimeDaysMin: 0,
  };

  function fixture(preferences: Record<string, unknown>) {
    const listings = vi.fn().mockResolvedValue([]);
    const requests = vi.fn().mockResolvedValue([]);
    const findPreferences = vi.fn().mockResolvedValue({ userId: OWNER, role: "seller", ...preferences });
    const db = { query: { userPreferences: { findFirst: findPreferences }, listings: { findMany: listings }, buyerRequests: { findMany: requests } } };
    const caller = createCaller(createCallerContext({
      db,
      user: { id: OWNER, role: "seller", active: true, verificationStatus: "verified", businessState: "CO" },
      getAuthAssurance: vi.fn().mockRejectedValue(new Error("Buying preferences do not require payout MFA")),
    }));
    return { caller, listings, requests, findPreferences };
  }

  it("recommends buying inventory from filled fields despite a false legacy seller flag", async () => {
    const f = fixture({ ...COMPLETE_BUYER_PREFERENCES, profileComplete: false });
    expect(await f.caller.matching.recommendedListings()).toEqual({ items: [], prefsIncomplete: false });
    expect(await f.caller.matching.recommendedRequests()).toEqual({ items: [], prefsIncomplete: true });
    expect(f.listings).toHaveBeenCalledOnce();
    expect(f.requests).not.toHaveBeenCalled();
  });

  it("does not use complete selling preferences as a buying match configuration", async () => {
    const f = fixture({ ...COMPLETE_SELLER, preferredRadiusMiles: 100, profileComplete: true });
    expect(await f.caller.matching.recommendedListings()).toEqual({ items: [], prefsIncomplete: true });
    expect(await f.caller.matching.recommendedRequests()).toEqual({ items: [], prefsIncomplete: false });
    expect(f.listings).not.toHaveBeenCalled();
    expect(f.requests).toHaveBeenCalledOnce();
  });

  it("keeps both directions available when both field groups are filled, independent of stored role", async () => {
    const f = fixture({ ...COMPLETE_BUYER_PREFERENCES, ...COMPLETE_SELLER, role: "buyer", profileComplete: false });
    expect(await f.caller.matching.recommendedListings()).toEqual({ items: [], prefsIncomplete: false });
    expect(await f.caller.matching.recommendedRequests()).toEqual({ items: [], prefsIncomplete: false });
    expect(f.listings).toHaveBeenCalledOnce();
    expect(f.requests).toHaveBeenCalledOnce();
    const { PgDialect } = await import("drizzle-orm/pg-core");
    for (const [input] of f.findPreferences.mock.calls) {
      const query = new PgDialect().sqlToQuery(input.where);
      expect(query.sql).toContain('"user_preferences"."user_id"');
      expect(query.params).toEqual([OWNER]);
    }
  });

  it("does not query either inventory direction for an analytics-only row", async () => {
    const f = fixture({ analyticsTrackingEnabled: true, preferredRadiusMiles: 100, shipCapable: false, profileComplete: true });
    expect(await f.caller.matching.recommendedListings()).toEqual({ items: [], prefsIncomplete: true });
    expect(await f.caller.matching.recommendedRequests()).toEqual({ items: [], prefsIncomplete: true });
    expect(f.listings).not.toHaveBeenCalled();
    expect(f.requests).not.toHaveBeenCalled();
  });
});
