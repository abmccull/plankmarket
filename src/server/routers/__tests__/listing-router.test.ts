import { beforeEach, describe, expect, it, vi } from "vitest";

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
  redis: {},
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
    const txInsert = vi.fn();
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
    expect(txInsert).not.toHaveBeenCalled();
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
