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
}));

vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: vi.fn(),
  logContentViolation: vi.fn(),
}));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { messageRouter } = await import("@/server/routers/message");

const router = createTRPCRouter({ message: messageRouter });
const createCaller = createCallerFactory(router);

const LISTING_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";

function createContext(listing: Record<string, unknown>) {
  const insert = vi.fn();
  const db = {
    query: {
      listings: {
        findFirst: vi.fn().mockResolvedValue(listing),
      },
      conversations: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    insert,
  };

  return {
    caller: createCaller({
      db,
      authUser: { id: "auth-buyer" },
      user: {
        id: "33333333-3333-4333-8333-333333333333",
        role: "buyer" as const,
        active: true,
        verificationStatus: "verified",
        businessState: "CO",
      },
      supabase: {},
      clientIp: "127.0.0.1",
    } as unknown as Parameters<typeof createCaller>[0]),
    db,
  };
}

describe("message listing visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not open a conversation for a stale listing", async () => {
    const { caller, db } = createContext({
      id: LISTING_ID,
      sellerId: SELLER_ID,
      status: "active",
      lastConfirmedAt: new Date("2026-01-01T00:00:00Z"),
      confirmationDueAt: new Date("2026-01-15T00:00:00Z"),
      territoryMode: "unrestricted",
      allowedDestinationStates: null,
    });

    await expect(
      caller.message.getOrCreateConversation({ listingId: LISTING_ID }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Listing is not available for messaging",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("does not open a conversation outside the verified buyer territory", async () => {
    const { caller, db } = createContext({
      id: LISTING_ID,
      sellerId: SELLER_ID,
      status: "active",
      lastConfirmedAt: new Date("2026-07-30T00:00:00Z"),
      confirmationDueAt: new Date("2030-08-15T00:00:00Z"),
      territoryMode: "allowed_states",
      allowedDestinationStates: ["UT"],
    });

    await expect(
      caller.message.getOrCreateConversation({ listingId: LISTING_ID }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Listing is not available for messaging",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });
});
