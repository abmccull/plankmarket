import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/plankmarket_test";
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
}));

vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: vi.fn(),
}));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { sampleRequestRouter } = await import("@/server/routers/sample-request");

const router = createTRPCRouter({
  sampleRequest: sampleRequestRouter,
});

const createCaller = createCallerFactory(router);

function createUpdateChain<T>(value: T) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(value),
      }),
    }),
  };
}

function createCallerContext(overrides: Record<string, unknown> = {}) {
  return {
    db: overrides.db,
    authUser: { id: "auth-1" },
    user: {
      id: "buyer-1",
      role: "buyer" as const,
      active: true,
      verificationStatus: "verified",
      businessName: null,
      name: "Buyer User",
    },
    supabase: {},
    clientIp: "127.0.0.1",
    ...overrides,
  } as Parameters<typeof createCaller>[0];
}

describe("sampleRequestRouter", () => {
  const LISTING_ID = "11111111-1111-4111-8111-111111111111";
  const SAMPLE_ID = "22222222-2222-4222-8222-222222222222";
  const SAMPLE_ID_2 = "33333333-3333-4333-8333-333333333333";
  const BUYER_ID = "44444444-4444-4444-8444-444444444444";
  const SELLER_ID = "55555555-5555-4555-8555-555555555555";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the existing open request instead of creating a duplicate", async () => {
    const existingRequest = {
      id: SAMPLE_ID,
      listingId: LISTING_ID,
      buyerId: BUYER_ID,
      sellerId: SELLER_ID,
      status: "requested" as const,
      buyerMessage: "Please pull the current wear layer.",
      shippingName: "Buyer Name",
      shippingAddress1: "123 Main St",
      shippingAddress2: null,
      shippingCity: "Denver",
      shippingState: "CO",
      shippingZip: "80202",
      shippingPhone: null,
      buyerConsentedToShareAddressAt: new Date("2026-07-30T12:00:00.000Z"),
      carrier: null,
      trackingNumber: null,
      approvedAt: null,
      declinedAt: null,
      cancelledAt: null,
      shippedAt: null,
      deliveredAt: null,
      lastActionReason: "Please pull the current wear layer.",
      auditLog: [],
      piiPurgedAt: null,
      createdAt: new Date("2026-07-30T12:00:00.000Z"),
      updatedAt: new Date("2026-07-30T12:00:00.000Z"),
      listing: {
        id: LISTING_ID,
        title: "Engineered White Oak",
        sellerId: SELLER_ID,
      },
    };

    const db = {
      query: {
        listings: {
          findFirst: vi.fn().mockResolvedValue({
            id: LISTING_ID,
            title: "Engineered White Oak",
            sellerId: SELLER_ID,
            status: "active",
            allowSampleRequests: true,
            confirmationDueAt: new Date("2026-08-26T12:00:00.000Z"),
            lastConfirmedAt: new Date("2026-07-29T12:00:00.000Z"),
            territoryMode: "unrestricted",
            allowedDestinationStates: null,
          }),
        },
        sampleRequests: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(existingRequest),
        },
      },
      transaction: vi.fn(async (callback) =>
        callback({
          query: {
            sampleRequests: {
              findFirst: db.query.sampleRequests.findFirst,
            },
          },
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockRejectedValue({ code: "23505" }),
            }),
          }),
        }),
      ),
    };

    const caller = createCaller(createCallerContext({ db }));
    const result = await caller.sampleRequest.create({
      listingId: LISTING_ID,
      buyerMessage: "Please pull the current wear layer.",
      shippingName: "Buyer Name",
      shippingAddress1: "123 Main St",
      shippingCity: "Denver",
      shippingState: "CO",
      shippingZip: "80202",
      consentToShareAddress: true,
    });

    expect(result.created).toBe(false);
    expect(result.request.id).toBe(SAMPLE_ID);
    expect(db.transaction).toHaveBeenCalled();
  });

  it("rejects sample requests outside the seller territory", async () => {
    const db = {
      query: {
        listings: {
          findFirst: vi.fn().mockResolvedValue({
            id: LISTING_ID,
            title: "Engineered White Oak",
            sellerId: SELLER_ID,
            status: "active",
            allowSampleRequests: true,
            confirmationDueAt: new Date("2026-08-26T12:00:00.000Z"),
            lastConfirmedAt: new Date("2026-07-29T12:00:00.000Z"),
            territoryMode: "allowed_states",
            allowedDestinationStates: ["AZ", "UT"],
          }),
        },
      },
      transaction: vi.fn(),
    };

    const caller = createCaller(createCallerContext({ db }));

    await expect(
      caller.sampleRequest.create({
        listingId: LISTING_ID,
        buyerMessage: "Please send a sample.",
        shippingName: "Buyer Name",
        shippingAddress1: "123 Main St",
        shippingCity: "Denver",
        shippingState: "CO",
        shippingZip: "80202",
        consentToShareAddress: true,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "This seller is not currently sending samples to CO.",
    });

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("creates a sample request when the destination is inside the seller territory", async () => {
    const createdRequest = {
      id: SAMPLE_ID,
      listingId: LISTING_ID,
      buyerId: "buyer-1",
      sellerId: SELLER_ID,
      status: "requested" as const,
      buyerMessage: "Please send a sample.",
      shippingName: "Buyer Name",
      shippingAddress1: "123 Main St",
      shippingAddress2: null,
      shippingCity: "Denver",
      shippingState: "CO",
      shippingZip: "80202",
      shippingPhone: null,
      buyerConsentedToShareAddressAt: new Date("2026-07-30T12:00:00.000Z"),
      carrier: null,
      trackingNumber: null,
      approvedAt: null,
      declinedAt: null,
      cancelledAt: null,
      shippedAt: null,
      deliveredAt: null,
      lastActionReason: "Please send a sample.",
      auditLog: [],
      piiPurgedAt: null,
      createdAt: new Date("2026-07-30T12:00:00.000Z"),
      updatedAt: new Date("2026-07-30T12:00:00.000Z"),
    };
    const insert = vi
      .fn()
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([createdRequest]),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockResolvedValue(undefined),
      });
    const db = {
      query: {
        listings: {
          findFirst: vi.fn().mockResolvedValue({
            id: LISTING_ID,
            title: "Engineered White Oak",
            sellerId: SELLER_ID,
            status: "active",
            allowSampleRequests: true,
            confirmationDueAt: new Date("2026-08-26T12:00:00.000Z"),
            lastConfirmedAt: new Date("2026-07-29T12:00:00.000Z"),
            territoryMode: "allowed_states",
            allowedDestinationStates: ["CO", "UT"],
          }),
        },
      },
      transaction: vi.fn(async (callback) =>
        callback({
          query: {
            sampleRequests: {
              findFirst: vi.fn().mockResolvedValue(null),
            },
          },
          insert,
        }),
      ),
    };

    const caller = createCaller(createCallerContext({ db }));
    const result = await caller.sampleRequest.create({
      listingId: LISTING_ID,
      buyerMessage: "Please send a sample.",
      shippingName: "Buyer Name",
      shippingAddress1: "123 Main St",
      shippingCity: "Denver",
      shippingState: "CO",
      shippingZip: "80202",
      consentToShareAddress: true,
    });

    expect(result.created).toBe(true);
    expect(result.request.id).toBe(SAMPLE_ID);
    expect(result.request.shippingAddress?.state).toBe("CO");
    expect(db.transaction).toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("masks the buyer shipping address for sellers until approval", async () => {
    const db = {
      query: {
        sampleRequests: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: SAMPLE_ID,
              listingId: LISTING_ID,
              buyerId: BUYER_ID,
              sellerId: SELLER_ID,
              status: "requested",
              buyerMessage: null,
              shippingName: "Buyer Name",
              shippingAddress1: "123 Main St",
              shippingAddress2: null,
              shippingCity: "Denver",
              shippingState: "CO",
              shippingZip: "80202",
              shippingPhone: null,
              buyerConsentedToShareAddressAt: new Date("2026-07-30T12:00:00.000Z"),
              carrier: null,
              trackingNumber: null,
              approvedAt: null,
              declinedAt: null,
              cancelledAt: null,
              shippedAt: null,
              deliveredAt: null,
              lastActionReason: null,
              auditLog: [],
              piiPurgedAt: null,
              createdAt: new Date("2026-07-30T12:00:00.000Z"),
              updatedAt: new Date("2026-07-30T12:00:00.000Z"),
              listing: {
                id: LISTING_ID,
                title: "Engineered White Oak",
                sellerId: SELLER_ID,
              },
            },
            {
              id: SAMPLE_ID_2,
              listingId: LISTING_ID,
              buyerId: "66666666-6666-4666-8666-666666666666",
              sellerId: SELLER_ID,
              status: "approved",
              buyerMessage: null,
              shippingName: "Buyer Name",
              shippingAddress1: "123 Main St",
              shippingAddress2: null,
              shippingCity: "Denver",
              shippingState: "CO",
              shippingZip: "80202",
              shippingPhone: null,
              buyerConsentedToShareAddressAt: new Date("2026-07-30T12:00:00.000Z"),
              carrier: null,
              trackingNumber: null,
              approvedAt: new Date("2026-07-30T13:00:00.000Z"),
              declinedAt: null,
              cancelledAt: null,
              shippedAt: null,
              deliveredAt: null,
              lastActionReason: null,
              auditLog: [],
              piiPurgedAt: null,
              createdAt: new Date("2026-07-30T12:00:00.000Z"),
              updatedAt: new Date("2026-07-30T13:00:00.000Z"),
              listing: {
                id: LISTING_ID,
                title: "Engineered White Oak",
                sellerId: SELLER_ID,
              },
            },
          ]),
        },
      },
    };

    const caller = createCaller(
      createCallerContext({
        db,
        user: {
          id: SELLER_ID,
          role: "seller",
          active: true,
          verificationStatus: "verified",
          businessName: "Seller Co",
          name: "Seller User",
        },
      }),
    );

    const result = await caller.sampleRequest.getSellerRequests();

    expect(result[0].shippingAddress).toBeNull();
    expect(result[1].shippingAddress?.address1).toBe("123 Main St");
  });

  it("treats repeated terminal actions as idempotent noops", async () => {
    const deliveredRequest = {
      id: SAMPLE_ID,
      listingId: LISTING_ID,
      buyerId: BUYER_ID,
      sellerId: SELLER_ID,
      status: "delivered" as const,
      buyerMessage: null,
      shippingName: "Buyer Name",
      shippingAddress1: "123 Main St",
      shippingAddress2: null,
      shippingCity: "Denver",
      shippingState: "CO",
      shippingZip: "80202",
      shippingPhone: null,
      buyerConsentedToShareAddressAt: new Date("2026-07-30T12:00:00.000Z"),
      carrier: "UPS",
      trackingNumber: "1Z999",
      approvedAt: new Date("2026-07-30T13:00:00.000Z"),
      declinedAt: null,
      cancelledAt: null,
      shippedAt: new Date("2026-07-30T15:00:00.000Z"),
      deliveredAt: new Date("2026-07-30T17:00:00.000Z"),
      lastActionReason: "Buyer confirmed delivery",
      auditLog: [],
      piiPurgedAt: null,
      createdAt: new Date("2026-07-30T12:00:00.000Z"),
      updatedAt: new Date("2026-07-30T17:00:00.000Z"),
      listing: {
        id: LISTING_ID,
        title: "Engineered White Oak",
        sellerId: SELLER_ID,
      },
    };

    const db = {
      transaction: vi.fn(async (callback) =>
        callback({
          select: vi
            .fn()
            .mockReturnValueOnce({
              from: () => ({
                where: () => ({
                  for: vi.fn().mockResolvedValue([deliveredRequest]),
                }),
              }),
            })
            .mockReturnValueOnce({
              from: () => ({
                where: vi.fn().mockResolvedValue([deliveredRequest.listing]),
              }),
            }),
          update: vi.fn().mockReturnValue(
            createUpdateChain([
              {
                ...deliveredRequest,
                auditLog: [{ actorId: "buyer-1", idempotent: true }],
              },
            ]),
          ),
          insert: vi.fn(),
        }),
      ),
    };

    const caller = createCaller(
      createCallerContext({
        db,
        user: {
          id: BUYER_ID,
          role: "buyer",
          active: true,
          verificationStatus: "verified",
          businessName: null,
          name: "Buyer User",
        },
      }),
    );
    const result = await caller.sampleRequest.act({
      requestId: SAMPLE_ID,
      action: "deliver",
      reason: "Carrier marked the sample delivered again",
    });

    expect(result.result.kind).toBe("noop");
    expect(result.request.status).toBe("delivered");
    expect(db.transaction).toHaveBeenCalled();
    expect(result.request.auditLog).toEqual([{ idempotent: true }]);
  });
});
