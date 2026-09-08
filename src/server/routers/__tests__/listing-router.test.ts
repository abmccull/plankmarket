import { beforeEach, describe, expect, it, vi } from "vitest";

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
const { listingRouter } = await import("@/server/routers/listing");
const { PgDialect } = await import("drizzle-orm/pg-core");

const router = createTRPCRouter({
  listing: listingRouter,
});

const createCaller = createCallerFactory(router);

function createCallerContext(overrides: Record<string, unknown> = {}) {
  return {
    db: overrides.db,
    authUser: { id: "auth-seller-1" },
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      role: "seller" as const,
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

describe("listingRouter seller default revalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects create when saved defaults make the listing selling rules contradictory", async () => {
    const insert = vi.fn();
    const db = {
      query: {
        userPreferences: {
          findFirst: vi.fn().mockResolvedValue({
            partialQuantityMarkupPercent: 20,
          }),
        },
      },
      insert,
    };

    const caller = createCaller(createCallerContext({ db }));

    await expect(
      caller.listing.create({
        title: "Verified engineered oak closeout lot",
        materialType: "engineered",
        totalSqFt: 2000,
        totalPallets: 10,
        moq: 500,
        moqUnit: "sqft",
        palletWeight: 1200,
        palletLength: 48,
        palletWidth: 40,
        palletHeight: 60,
        locationZip: "75001",
        askPricePerSqFt: 2.49,
        allowOffers: true,
        condition: "closeout",
        fullLotOnly: true,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("partialQuantityMarkupPercent"),
    });

    expect(db.query.userPreferences.findFirst).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects bulkCreate when saved defaults make a CSV row contradictory after merge", async () => {
    const txInsert = vi.fn(() => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [{ id: "import-claim" }] }) }) }));
    const db = {
      query: {
        userPreferences: {
          findFirst: vi.fn().mockResolvedValue({
            partialQuantityMarkupPercent: 20,
          }),
        },
      },
      transaction: vi.fn(async (callback: (tx: { insert: typeof txInsert }) => unknown) =>
        callback({
          insert: txInsert,
        }),
      ),
    };

    const caller = createCaller(createCallerContext({ db }));

    await expect(
      caller.listing.bulkCreate({
        requestId: "44444444-4444-4444-8444-444444444444",
        rows: [
          {
            title: "CSV engineered white oak lot",
            materialType: "engineered",
            totalSqFt: 1800,
            askPricePerSqFt: 2.15,
            condition: "closeout",
            totalPallets: 9,
            moq: 450,
            moqUnit: "sqft",
            locationZip: "75001",
            palletWeight: 1100,
            palletLength: 48,
            palletWidth: 40,
            palletHeight: 58,
            fullLotOnly: true,
            partialQuantityMarkupPercent: null,
            automaticMarkdownEnabled: false,
            automaticMarkdownFloorPercent: null,
            automaticMarkdownIntervalDays: null,
            allowSampleRequests: false,
            territoryMode: "unrestricted",
            allowedDestinationStates: null,
            freightPaymentMode: "buyer_pays",
            sellerFreightStates: null,
            freightDropCharge: null,
            pricingRulesVersion: 1,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("partialQuantityMarkupPercent"),
    });

    expect(db.query.userPreferences.findFirst).toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalled();
    expect(txInsert).toHaveBeenCalledTimes(1);
  });

  it("rejects quantity edits while an order has an active inventory reservation", async () => {
    const select = vi
      .fn()
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn().mockResolvedValue([
              {
                id: "22222222-2222-4222-8222-222222222222",
                sellerId: "11111111-1111-4111-8111-111111111111",
                totalSqFt: 1_250,
              },
            ]),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              { id: "33333333-3333-4333-8333-333333333333" },
            ]),
          })),
        })),
      }));
    const tx = { select };
    const db = {
      transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    const caller = createCaller(createCallerContext({ db }));

    await expect(
      caller.listing.update({
        id: "22222222-2222-4222-8222-222222222222",
        data: { totalSqFt: 1_500 },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining(
        "cannot be changed while an order is reserving",
      ),
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledTimes(2);
  });
});


