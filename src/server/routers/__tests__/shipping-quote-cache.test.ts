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

const mocks = vi.hoisted(() => {
  const store = new Map<string, string>();
  let tokenCounter = 0;

  return {
    store,
    rateLimit: vi.fn(),
    checkViolationStatus: vi.fn(),
    isDryRun: vi.fn(() => false),
    getRates: vi.fn(),
    redisGet: vi.fn(async (key: string) => store.get(key) ?? null),
    redisSet: vi.fn(
      async (key: string, value: string, options?: { ex?: number }) => {
        store.set(key, value);
        return options?.ex ?? "OK";
      },
    ),
    randomUUID: vi.fn(() => {
      tokenCounter += 1;
      return `quote-token-${tokenCounter}`;
    }),
    reset() {
      store.clear();
      tokenCounter = 0;
    },
  };
});

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
    get: mocks.redisGet,
    set: mocks.redisSet,
  },
}));

vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: mocks.checkViolationStatus,
}));

vi.mock("@/server/services/priority1", () => ({
  priority1: {
    isDryRun: mocks.isDryRun,
    getRates: mocks.getRates,
  },
}));

vi.mock("crypto", async () => {
  const actual = await vi.importActual<typeof import("crypto")>("crypto");
  return {
    ...actual,
    randomUUID: mocks.randomUUID,
  };
});

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { shippingRouter } = await import("@/server/routers/shipping");

const router = createTRPCRouter({
  shipping: shippingRouter,
});

const createCaller = createCallerFactory(router);

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const LISTING_ID = "55555555-5555-4555-8555-555555555555";

function createContext(db: Record<string, unknown>) {
  return {
    db,
    authUser: { id: `auth-${BUYER_ID}` },
    user: {
      id: BUYER_ID,
      role: "buyer",
      active: true,
      verificationStatus: "verified",
      name: "Buyer",
      businessName: "Buyer Co",
      email: "buyer@example.com",
      stripeAccountId: null,
      stripeOnboardingComplete: false,
    },
    supabase: {},
    clientIp: "127.0.0.1",
  } as unknown as Parameters<typeof createCaller>[0];
}

function createListingDb() {
  return {
    query: {
      listings: {
        findFirst: vi.fn().mockResolvedValue({
          id: LISTING_ID,
          title: "Engineered Oak",
          status: "active",
          condition: "new",
          lastConfirmedAt: new Date("2099-07-31T12:00:00.000Z"),
          confirmationDueAt: new Date("2099-08-31T12:00:00.000Z"),
          territoryMode: "unrestricted",
          allowedDestinationStates: [],
          palletWeight: 1200,
          palletLength: 48,
          palletWidth: 40,
          palletHeight: 60,
          locationZip: "84101",
          locationCity: "Salt Lake City",
          locationState: "UT",
          freightClass: "125",
          nmfcCode: "123-45",
          totalPallets: 4,
          sqFtPerBox: 20,
          boxesPerPallet: 10,
          freightPaymentMode: "buyer_pays",
          sellerFreightStates: [],
          freightDropCharge: null,
          seller: {
            id: "seller-1",
            name: "Seller",
            email: "seller@example.com",
            phone: "8015551212",
            businessName: "Seller Co",
            businessAddress: "123 Warehouse Rd",
          },
        }),
      },
    },
  };
}

describe("shipping quote provider cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reset();
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.checkViolationStatus.mockResolvedValue({
      allowed: true,
      action: "none",
      violationCount: 0,
    });
    mocks.isDryRun.mockReturnValue(false);
    mocks.getRates.mockResolvedValue({
      rateQuotes: [
        {
          id: 101,
          carrierName: "Carrier A",
          carrierCode: "CARA",
          transitDays: 3,
          deliveryDate: "2099-08-06T18:00:00.000Z",
          expirationDate: "2099-08-01T12:20:00.000Z",
          rateQuoteDetail: { total: 480 },
        },
        {
          id: 102,
          carrierName: "Carrier B",
          carrierCode: "CARB",
          transitDays: 4,
          deliveryDate: "2099-08-07T18:00:00.000Z",
          expirationDate: "2099-08-01T12:25:00.000Z",
          rateQuoteDetail: { total: 520 },
        },
      ],
    });
  });

  it("reuses cached Priority1 rates but still mints fresh secure quote tokens", async () => {
    const db = createListingDb();

    const caller = createCaller(createContext(db));
    const first = await caller.shipping.getQuotes({
      listingId: LISTING_ID,
      destinationZip: "75001",
      quantitySqFt: 150,
    });
    const second = await caller.shipping.getQuotes({
      listingId: LISTING_ID,
      destinationZip: "75001",
      quantitySqFt: 150,
    });

    expect(mocks.getRates).toHaveBeenCalledTimes(1);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(first[0]?.carrierName).toBe(second[0]?.carrierName);
    expect(first[0]?.shippingPrice).toBe(second[0]?.shippingPrice);
    expect(first[0]?.quoteToken).not.toBe(second[0]?.quoteToken);
    expect(mocks.redisSet).toHaveBeenCalled();
  });

  it("does not reuse a dry-run rate cache entry for live requests", async () => {
    const caller = createCaller(createContext(createListingDb()));

    mocks.isDryRun.mockReturnValueOnce(true).mockReturnValueOnce(false);

    await caller.shipping.getQuotes({
      listingId: LISTING_ID,
      destinationZip: "75001",
      quantitySqFt: 150,
    });
    await caller.shipping.getQuotes({
      listingId: LISTING_ID,
      destinationZip: "75001",
      quantitySqFt: 150,
    });

    expect(mocks.getRates).toHaveBeenCalledTimes(2);
  });

  it("quotes and cache-segments the selected delivery requirements", async () => {
    const caller = createCaller(createContext(createListingDb()));

    await caller.shipping.getQuotes({
      listingId: LISTING_ID,
      destinationZip: "75001",
      quantitySqFt: 150,
    });
    await caller.shipping.getQuotes({
      listingId: LISTING_ID,
      destinationZip: "75001",
      quantitySqFt: 150,
      liftgateDelivery: true,
      residentialDelivery: true,
      appointmentDelivery: true,
    });

    expect(mocks.getRates).toHaveBeenCalledTimes(2);
    expect(mocks.getRates).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accessorialServices: [
          { code: "LGDEL" },
          { code: "RESD" },
          { code: "APPT" },
        ],
      }),
    );
    const persistedSnapshots = mocks.redisSet.mock.calls
      .map(([, value]) => JSON.parse(value) as Record<string, unknown>)
      .filter((value) => Array.isArray(value.accessorialCodes));
    expect(persistedSnapshots).not.toHaveLength(0);
    expect(persistedSnapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accessorialCodes: ["LGDEL", "RESD", "APPT"],
        }),
      ]),
    );
  });
});
