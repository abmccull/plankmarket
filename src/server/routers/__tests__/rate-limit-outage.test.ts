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

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  checkViolationStatus: vi.fn(),
  getRates: vi.fn(),
  getDocuments: vi.fn(),
  stripeAccountsCreate: vi.fn(),
  stripeAccountsRetrieve: vi.fn(),
  stripeAccountsCreateLoginLink: vi.fn(),
  stripeAccountSessionsCreate: vi.fn(),
  stripePaymentIntentsCreate: vi.fn(),
  stripePaymentIntentsRetrieve: vi.fn(),
  inngestSend: vi.fn(),
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }

    async limit(identifier: string) {
      return mocks.rateLimit(identifier);
    }
  },
}));

vi.mock("@/lib/redis/client", () => ({
  getRedisClient: () => ({}),
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: mocks.checkViolationStatus,
}));

vi.mock("@/server/services/priority1", () => ({
  priority1: {
    getRates: mocks.getRates,
    getDocuments: mocks.getDocuments,
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    accounts: {
      create: mocks.stripeAccountsCreate,
      retrieve: mocks.stripeAccountsRetrieve,
      createLoginLink: mocks.stripeAccountsCreateLoginLink,
    },
    accountSessions: {
      create: mocks.stripeAccountSessionsCreate,
    },
    paymentIntents: {
      create: mocks.stripePaymentIntentsCreate,
      retrieve: mocks.stripePaymentIntentsRetrieve,
    },
  },
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: mocks.inngestSend,
  },
}));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { shippingRouter } = await import("@/server/routers/shipping");
const { orderRouter } = await import("@/server/routers/order");
const { paymentRouter } = await import("@/server/routers/payment");

const router = createTRPCRouter({
  shipping: shippingRouter,
  order: orderRouter,
  payment: paymentRouter,
});

const createCaller = createCallerFactory(router);

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const OFFER_ID = "44444444-4444-4444-8444-444444444444";
const LISTING_ID = "55555555-5555-4555-8555-555555555555";

function createContext(params: {
  db: Record<string, unknown>;
  user?: {
    id?: string;
    role?: "buyer" | "seller" | "admin";
    verificationStatus?: "verified" | "pending" | "unverified" | "rejected";
  } | null;
}) {
  const user = params.user === null
    ? null
    : {
        id: params.user?.id ?? BUYER_ID,
        role: params.user?.role ?? "buyer",
        active: true,
        verificationStatus: params.user?.verificationStatus ?? "verified",
        name: "Test User",
        businessName: "Test Business",
        email: "test@example.com",
        stripeAccountId: "acct_test_123",
        stripeOnboardingComplete: true,
      };

  return {
    db: params.db,
    authUser: user ? { id: `auth-${user.id}` } : null,
    user,
    supabase: {},
    clientIp: "127.0.0.1",
  } as unknown as Parameters<typeof createCaller>[0];
}

