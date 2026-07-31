import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOfferResponseDeadlineEvent,
  OFFER_RESPONSE_WINDOW_MS,
} from "@/lib/offer-lifecycle";

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

const { inngestSendMock } = vi.hoisted(() => ({
  inngestSendMock: vi.fn(),
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
}));

vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: vi.fn(),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: inngestSendMock,
  },
}));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { offerRouter } = await import("@/server/routers/offer");

const router = createTRPCRouter({
  offer: offerRouter,
});
const createCaller = createCallerFactory(router);

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const LISTING_ID = "33333333-3333-4333-8333-333333333333";
const OFFER_ID = "44444444-4444-4444-8444-444444444444";
const THIRD_PARTY_ID = "55555555-5555-4555-8555-555555555555";
const NOW = new Date("2026-07-30T18:00:00.000Z");

function createCallerContext(
  db: unknown,
  userId = BUYER_ID,
  role: "buyer" | "seller" = "buyer",
) {
  return {
    db,
    authUser: { id: `auth-${userId}` },
    user: {
      id: userId,
      role,
      active: true,
      verificationStatus: "verified",
      businessName: role === "seller" ? "Seller Co" : "Buyer Co",
      name: role === "seller" ? "Seller User" : "Buyer User",
      businessState: role === "seller" ? "AZ" : "CO",
    },
    supabase: {},
    clientIp: "127.0.0.1",
  } as Parameters<typeof createCaller>[0];
}

function createFreshListing() {
  return {
    id: LISTING_ID,
    sellerId: SELLER_ID,
    status: "active",
    title: "White Oak Closeout",
    allowOffers: true,
    fullLotOnly: false,
    totalSqFt: 1_000,
    floorPrice: null,
    territoryMode: "unrestricted" as const,
    allowedDestinationStates: [],
    confirmationDueAt: new Date("2026-08-15T00:00:00.000Z"),
    lastConfirmedAt: new Date("2026-07-29T00:00:00.000Z"),
  };
}

function createExpiredOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: OFFER_ID,
    listingId: LISTING_ID,
    buyerId: BUYER_ID,
    sellerId: SELLER_ID,
    offerPricePerSqFt: 2.25,
    counterPricePerSqFt: null,
    quantitySqFt: 400,
    totalPrice: 900,
    message: null,
    counterMessage: null,
    currentRound: 1,
    lastActorId: BUYER_ID,
    status: "pending" as const,
    orderId: null,
    expiresAt: new Date(NOW.getTime() - 1),
    createdAt: new Date("2026-07-28T17:59:59.999Z"),
    updatedAt: new Date("2026-07-28T17:59:59.999Z"),
    listing: {
      id: LISTING_ID,
      title: "White Oak Closeout",
    },
    buyer: {
      id: BUYER_ID,
      name: "Buyer User",
      role: "buyer",
      businessCity: "Denver",
      businessState: "CO",
      verificationStatus: "verified",
    },
    seller: {
      id: SELLER_ID,
      name: "Seller User",
      role: "seller",
      businessCity: "Phoenix",
      businessState: "AZ",
      verificationStatus: "verified",
    },
    ...overrides,
  };
}

