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

const redisGetMock = vi.fn();
const redisGetdelMock = vi.fn();
const redisEvalMock = vi.fn();

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
    get: redisGetMock,
    getdel: redisGetdelMock,
    eval: redisEvalMock,
  },
}));

vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: vi.fn(),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn(),
  },
}));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { offerRouter } = await import("@/server/routers/offer");
const { orderRouter } = await import("@/server/routers/order");

const router = createTRPCRouter({
  offer: offerRouter,
  order: orderRouter,
});
const createCaller = createCallerFactory(router);

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const LISTING_ID = "33333333-3333-4333-8333-333333333333";
const OFFER_ID = "44444444-4444-4444-8444-444444444444";

function createCallerContext(overrides: Record<string, unknown> = {}) {
  return {
    db: overrides.db,
    authUser: { id: "auth-1" },
    user: {
      id: BUYER_ID,
      role: "buyer" as const,
      active: true,
      verificationStatus: "verified",
      businessName: "Buyer Co",
      name: "Buyer User",
      businessState: "CO",
    },
    supabase: {},
    clientIp: "127.0.0.1",
    ...overrides,
  } as Parameters<typeof createCaller>[0];
}

function createActiveListing(overrides: Record<string, unknown> = {}) {
  return {
    id: LISTING_ID,
    sellerId: SELLER_ID,
    status: "active",
    title: "White Oak Closeout",
    allowOffers: true,
    totalSqFt: 1_200,
    askPricePerSqFt: 2.49,
    buyNowPrice: 2.49,
    fullLotOnly: false,
    partialQuantityMarkupPercent: null,
    moq: null,
    moqUnit: "sqft" as const,
    sqFtPerBox: 20,
    boxesPerPallet: 30,
    territoryMode: "unrestricted" as const,
    allowedDestinationStates: [],
    confirmationDueAt: new Date("2026-08-15T12:00:00.000Z"),
    lastConfirmedAt: new Date("2026-07-29T12:00:00.000Z"),
    ...overrides,
  };
}

function createPendingOrderCountSelect() {
  return {
    from: () => ({
      where: vi.fn().mockResolvedValue([{ count: 0 }]),
    }),
  };
}

describe("offer MOQ enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects direct offers below the listing minimum order quantity", async () => {
    const db = {
      query: {
        listings: {
          findFirst: vi.fn().mockResolvedValue(
            createActiveListing({ moq: 500 }),
          ),
        },
        offers: {
          findFirst: vi.fn(),
        },
      },
      transaction: vi.fn(),
    };

    const caller = createCaller(createCallerContext({ db }));

    await expect(
      caller.offer.createOffer({
        listingId: LISTING_ID,
        offerPricePerSqFt: 2.1,
        quantitySqFt: 499.98,
        message: "Can close this week.",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Minimum order quantity is 500 sq ft",
    });

    expect(db.query.offers.findFirst).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rechecks MOQ on accepted-offer checkout before quote consumption", async () => {
    const offer = {
      id: OFFER_ID,
      buyerId: BUYER_ID,
      sellerId: SELLER_ID,
      listingId: LISTING_ID,
      quantitySqFt: 150,
      offerPricePerSqFt: 2.15,
      counterPricePerSqFt: null,
      status: "accepted",
      orderId: null,
      expiresAt: null,
    };
    const tx = {
      execute: vi.fn(),
      select: vi
        .fn()
        .mockImplementationOnce(() => createPendingOrderCountSelect())
        .mockImplementationOnce(() => ({
          from: () => ({
            where: () => ({
              for: vi.fn().mockResolvedValue([offer]),
            }),
          }),
        }))
        .mockImplementationOnce(() => ({
          from: () => ({
            where: () => ({
              for: vi.fn().mockResolvedValue([
                createActiveListing({
                  moq: 200,
                }),
              ]),
            }),
          }),
        })),
    };
    const db = {
      transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    const caller = createCaller(createCallerContext({ db }));

    await expect(
      caller.order.createFromOffer({
        offerId: OFFER_ID,
        shippingName: "Buyer Name",
        shippingAddress: "123 Main St",
        shippingCity: "Denver",
        shippingState: "CO",
        shippingZip: "80202",
        selectedQuoteToken: "quote-token-moq-race",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Minimum order quantity is 200 sq ft",
    });

    expect(redisGetMock).not.toHaveBeenCalled();
    expect(redisEvalMock).not.toHaveBeenCalled();
    expect(redisGetdelMock).not.toHaveBeenCalled();
  });
});
