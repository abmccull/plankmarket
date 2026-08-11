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

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const BUYER_ID = "22222222-2222-4222-8222-222222222222";
const SELLER_ID = "33333333-3333-4333-8333-333333333333";
const CURRENT_USER_ID = BUYER_ID;
const REMOTE_MESSAGE_ID = "44444444-4444-4444-8444-444444444444";
const OWN_MESSAGE_ID = "55555555-5555-4555-8555-555555555555";

function createCallerWithDb(db: Record<string, unknown>) {
  return createCaller({
    db,
    authUser: { id: "auth-user" },
    user: {
      id: CURRENT_USER_ID,
      role: "buyer" as const,
      active: true,
      verificationStatus: "verified",
    },
    supabase: {},
    clientIp: "127.0.0.1",
  } as unknown as Parameters<typeof createCaller>[0]);
}

describe("message read acknowledgement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not write read timestamps during getMessages polling", async () => {
    const db = {
      query: {
        conversations: {
          findFirst: vi.fn().mockResolvedValue({
            id: CONVERSATION_ID,
            buyerId: BUYER_ID,
            sellerId: SELLER_ID,
          }),
        },
        messages: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: REMOTE_MESSAGE_ID,
              conversationId: CONVERSATION_ID,
              senderId: SELLER_ID,
              body: "Latest message",
              createdAt: new Date("2026-07-31T10:00:00.000Z"),
              sender: {
                id: SELLER_ID,
                name: "Seller",
                role: "seller",
                businessCity: "Dallas",
                businessState: "TX",
                verificationStatus: "verified",
              },
            },
          ]),
        },
        orders: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      update: vi.fn(),
    };

    const caller = createCallerWithDb(db);

    await caller.message.getMessages({
      conversationId: CONVERSATION_ID,
      limit: 100,
    });

    expect(db.query.messages.findMany).toHaveBeenCalledOnce();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("marks only a newer inbound message as read", async () => {
    const update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { lastReadAt: new Date("2026-07-31T10:05:00.000Z") },
          ]),
        }),
      }),
    });

    const db = {
      query: {
        conversations: {
          findFirst: vi.fn().mockResolvedValue({
            id: CONVERSATION_ID,
            buyerId: BUYER_ID,
            sellerId: SELLER_ID,
            buyerLastReadAt: new Date("2026-07-31T10:00:00.000Z"),
            sellerLastReadAt: null,
          }),
        },
        messages: {
          findFirst: vi.fn().mockResolvedValue({
            id: REMOTE_MESSAGE_ID,
            conversationId: CONVERSATION_ID,
            senderId: SELLER_ID,
            createdAt: new Date("2026-07-31T10:05:00.000Z"),
          }),
        },
      },
      update,
    };

    const caller = createCallerWithDb(db);

    const result = await caller.message.markAsRead({
      conversationId: CONVERSATION_ID,
      latestMessageId: REMOTE_MESSAGE_ID,
    });

    expect(result).toMatchObject({
      updated: true,
      lastReadAt: new Date("2026-07-31T10:05:00.000Z"),
    });
    expect(update).toHaveBeenCalledOnce();
  });

  it("ignores explicit acknowledgements for the caller's own message", async () => {
    const db = {
      query: {
        conversations: {
          findFirst: vi.fn().mockResolvedValue({
            id: CONVERSATION_ID,
            buyerId: BUYER_ID,
            sellerId: SELLER_ID,
            buyerLastReadAt: null,
            sellerLastReadAt: null,
          }),
        },
        messages: {
          findFirst: vi.fn().mockResolvedValue({
            id: OWN_MESSAGE_ID,
            conversationId: CONVERSATION_ID,
            senderId: CURRENT_USER_ID,
            createdAt: new Date("2026-07-31T10:05:00.000Z"),
          }),
        },
      },
      update: vi.fn(),
    };

    const caller = createCallerWithDb(db);

    const result = await caller.message.markAsRead({
      conversationId: CONVERSATION_ID,
      latestMessageId: OWN_MESSAGE_ID,
    });

    expect(result).toEqual({
      updated: false,
      lastReadAt: null,
    });
    expect(db.update).not.toHaveBeenCalled();
  });
});
