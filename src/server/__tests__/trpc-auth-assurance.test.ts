import { describe, expect, it, vi } from "vitest";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= "pk_test_123";

vi.mock("@/server/db", () => ({
  db: {},
}));

vi.mock("@/server/db/schema", () => ({
  users: {},
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/redis/client", () => ({
  getRedisClient: () => ({}),
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

vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: vi.fn(),
}));

import {
  MFA_REQUIRED_MESSAGE,
  RECENT_AUTH_REQUIRED_MESSAGE,
  type AuthAssuranceState,
} from "@/lib/auth/auth-assurance";

const {
  adminProcedure,
  createCallerFactory,
  createTRPCRouter,
  strictSellerProcedure,
} = await import("@/server/trpc");

const router = createTRPCRouter({
  admin: createTRPCRouter({
    dashboard: adminProcedure.query(() => "ok"),
    refundOrder: adminProcedure.mutation(() => "ok"),
    retryTransfer: adminProcedure.mutation(() => "ok"),
    suspendUser: adminProcedure.mutation(() => "ok"),
    unsuspendUser: adminProcedure.mutation(() => "ok"),
    forceCancelOrder: adminProcedure.mutation(() => "ok"),
    updateUser: adminProcedure.mutation(() => "ok"),
    updateVerification: adminProcedure.mutation(() => "ok"),
    updateSetting: adminProcedure.mutation(() => "ok"),
    updateSettings: adminProcedure.mutation(() => "ok"),
    setListingTaxCode: adminProcedure.mutation(() => "ok"),
  }),
  dispute: createTRPCRouter({
    resolve: adminProcedure.mutation(() => "ok"),
  }),
  promotion: createTRPCRouter({
    adminCancel: adminProcedure.mutation(() => "ok"),
  }),
  payment: createTRPCRouter({
    createSource: strictSellerProcedure.mutation(() => "ok"),
    createConnectAccount: strictSellerProcedure.mutation(() => "ok"),
    createAccountSession: strictSellerProcedure.mutation(() => "ok"),
    createLoginLink: strictSellerProcedure.mutation(() => "ok"),
  }),
});

const createCaller = createCallerFactory(router);

function createContext(params: {
  role: "admin" | "seller";
  assurance: AuthAssuranceState;
}) {
  return {
    db: {},
    authUser: {
      id: `auth-${params.role}`,
    },
    user: {
      id: `${params.role}-user`,
      role: params.role,
      active: true,
      verificationStatus: "verified",
      name: "Test User",
      businessName: "Test Business",
      email: "test@example.com",
      stripeOnboardingComplete: true,
    },
    supabase: {},
    clientIp: "127.0.0.1",
    getAuthAssurance: async () => params.assurance,
  } as unknown as Parameters<typeof createCaller>[0];
}

function assurance(overrides?: Partial<AuthAssuranceState>): AuthAssuranceState {
  return {
    currentLevel: "aal2",
    nextLevel: "aal2",
    lastFactorVerificationAt: new Date().toISOString(),
    recentVerificationSatisfied: true,
    ...overrides,
  };
}

