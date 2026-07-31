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

const redisGet = vi.fn().mockResolvedValue("already-counted");

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
    get: redisGet,
    set: vi.fn(),
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

const router = createTRPCRouter({ listing: listingRouter });
const createCaller = createCallerFactory(router);

const LISTING_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const BUYER_ID = "33333333-3333-4333-8333-333333333333";

function restrictedListing() {
  return {
    id: LISTING_ID,
    sellerId: SELLER_ID,
    title: "Restricted engineered oak lot",
    slug: "restricted-engineered-oak-lot",
    status: "active",
    materialType: "engineered",
    totalSqFt: 2_000,
    totalPallets: 10,
    askPricePerSqFt: 2.49,
    allowOffers: true,
    fullLotOnly: false,
    partialQuantityMarkupPercent: null,
    allowSampleRequests: true,
    territoryMode: "allowed_states",
    allowedDestinationStates: ["CO", "WY"],
    condition: "closeout",
    lastConfirmedAt: new Date("2098-12-01T00:00:00.000Z"),
    confirmationDueAt: new Date("2099-12-01T00:00:00.000Z"),
    createdAt: new Date("2098-11-01T00:00:00.000Z"),
    updatedAt: new Date("2098-12-01T00:00:00.000Z"),
    media: [],
    seller: null,
  };
}

function dbForListing(listing = restrictedListing()) {
  return {
    query: {
      listings: {
        findFirst: vi.fn().mockResolvedValue(listing),
      },
    },
  };
}

function callerContext(input: {
  db: ReturnType<typeof dbForListing>;
  user?: Record<string, unknown> | null;
}) {
  return {
    db: input.db,
    authUser:
      input.user == null ? null : { id: `auth-${String(input.user.id)}` },
    user: input.user ?? null,
    supabase: {},
    clientIp: "127.0.0.1",
  } as unknown as Parameters<typeof createCaller>[0];
}

function buyer(overrides: Record<string, unknown> = {}) {
  return {
    id: BUYER_ID,
    role: "buyer",
    active: true,
    verificationStatus: "verified",
    businessState: "CO",
    ...overrides,
  };
}

describe("listingRouter territory visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisGet.mockResolvedValue("already-counted");
  });

  it("returns NOT_FOUND to anonymous viewers", async () => {
    const db = dbForListing();
    const caller = createCaller(callerContext({ db, user: null }));

    await expect(caller.listing.getById({ id: LISTING_ID })).rejects.toMatchObject(
      {
        code: "NOT_FOUND",
      },
    );
  });

  it("returns NOT_FOUND when the buyer has no verified destination state", async () => {
    const db = dbForListing();
    const caller = createCaller(
      callerContext({
        db,
        user: buyer({
          verificationStatus: "unverified",
          businessState: "CO",
        }),
      }),
    );

    await expect(caller.listing.getById({ id: LISTING_ID })).rejects.toMatchObject(
      {
        code: "NOT_FOUND",
      },
    );
  });

  it("returns NOT_FOUND to a verified buyer outside the territory", async () => {
    const db = dbForListing();
    const caller = createCaller(
      callerContext({ db, user: buyer({ businessState: "UT" }) }),
    );

    await expect(
      caller.listing.getBySlug({ slug: "restricted-engineered-oak-lot" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      caller.listing.getPurchaseConfig({ listingId: LISTING_ID }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("returns the restricted listing to an allowed verified buyer", async () => {
    const db = dbForListing();
    const caller = createCaller(callerContext({ db, user: buyer() }));

    await expect(caller.listing.getById({ id: LISTING_ID })).resolves.toMatchObject(
      {
        id: LISTING_ID,
        sellerId: SELLER_ID,
      },
    );
    await expect(
      caller.listing.getPurchaseConfig({ listingId: LISTING_ID }),
    ).resolves.toMatchObject({
      sellingTerritoryMode: "allowed_states",
      allowedDestinationStates: ["CO", "WY"],
    });
  });

  it("lets the seller view their own restricted listing", async () => {
    const db = dbForListing();
    const caller = createCaller(
      callerContext({
        db,
        user: {
          id: SELLER_ID,
          role: "seller",
          active: true,
          verificationStatus: "verified",
          businessState: null,
        },
      }),
    );

    await expect(
      caller.listing.getBySlug({ slug: "restricted-engineered-oak-lot" }),
    ).resolves.toMatchObject({ id: LISTING_ID });
  });

  it("lets an admin view restricted inventory", async () => {
    const db = dbForListing();
    const caller = createCaller(
      callerContext({
        db,
        user: {
          id: "44444444-4444-4444-8444-444444444444",
          role: "admin",
          active: true,
          verificationStatus: "verified",
          businessState: null,
        },
      }),
    );

    await expect(caller.listing.getById({ id: LISTING_ID })).resolves.toMatchObject(
      {
        id: LISTING_ID,
      },
    );
  });
});
