import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/plankmarket_test";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";
process.env.STRIPE_SECRET_KEY ??= "sk_test_123";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test_123";
process.env.STRIPE_TAX_MODE ??= "disabled";
process.env.STRIPE_TAX_POLICY_VERSION ??= "1";
process.env.STRIPE_TAX_LEGAL_DECISION_ACKNOWLEDGED ??= "false";
process.env.STRIPE_TAX_BUYER_FEE_TREATMENT ??= "undecided";
process.env.UPLOADTHING_TOKEN ??= "uploadthing-test";
process.env.UPSTASH_REDIS_REST_URL ??= "https://example.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN ??= "upstash-token";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= "pk_test_123";

const mocks = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisGetdel: vi.fn(),
  redisEval: vi.fn(),
  stripeAccountsRetrieve: vi.fn(),
}));

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
    get: mocks.redisGet,
    getdel: mocks.redisGetdel,
    eval: mocks.redisEval,
  },
}));
vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: vi.fn(),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    accounts: {
      retrieve: mocks.stripeAccountsRetrieve,
    },
  },
}));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { orderRouter } = await import("@/server/routers/order");

const router = createTRPCRouter({ order: orderRouter });
const createCaller = createCallerFactory(router);

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const LISTING_ID = "33333333-3333-4333-8333-333333333333";
const OFFER_ID = "44444444-4444-4444-8444-444444444444";

function createContext(db: Record<string, unknown>) {
  return {
    db,
    authUser: { id: "auth-buyer-1" },
    user: {
      id: BUYER_ID,
      role: "buyer" as const,
      active: true,
      verificationStatus: "verified",
      businessState: "CO",
      name: "Buyer User",
      businessName: "Buyer Co",
    },
    supabase: {},
    clientIp: "127.0.0.1",
  } as unknown as Parameters<typeof createCaller>[0];
}

function createActiveListing() {
  return {
    id: LISTING_ID,
    sellerId: SELLER_ID,
    status: "active",
    title: "White Oak Closeout",
    totalSqFt: 1200,
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
    confirmationDueAt: new Date("2099-08-15T12:00:00.000Z"),
    lastConfirmedAt: new Date("2099-08-01T12:00:00.000Z"),
    freightPaymentMode: "buyer_pays" as const,
    sellerFreightStates: [],
    freightDropCharge: null,
  };
}

function createPendingOrderCountSelect() {
  return {
    from: () => ({
      where: vi.fn().mockResolvedValue([{ count: 0 }]),
    }),
  };
}

function createSellerReadinessSelect() {
  return {
    from: () => ({
      where: () => ({
        for: vi.fn().mockResolvedValue([
          {
            id: SELLER_ID,
            stripeAccountId: "acct_seller_1",
            stripeOnboardingComplete: true,
          },
        ]),
      }),
    }),
  };
}

describe("order seller payout readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks buy-now reservation before consuming the shipping quote when the seller is not payout-ready", async () => {
    mocks.stripeAccountsRetrieve.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: false,
      capabilities: { transfers: "inactive" },
    });

    const tx = {
      execute: vi.fn(),
      select: vi
        .fn()
        .mockImplementationOnce(() => createPendingOrderCountSelect())
        .mockImplementationOnce(() => ({
          from: () => ({
            where: () => ({
              for: vi.fn().mockResolvedValue([createActiveListing()]),
            }),
          }),
        }))
        .mockImplementationOnce(() => createSellerReadinessSelect()),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ id: SELLER_ID }]),
        })),
      })),
      insert: vi.fn(),
    };
    const db = {
      transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const caller = createCaller(createContext(db));

    await expect(
      caller.order.create({
        listingId: LISTING_ID,
        quantitySqFt: 200,
        shippingName: "Buyer Name",
        shippingAddress: "123 Main St",
        shippingCity: "Denver",
        shippingState: "CO",
        shippingZip: "80202",
        selectedQuoteToken: "quote-token-payout-block",
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Seller cannot currently accept payments for this listing.",
    });

    expect(mocks.redisGet).not.toHaveBeenCalled();
    expect(mocks.redisEval).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("blocks accepted-offer reservation before quote consumption when the seller account is deauthorized", async () => {
    mocks.stripeAccountsRetrieve.mockRejectedValue({
      type: "StripeInvalidRequestError",
      code: "resource_missing",
      statusCode: 404,
    });

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
    const updateWhere = vi.fn().mockResolvedValue([{ id: SELLER_ID }]);
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
              for: vi.fn().mockResolvedValue([createActiveListing()]),
            }),
          }),
        }))
        .mockImplementationOnce(() => createSellerReadinessSelect()),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: updateWhere,
        })),
      })),
      insert: vi.fn(),
    };
    const db = {
      transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const caller = createCaller(createContext(db));

    await expect(
      caller.order.createFromOffer({
        offerId: OFFER_ID,
        shippingName: "Buyer Name",
        shippingAddress: "123 Main St",
        shippingCity: "Denver",
        shippingState: "CO",
        shippingZip: "80202",
        selectedQuoteToken: "quote-token-deauthorized",
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Seller cannot currently accept payments for this listing.",
    });

    expect(updateWhere).toHaveBeenCalled();
    expect(mocks.redisGet).not.toHaveBeenCalled();
    expect(mocks.redisEval).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
