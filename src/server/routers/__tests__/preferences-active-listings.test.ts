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

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { preferencesRouter } = await import("@/server/routers/preferences");

const router = createTRPCRouter({
  preferences: preferencesRouter,
});
const createCaller = createCallerFactory(router);

const SELLER_ID = "11111111-1111-4111-8111-111111111111";

function createCallerContext(db: unknown) {
  return {
    db,
    authUser: { id: "auth-seller-1" },
    user: {
      id: SELLER_ID,
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
  } as Parameters<typeof createCaller>[0];
}

function thenableQuery<T>(rows: T[]) {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    for: vi.fn(),
    then: (
      resolve: (value: T[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject),
  };
  builder.from.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.for.mockResolvedValue(rows);
  return builder;
}

const commercialDefaults = {
  canSplitLots: false,
  partialQuantityMarkupPercent: 30,
  automaticMarkdownEnabled: false,
  automaticMarkdownFloorPercent: 60,
  automaticMarkdownIntervalDays: 21,
  defaultAllowOffers: false,
  allowSampleRequests: false,
  sellingTerritoryMode: "unrestricted" as const,
  allowedDestinationStates: ["TX" as const],
  freightPaymentMode: "buyer_pays" as const,
  sellerFreightStates: ["TX" as const],
  freightDropCharge: 95,
};

function activeListing(id: string) {
  return {
    id,
    askPricePerSqFt: 2.99,
    allowOffers: true,
    fullLotOnly: false,
    partialQuantityMarkupPercent: 20,
    automaticMarkdownEnabled: true,
    automaticMarkdownFloorPercent: 60,
    automaticMarkdownIntervalDays: 21,
    automaticMarkdownStartedAt: new Date("2026-06-01T00:00:00.000Z"),
    automaticMarkdownCurrentStep: 2,
    automaticMarkdownLastAppliedAt: new Date(
      "2026-07-01T00:00:00.000Z",
    ),
    pricingRulesVersion: 1,
    allowSampleRequests: true,
    territoryMode: "allowed_states" as const,
    allowedDestinationStates: ["TX"],
    freightPaymentMode: "seller_pays" as const,
    sellerFreightStates: ["TX"],
    freightDropCharge: 95,
  };
}

function buildSelectMock() {
  const listingRows = [
    activeListing("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    activeListing("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    activeListing("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
  ];
  const offers = [
    {
      id: "offer-accepted",
      listingId: listingRows[0]!.id,
      status: "accepted",
      orderId: null,
    },
    {
      id: "offer-pending",
      listingId: listingRows[1]!.id,
      status: "pending",
      orderId: null,
    },
    {
      id: "offer-countered",
      listingId: listingRows[2]!.id,
      status: "countered",
      orderId: null,
    },
  ];
  const orderRows = [
    { id: "order-1", listingId: listingRows[1]!.id },
  ];
  const sampleRows = [
    { id: "sample-1", listingId: listingRows[2]!.id },
  ];
  const builders = [
    thenableQuery(listingRows),
    thenableQuery(offers),
    thenableQuery(orderRows),
    thenableQuery(sampleRows),
  ];
  return {
    listingRows,
    builders,
    select: vi.fn(() => {
      const next = builders.shift();
      if (!next) throw new Error("Unexpected select");
      return next;
    }),
  };
}

describe("preferences active-listing default application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("previews skips and non-blocking warnings without mutating listings", async () => {
    const { select } = buildSelectMock();
    const db = { select };
    const caller = createCaller(createCallerContext(db));

    const result =
      await caller.preferences.previewActiveListingDefaultsApply(
        commercialDefaults,
      );

    expect(result).toMatchObject({
      activeListingCount: 3,
      eligibleListingCount: 2,
      changedListingCount: 2,
      unchangedListingCount: 0,
      skippedAcceptedOfferListingCount: 1,
      skippedAcceptedOfferCount: 1,
      warnings: {
        pendingOrCounteredOfferCount: 2,
        listingsWithPendingOrCounteredOffers: 2,
        activeOrderCount: 1,
        listingsWithActiveOrders: 1,
        openSampleRequestCount: 1,
        listingsWithOpenSampleRequests: 1,
      },
    });
    expect(db).not.toHaveProperty("update");
  });

  it("updates only eligible rows and writes one audit entry per changed listing in one transaction", async () => {
    const { select, builders, listingRows } = buildSelectMock();
    const updatePayloads: Array<Record<string, unknown>> = [];
    const auditPayloads: Array<Record<string, unknown>> = [];
    const update = vi.fn(() => {
      const builder = {
        set: vi.fn((payload: Record<string, unknown>) => {
          updatePayloads.push(payload);
          return builder;
        }),
        where: vi.fn(() => builder),
        returning: vi.fn().mockResolvedValue([{ id: "updated" }]),
      };
      return builder;
    });
    const insert = vi.fn(() => ({
      values: vi.fn((payload: Record<string, unknown>) => {
        auditPayloads.push(payload);
        return Promise.resolve();
      }),
    }));
    const tx = { select, update, insert };
    const db = {
      transaction: vi.fn(
        async (callback: (executor: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const caller = createCaller(createCallerContext(db));

    const result =
      await caller.preferences.applySellerDefaultsToActiveListings({
        defaults: commercialDefaults,
        confirmed: true,
      });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(result.changedListingCount).toBe(2);
    expect(result.skippedAcceptedOfferListingCount).toBe(1);
    expect(update).toHaveBeenCalledTimes(2);
    expect(auditPayloads).toHaveLength(2);
    expect(auditPayloads.map((entry) => entry.relatedId)).not.toContain(
      listingRows[0]!.id,
    );
    for (const payload of updatePayloads) {
      expect(payload).not.toHaveProperty("askPricePerSqFt");
      expect(payload).not.toHaveProperty("totalSqFt");
      expect(payload).not.toHaveProperty("status");
      expect(payload).toMatchObject({
        fullLotOnly: true,
        partialQuantityMarkupPercent: null,
        automaticMarkdownEnabled: false,
        allowedDestinationStates: [],
        sellerFreightStates: [],
        freightDropCharge: null,
      });
    }
    expect(builders).toHaveLength(0);
  });

  it("clears contradictory saved defaults when their parent controls are off", async () => {
    const savedValues: Array<Record<string, unknown>> = [];
    const insert = vi.fn(() => {
      const builder = {
        values: vi.fn((values: Record<string, unknown>) => {
          savedValues.push(values);
          return builder;
        }),
        onConflictDoUpdate: vi.fn(() => builder),
        returning: vi.fn().mockResolvedValue([{ id: "preferences-1" }]),
      };
      return builder;
    });
    const caller = createCaller(createCallerContext({ insert }));

    await caller.preferences.upsert({
      role: "seller",
      canSplitLots: false,
      partialQuantityMarkupPercent: 30,
      automaticMarkdownEnabled: false,
      automaticMarkdownFloorPercent: 60,
      automaticMarkdownIntervalDays: 21,
      sellingTerritoryMode: "unrestricted",
      allowedDestinationStates: ["TX"],
      freightPaymentMode: "buyer_pays",
      sellerFreightStates: ["TX"],
      freightDropCharge: 95,
    });

    expect(savedValues[0]).toMatchObject({
      partialQuantityMarkupPercent: null,
      automaticMarkdownFloorPercent: null,
      automaticMarkdownIntervalDays: null,
      allowedDestinationStates: [],
      sellerFreightStates: [],
      freightDropCharge: null,
    });
  });
});