describe("strict authenticated limiter outages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.checkViolationStatus.mockResolvedValue({
      allowed: true,
      action: "none",
      violationCount: 0,
    });
  });

  it("returns SERVICE_UNAVAILABLE for shipping quotes when Redis is down", async () => {
    mocks.rateLimit.mockRejectedValueOnce(new Error("Redis unavailable"));
    const db = {
      query: {
        listings: {
          findFirst: vi.fn(),
        },
      },
    };
    const caller = createCaller(createContext({ db }));

    await expect(
      caller.shipping.getQuotes({
        listingId: LISTING_ID,
        destinationZip: "75001",
        quantitySqFt: 500,
      }),
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "This operation is temporarily unavailable. Please try again.",
    });
    expect(db.query.listings.findFirst).not.toHaveBeenCalled();
  });

  it("returns SERVICE_UNAVAILABLE for checkout order creation when Redis is down", async () => {
    mocks.rateLimit.mockRejectedValueOnce(new Error("Redis unavailable"));
    const db = {
      transaction: vi.fn(),
    };
    const caller = createCaller(createContext({ db }));

    await expect(
      caller.order.create({
        listingId: LISTING_ID,
        quantitySqFt: 500,
        shippingName: "Buyer Name",
        shippingAddress: "123 Main St",
        shippingCity: "Dallas",
        shippingState: "TX",
        shippingZip: "75001",
        shippingPhone: "+14155552671",
        selectedQuoteToken: "quote-token",
      }),
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "This operation is temporarily unavailable. Please try again.",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns SERVICE_UNAVAILABLE for offer checkout when Redis is down", async () => {
    mocks.rateLimit.mockRejectedValueOnce(new Error("Redis unavailable"));
    const db = {
      transaction: vi.fn(),
    };
    const caller = createCaller(createContext({ db }));

    await expect(
      caller.order.createFromOffer({
        offerId: OFFER_ID,
        shippingName: "Buyer Name",
        shippingAddress: "123 Main St",
        shippingCity: "Dallas",
        shippingState: "TX",
        shippingZip: "75001",
        shippingPhone: "+14155552671",
        selectedQuoteToken: "quote-token",
      }),
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "This operation is temporarily unavailable. Please try again.",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns SERVICE_UNAVAILABLE for payment intent creation when Redis is down", async () => {
    mocks.rateLimit.mockRejectedValueOnce(new Error("Redis unavailable"));
    const db = {
      transaction: vi.fn(),
    };
    const caller = createCaller(createContext({ db }));

    await expect(
      caller.payment.createPaymentIntent({
        orderId: ORDER_ID,
      }),
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "This operation is temporarily unavailable. Please try again.",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it.each([
    "createConnectAccount",
    "createAccountSession",
    "createLoginLink",
    "getConnectStatus",
  ] as const)(
    "returns SERVICE_UNAVAILABLE for payment.%s when Redis is down",
    async (procedureName) => {
      mocks.rateLimit.mockRejectedValueOnce(new Error("Redis unavailable"));
      const caller = createCaller(
        createContext({
          db: {},
          user: { id: SELLER_ID, role: "seller", verificationStatus: "verified" },
        }),
      );

      await expect(caller.payment[procedureName]()).rejects.toMatchObject({
        code: "SERVICE_UNAVAILABLE",
        message: "This operation is temporarily unavailable. Please try again.",
      });
    },
  );

  it("returns SERVICE_UNAVAILABLE for shipping documents when Redis is down", async () => {
    mocks.rateLimit.mockRejectedValueOnce(new Error("Redis unavailable"));
    const db = {
      query: {
        orders: {
          findFirst: vi.fn(),
        },
        shipments: {
          findFirst: vi.fn(),
        },
      },
    };
    const caller = createCaller(createContext({ db }));

    await expect(
      caller.shipping.getDocuments({
        orderId: ORDER_ID,
        documentType: "BillOfLading",
      }),
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "This operation is temporarily unavailable. Please try again.",
    });
    expect(db.query.orders.findFirst).not.toHaveBeenCalled();
    expect(db.query.shipments.findFirst).not.toHaveBeenCalled();
  });

  it("keeps verified-buyer gating semantics on the strict checkout procedure", async () => {
    const db = {
      transaction: vi.fn(),
    };
    const caller = createCaller(
      createContext({
        db,
        user: { verificationStatus: "pending" },
      }),
    );

    await expect(
      caller.payment.createPaymentIntent({
        orderId: ORDER_ID,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("Buyer verification required"),
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("preserves fail-open behavior for standard authenticated read queries", async () => {
    mocks.rateLimit.mockRejectedValueOnce(new Error("Redis unavailable"));
    const db = {
      query: {
        orders: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    };
    const caller = createCaller(createContext({ db }));

    await expect(
      caller.payment.getPaymentStatus({
        orderId: ORDER_ID,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Order not found",
    });
    expect(db.query.orders.findFirst).toHaveBeenCalledOnce();
  });
});
