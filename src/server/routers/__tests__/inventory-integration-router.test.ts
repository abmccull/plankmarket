import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/plankmarket_test";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";
process.env.UPSTASH_REDIS_REST_URL ??= "https://example.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN ??= "upstash-token";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test";

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

const appendAuditEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("@/server/services/audit-ledger", () => ({
  appendAuditEvent,
}));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const {
  inventoryIntegrationRouter,
} = await import("@/server/routers/inventory-integration");

const router = createTRPCRouter({
  inventoryIntegration: inventoryIntegrationRouter,
});

const createCaller = createCallerFactory(router);

function createCallerContext(overrides: Record<string, unknown> = {}) {
  return {
    db: overrides.db,
    authUser: { id: "auth-seller-1" },
    user: {
      id: "11111111-1111-4111-8111-111111111111",
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
    ...overrides,
  } as Parameters<typeof createCaller>[0];
}

describe("inventoryIntegrationRouter source creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates bearer sources and returns the plaintext key once", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Denver ERP",
        externalSourceId: "denver-erp",
        authMode: "bearer",
        status: "active",
        apiKeyHint: "pm_inv_...abc123",
      },
    ]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const db = {
      transaction: vi.fn(
        async (callback: (tx: { insert: typeof insert }) => unknown) =>
          callback({ insert }),
      ),
    };

    const caller = createCaller(createCallerContext({ db }));
    const result = await caller.inventoryIntegration.createSource({
      name: "Denver ERP",
      externalSourceId: "denver-erp",
      authMode: "bearer",
      staleAfterMinutes: 1440,
    });

    expect(result.source).toMatchObject({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Denver ERP",
      externalSourceId: "denver-erp",
      authMode: "bearer",
      status: "active",
    });
    expect(result.apiKey).toMatch(/^pm_inv_/);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerId: "11111111-1111-4111-8111-111111111111",
        authMode: "bearer",
      }),
    );
    expect(appendAuditEvent).toHaveBeenCalledOnce();
  });

  it("rejects signed source creation before any database write", async () => {
    const db = {
      transaction: vi.fn(),
    };

    const caller = createCaller(createCallerContext({ db }));

    await expect(
      caller.inventoryIntegration.createSource({
        name: "Legacy ERP",
        externalSourceId: "legacy-erp",
        authMode: "signed",
        staleAfterMinutes: 1440,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Signed inventory sources are no longer supported",
    });

    expect(db.transaction).not.toHaveBeenCalled();
    expect(appendAuditEvent).not.toHaveBeenCalled();
  });
});
