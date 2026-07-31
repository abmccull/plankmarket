import { describe, expect, it, vi } from "vitest";

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

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { orderRouter } = await import("@/server/routers/order");

const router = createTRPCRouter({
  order: orderRouter,
});
const createCaller = createCallerFactory(router);

const SELLER_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";

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
    },
    supabase: {},
    clientIp: "127.0.0.1",
  } as Parameters<typeof createCaller>[0];
}

describe("orderRouter seller status concurrency", () => {
  it("revalidates under a row lock and cannot cancel over a concurrent captured payment", async () => {
    const initialOrder = {
      id: ORDER_ID,
      status: "pending" as const,
      escrowStatus: "held",
      paymentStatus: "pending",
      selectedQuoteId: null,
      stripePaymentIntentId: null,
      totalPrice: 5_000,
    };
    const lockedOrder = {
      ...initialOrder,
      status: "confirmed" as const,
      paymentStatus: "succeeded",
    };
    const update = vi.fn();
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn().mockResolvedValue([lockedOrder]),
          })),
        })),
      })),
      update,
    };
    const db = {
      query: {
        orders: {
          findFirst: vi.fn().mockResolvedValue(initialOrder),
        },
      },
      transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const caller = createCaller(createCallerContext(db));

    await expect(
      caller.order.updateStatus({
        orderId: ORDER_ID,
        status: "cancelled",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining(
        "Paid orders must be cancelled by an admin",
      ),
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(tx.select).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });
});