describe("tRPC auth assurance middleware", () => {
  it("denies admin procedures when the session is only AAL1", async () => {
    const caller = createCaller(
      createContext({
        role: "admin",
        assurance: assurance({
          currentLevel: "aal1",
          nextLevel: "aal2",
          recentVerificationSatisfied: false,
        }),
      }),
    );

    await expect(caller.admin.dashboard()).rejects.toMatchObject({
      message: MFA_REQUIRED_MESSAGE,
    });
  });

  it("allows admin procedures once the session is AAL2", async () => {
    const caller = createCaller(
      createContext({
        role: "admin",
        assurance: assurance(),
      }),
    );

    await expect(caller.admin.dashboard()).resolves.toBe("ok");
  });

  it("allows non-financial seller strict procedures at AAL1", async () => {
    const caller = createCaller(
      createContext({
        role: "seller",
        assurance: assurance({
          currentLevel: "aal1",
          nextLevel: "aal2",
          recentVerificationSatisfied: false,
        }),
      }),
    );

    await expect(caller.payment.createSource()).resolves.toBe("ok");
  });

  it("denies payment.createAccountSession when the seller session is only AAL1", async () => {
    const caller = createCaller(
      createContext({
        role: "seller",
        assurance: assurance({
          currentLevel: "aal1",
          nextLevel: "aal2",
          recentVerificationSatisfied: false,
        }),
      }),
    );

    await expect(caller.payment.createAccountSession()).rejects.toMatchObject({
      message: MFA_REQUIRED_MESSAGE,
    });
  });

  it("denies payment.createAccountSession when an admin invokes it at AAL1", async () => {
    const caller = createCaller(
      createContext({
        role: "admin",
        assurance: assurance({
          currentLevel: "aal1",
          nextLevel: "aal2",
          recentVerificationSatisfied: false,
        }),
      }),
    );

    await expect(caller.payment.createAccountSession()).rejects.toMatchObject({
      message: MFA_REQUIRED_MESSAGE,
    });
  });

  it("denies payment.createLoginLink when recent MFA proof has expired", async () => {
    const caller = createCaller(
      createContext({
        role: "seller",
        assurance: assurance({
          recentVerificationSatisfied: false,
          lastFactorVerificationAt: "2026-08-02T00:00:00.000Z",
        }),
      }),
    );

    await expect(caller.payment.createLoginLink()).rejects.toMatchObject({
      message: RECENT_AUTH_REQUIRED_MESSAGE,
    });
  });

  it("allows payment.createConnectAccount once MFA is recent and AAL2", async () => {
    const caller = createCaller(
      createContext({
        role: "seller",
        assurance: assurance(),
      }),
    );

    await expect(caller.payment.createConnectAccount()).resolves.toBe("ok");
  });

  it.each([
    ["admin.refundOrder", (caller: ReturnType<typeof createCaller>) => caller.admin.refundOrder()],
    ["admin.retryTransfer", (caller: ReturnType<typeof createCaller>) => caller.admin.retryTransfer()],
    ["admin.suspendUser", (caller: ReturnType<typeof createCaller>) => caller.admin.suspendUser()],
    ["admin.unsuspendUser", (caller: ReturnType<typeof createCaller>) => caller.admin.unsuspendUser()],
    ["admin.forceCancelOrder", (caller: ReturnType<typeof createCaller>) => caller.admin.forceCancelOrder()],
    ["admin.updateUser", (caller: ReturnType<typeof createCaller>) => caller.admin.updateUser()],
    ["admin.updateVerification", (caller: ReturnType<typeof createCaller>) => caller.admin.updateVerification()],
    ["admin.updateSetting", (caller: ReturnType<typeof createCaller>) => caller.admin.updateSetting()],
    ["admin.updateSettings", (caller: ReturnType<typeof createCaller>) => caller.admin.updateSettings()],
    ["admin.setListingTaxCode", (caller: ReturnType<typeof createCaller>) => caller.admin.setListingTaxCode()],
    ["dispute.resolve", (caller: ReturnType<typeof createCaller>) => caller.dispute.resolve()],
    ["promotion.adminCancel", (caller: ReturnType<typeof createCaller>) => caller.promotion.adminCancel()],
  ])(
    "requires recent MFA for %s",
    async (_path, invoke) => {
      const caller = createCaller(
        createContext({
          role: "admin",
          assurance: assurance({
            recentVerificationSatisfied: false,
            lastFactorVerificationAt: "2026-08-02T00:00:00.000Z",
          }),
        }),
      );

      await expect(invoke(caller)).rejects.toMatchObject({
        message: RECENT_AUTH_REQUIRED_MESSAGE,
      });
    },
  );
});