describe("listing discovery accuracy", () => {
  function browseDb() {
    const findMany = vi.fn().mockResolvedValue([]);
    const builder = {
      from: vi.fn(), where: vi.fn(), limit: vi.fn(), as: vi.fn(),
      then: (resolve: (rows: { count: number }[]) => unknown) =>
        Promise.resolve([{ count: 0 }]).then(resolve),
    };
    for (const method of [builder.from, builder.where, builder.limit, builder.as]) {
      method.mockReturnValue(builder);
    }
    return { query: { listings: { findMany } }, select: vi.fn(() => builder) };
  }

  it("matches search words independently and includes manufacturer model numbers", async () => {
    const db = browseDb();
    const caller = createCaller(createCallerContext({ db }));
    await caller.listing.list({ query: "Oak ABC-100" });
    const query = new PgDialect().sqlToQuery(db.query.listings.findMany.mock.calls[0][0].where);
    expect(query.sql).toContain('"model_number"');
    expect(query.params).toContain("%oak%");
    expect(query.params).toContain("%abc-100%");
    expect(query.params).not.toContain("%oak abc-100%");
  });

  it("sorts by distance with a ZIP and no radius, before promoted placement", async () => {
    const db = browseDb();
    const caller = createCaller(createCallerContext({ db }));
    const result = await caller.listing.list({ buyerZip: "84101", sort: "proximity" });
    const query = db.query.listings.findMany.mock.calls[0][0];
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(query.orderBy[0]).sql).toContain("acos");
    expect(dialect.sqlToQuery(query.orderBy[0]).sql).toContain("then null");
    expect(dialect.sqlToQuery(query.where).sql).not.toContain("acos");
    expect(result.locationLabel).toContain("UT");
  });

  it("applies a radius only when requested and reports unknown ZIPs", async () => {
    const db = browseDb();
    const caller = createCaller(createCallerContext({ db }));
    await caller.listing.list({ buyerZip: "84101", maxDistance: 100, sort: "proximity" });
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(db.query.listings.findMany.mock.calls[0][0].where).sql).toContain("acos");
    const result = await caller.listing.list({ buyerZip: "00000", sort: "proximity" });
    expect(result.locationLabel).toBeNull();
  });

  it("keeps 6mm separate from 7/8mm and includes widths above nine inches", async () => {
    const db = browseDb();
    const caller = createCaller(createCallerContext({ db }));
    await caller.listing.list({ thickness: [0.24], width: [9] });
    const query = new PgDialect().sqlToQuery(db.query.listings.findMany.mock.calls[0][0].where);
    expect(query.params).toContain(0.235);
    expect(query.params).toContain(0.245);
    expect(query.params).toContain(9);
    expect(query.sql).toContain('"listings"."width" >=');
    expect(query.sql).not.toContain('"listings"."width" <=');
  });

  it.each([
    ["84101", true],
    ["00000", false],
  ])("replaces stale coordinates on a ZIP edit to %s", async (locationZip, known) => {
    const existing = {
      id: "22222222-2222-4222-8222-222222222222",
      sellerId: "11111111-1111-4111-8111-111111111111",
      totalSqFt: 1250, locationZip: "75001", locationLat: 32.96, locationLng: -96.84,
      status: "draft", freightClass: "125",
    };
    const updated = { ...existing, locationZip };
    const set = vi.fn((values: Record<string, unknown>) => ({ where: () => ({ returning: async () => [{ ...updated, ...values }] }) }));
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ for: async () => [existing], then: (resolve: (rows: { count: number }[]) => unknown) => Promise.resolve([{ count: 0 }]).then(resolve) }) }) }),
      update: () => ({ set }),
    };
    const db = {
      transaction: (callback: (transaction: typeof tx) => unknown) => callback(tx),
      select: () => ({ from: () => ({ where: async () => [{ count: 0 }] }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [updated] }) }) }),
    };
    const caller = createCaller(createCallerContext({ db }));
    await caller.listing.update({ id: existing.id, data: { locationZip } });
    const persisted = set.mock.calls[0][0] as unknown as { locationLat: number | null; locationLng: number | null };
    if (known) {
      expect(persisted.locationLat).toBeGreaterThan(40);
      expect(persisted.locationLng).toBeLessThan(-111);
    } else {
      expect(persisted.locationLat).toBeNull();
      expect(persisted.locationLng).toBeNull();
    }
  });
});


describe("CSV import replay", () => {
  const requestId = "55555555-5555-4555-8555-555555555555";
  const row = { title: "Oak stock", materialType: "hardwood", totalSqFt: 1000, askPricePerSqFt: 2, condition: "new_overstock", totalPallets: 1, moq: 100, moqUnit: "sqft", locationZip: "80202", palletWeight: 1000, palletLength: 48, palletWidth: 40, palletHeight: 40 };
  async function replayDb(mismatch = false) {
    const { csvListingRowSchema } = await import("@/lib/validators/listing");
    const { createHash } = await import("node:crypto");
    const response = { batchId: requestId, listings: [], count: 0 };
    const fingerprint = createHash("sha256").update(JSON.stringify([csvListingRowSchema.parse(row)])).digest("hex");
    const tx = {
      insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })) })),
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ for: vi.fn().mockResolvedValue([{ fingerprint: mismatch ? "changed" : fingerprint, response }]) })) })) })),
      update: vi.fn(),
    };
    return { db: { query: { userPreferences: { findFirst: vi.fn().mockResolvedValue(null) } }, transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) }, tx, response };
  }
  it("returns the original result after a lost response without creating new listings", async () => {
    const { db, tx, response } = await replayDb();
    expect(await createCaller(createCallerContext({ db })).listing.bulkCreate({ requestId, rows: [row] })).toEqual(response);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(tx.update).not.toHaveBeenCalled();
  });
  it("rejects reuse of a request identity for changed content", async () => {
    const { db, tx } = await replayDb(true);
    await expect(createCaller(createCallerContext({ db })).listing.bulkCreate({ requestId, rows: [row] })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(tx.update).not.toHaveBeenCalled();
  });
});
