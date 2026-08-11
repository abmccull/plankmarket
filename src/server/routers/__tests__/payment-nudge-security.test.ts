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
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}) }));
vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    accounts: {
      retrieve: vi.fn(),
      create: vi.fn(),
      createLoginLink: vi.fn(),
    },
    accountSessions: {
      create: vi.fn(),
    },
    paymentIntents: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
  },
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { paymentRouter } = await import("@/server/routers/payment");

const router = createTRPCRouter({ payment: paymentRouter });
const createCaller = createCallerFactory(router);

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_SELLER_ID = "33333333-3333-4333-8333-333333333333";
const LISTING_ID = "44444444-4444-4444-8444-444444444444";

function createContext(params: {
  db: Record<string, unknown>;
  role?: "buyer" | "seller" | "admin";
}) {
  const role = params.role ?? "buyer";
  return {
    db: params.db,
    authUser: { id: `auth-${BUYER_ID}` },
    user: {
      id: BUYER_ID,
      role,
      active: true,
      verificationStatus: "verified",
      businessState: "CO",
      name: "Buyer",
      businessName: "Buyer Co",
      stripeAccountId: "acct_buyer",
      stripeOnboardingComplete: true,
    },
    supabase: {},
    clientIp: "127.0.0.1",
  } as unknown as Parameters<typeof createCaller>[0];
}

function createListing() {
  return {
    id: LISTING_ID,
    sellerId: SELLER_ID,
    status: "active",
    confirmationDueAt: new Date("2099-08-15T12:00:00.000Z"),
    lastConfirmedAt: new Date("2099-08-01T12:00:00.000Z"),
    territoryMode: "unrestricted" as const,
    allowedDestinationStates: [],
  };
}

function createDb(overrides: {
  sellerReady?: boolean;
  watchlist?: { id: string } | null;
  conversation?: { id: string } | null;
  offer?: { id: string } | null;
  order?: { id: string } | null;
  recentNotification?: { id: string } | null;
  insert?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    query: {
      listings: {
        findFirst: vi.fn().mockResolvedValue(createListing()),
      },
      users: {
        findFirst: vi.fn().mockResolvedValue({
          id: SELLER_ID,
          stripeOnboardingComplete: overrides.sellerReady ?? false,
        }),
      },
      watchlist: {
        findFirst: vi.fn().mockResolvedValue(overrides.watchlist ?? null),
      },
      conversations: {
        findFirst: vi.fn().mockResolvedValue(overrides.conversation ?? null),
      },
      offers: {
        findFirst: vi.fn().mockResolvedValue(overrides.offer ?? null),
      },
      orders: {
        findFirst: vi.fn().mockResolvedValue(overrides.order ?? null),
      },
      notifications: {
        findFirst: vi
          .fn()
          .mockResolvedValue(overrides.recentNotification ?? null),
      },
    },
    insert:
      overrides.insert ??
      vi.fn(() => ({
        values: vi.fn().mockResolvedValue([{ id: "notification-1" }]),
      })),
  };
}

describe("payment.nudgeSellerToOnboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the action buyer-scoped under the strict checkout limiter", async () => {
    const db = createDb();
    const caller = createCaller(createContext({ db, role: "seller" }));

    await expect(
      caller.payment.nudgeSellerToOnboard({
        listingId: LISTING_ID,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only buyers can perform this action",
    });

    expect(db.query.listings.findFirst).not.toHaveBeenCalled();
  });

  it("rejects mismatched seller ids instead of letting buyers target another tenant", async () => {
    const db = createDb({ watchlist: { id: "watch-1" } });
    const caller = createCaller(createContext({ db }));

    await expect(
      caller.payment.nudgeSellerToOnboard({
        listingId: LISTING_ID,
        sellerId: OTHER_SELLER_ID,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Listing seller mismatch",
    });

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("requires a legitimate buyer interest context before notifying the seller", async () => {
    const db = createDb();
    const caller = createCaller(createContext({ db }));

    await expect(
      caller.payment.nudgeSellerToOnboard({
        listingId: LISTING_ID,
        sellerId: SELLER_ID,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "A checkout, watchlist, or conversation context is required.",
    });

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("stores a listing-specific idempotency key and honors recent exact nudges only", async () => {
    const insertValues = vi.fn().mockResolvedValue([{ id: "notification-1" }]);
    const db = createDb({
      watchlist: { id: "watch-1" },
      insert: vi.fn(() => ({ values: insertValues })),
    });
    const caller = createCaller(createContext({ db }));

    await expect(
      caller.payment.nudgeSellerToOnboard({
        listingId: LISTING_ID,
        sellerId: SELLER_ID,
      }),
    ).resolves.toEqual({ notified: true });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: SELLER_ID,
        data: expect.objectContaining({
          action: "seller_onboarding_nudge",
          buyerId: BUYER_ID,
          listingId: LISTING_ID,
          idempotencyKey: `seller-onboarding-nudge:${LISTING_ID}:${BUYER_ID}`,
        }),
      }),
    );

    db.query.notifications.findFirst.mockResolvedValueOnce({ id: "notification-1" });

    await expect(
      caller.payment.nudgeSellerToOnboard({
        listingId: LISTING_ID,
        sellerId: SELLER_ID,
      }),
    ).resolves.toEqual({
      notified: false,
      reason: "recently_notified",
    });
  });
});