describe("offer response deadlines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives every initial offer an explicit 48-hour response deadline", async () => {
    let insertedOfferValues: Record<string, unknown> | undefined;
    const initialEventValues = vi.fn();
    const txInsert = vi
      .fn()
      .mockImplementationOnce(() => ({
        values: vi.fn((values: Record<string, unknown>) => {
          insertedOfferValues = values;
          return {
            returning: vi.fn().mockResolvedValue([
              {
                id: OFFER_ID,
                ...values,
              },
            ]),
          };
        }),
      }))
      .mockImplementationOnce(() => ({
        values: initialEventValues.mockResolvedValue(undefined),
      }));
    const tx = {
      insert: txInsert,
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    };
    const db = {
      query: {
        listings: {
          findFirst: vi.fn().mockResolvedValue(createFreshListing()),
        },
        offers: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        notifications: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      transaction: vi.fn(
        async (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
      insert: vi.fn(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      })),
    };

    const caller = createCaller(createCallerContext(db));
    await caller.offer.createOffer({
      listingId: LISTING_ID,
      offerPricePerSqFt: 2.25,
      quantitySqFt: 400,
      message: "Ready to purchase.",
    });

    expect(insertedOfferValues?.expiresAt).toEqual(
      new Date(NOW.getTime() + OFFER_RESPONSE_WINDOW_MS),
    );
    expect(initialEventValues).toHaveBeenCalledWith(
      expect.objectContaining({
        offerId: OFFER_ID,
        eventType: "initial_offer",
      }),
    );
    expect(inngestSendMock).toHaveBeenCalledWith(
      buildOfferResponseDeadlineEvent(
        OFFER_ID,
        new Date(NOW.getTime() + OFFER_RESPONSE_WINDOW_MS),
      ),
    );
  });

  it.each([
    {
      action: "counter",
      userId: SELLER_ID,
      role: "seller" as const,
      invoke: (caller: ReturnType<typeof createCaller>) =>
        caller.offer.counterOffer({
          offerId: OFFER_ID,
          pricePerSqFt: 2.4,
          message: "Countering.",
        }),
    },
    {
      action: "accept",
      userId: SELLER_ID,
      role: "seller" as const,
      invoke: (caller: ReturnType<typeof createCaller>) =>
        caller.offer.acceptOffer({ offerId: OFFER_ID }),
    },
    {
      action: "reject",
      userId: SELLER_ID,
      role: "seller" as const,
      invoke: (caller: ReturnType<typeof createCaller>) =>
        caller.offer.rejectOffer({
          offerId: OFFER_ID,
          message: "Declining.",
        }),
    },
    {
      action: "withdraw",
      userId: BUYER_ID,
      role: "buyer" as const,
      invoke: (caller: ReturnType<typeof createCaller>) =>
        caller.offer.withdrawOffer({ offerId: OFFER_ID }),
    },
  ])(
    "atomically records an expire event before blocking a late $action",
    async ({ invoke, role, userId }) => {
      const expireEventValues = vi.fn().mockResolvedValue(undefined);
      const tx = {
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([{ id: OFFER_ID }]),
            })),
          })),
        })),
        insert: vi.fn(() => ({
          values: expireEventValues,
        })),
      };
      const db = {
        query: {
          offers: {
            findFirst: vi.fn().mockResolvedValue(createExpiredOffer()),
          },
        },
        transaction: vi.fn(
          async (callback: (value: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      };

      const caller = createCaller(createCallerContext(db, userId, role));

      await expect(invoke(caller)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "This offer has expired",
      });
      expect(expireEventValues).toHaveBeenCalledTimes(1);
      expect(expireEventValues).toHaveBeenCalledWith(
        expect.objectContaining({
          offerId: OFFER_ID,
          actorId: SELLER_ID,
          eventType: "expire",
          pricePerSqFt: 2.25,
          quantitySqFt: 400,
          totalPrice: 900,
          message:
            "Automatically expired after the 48-hour response window.",
        }),
      );
    },
  );

  it("does not duplicate the expire event when another request won the transition", async () => {
    const expireEventValues = vi.fn();
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: expireEventValues,
      })),
    };
    const db = {
      query: {
        offers: {
          findFirst: vi.fn().mockResolvedValue(createExpiredOffer()),
        },
      },
      transaction: vi.fn(
        async (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    const caller = createCaller(
      createCallerContext(db, SELLER_ID, "seller"),
    );
    await expect(
      caller.offer.acceptOffer({ offerId: OFFER_ID }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "This offer has expired",
    });

    expect(expireEventValues).not.toHaveBeenCalled();
  });

  it("does not let an unrelated user trigger an expired offer transition", async () => {
    const db = {
      query: {
        offers: {
          findFirst: vi.fn().mockResolvedValue(createExpiredOffer()),
        },
      },
      transaction: vi.fn(),
    };

    const caller = createCaller(
      createCallerContext(db, THIRD_PARTY_ID, "buyer"),
    );
    await expect(
      caller.offer.acceptOffer({ offerId: OFFER_ID }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You are not a party to this offer",
    });

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("schedules the fresh deadline after a successful manual counter", async () => {
    const currentOffer = createExpiredOffer({
      expiresAt: new Date(NOW.getTime() + 60_000),
    });
    const counterEventValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([
              {
                ...currentOffer,
                ...values,
              },
            ]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: counterEventValues,
      })),
    };
    const db = {
      query: {
        offers: {
          findFirst: vi.fn().mockResolvedValue(currentOffer),
        },
        notifications: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      transaction: vi.fn(
        async (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
      insert: vi.fn(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      })),
    };

    const caller = createCaller(
      createCallerContext(db, SELLER_ID, "seller"),
    );
    await caller.offer.counterOffer({
      offerId: OFFER_ID,
      pricePerSqFt: 2.4,
      message: "Countering.",
    });

    expect(inngestSendMock).toHaveBeenCalledWith(
      buildOfferResponseDeadlineEvent(
        OFFER_ID,
        new Date(NOW.getTime() + OFFER_RESPONSE_WINDOW_MS),
      ),
    );
    expect(counterEventValues).toHaveBeenCalledWith(
      expect.objectContaining({
        offerId: OFFER_ID,
        eventType: "counter",
      }),
    );
  });

  it("does not append a counter event when a concurrent response changed the offer", async () => {
    const counterEventValues = vi.fn();
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: counterEventValues,
      })),
    };
    const db = {
      query: {
        offers: {
          findFirst: vi.fn().mockResolvedValue(
            createExpiredOffer({
              expiresAt: new Date(NOW.getTime() + 60_000),
            }),
          ),
        },
      },
      transaction: vi.fn(
        async (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    const caller = createCaller(
      createCallerContext(db, SELLER_ID, "seller"),
    );
    await expect(
      caller.offer.counterOffer({
        offerId: OFFER_ID,
        pricePerSqFt: 2.4,
        message: "Countering.",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This offer changed or expired. Refresh before responding.",
    });

    expect(counterEventValues).not.toHaveBeenCalled();
  });
});
