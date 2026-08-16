import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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
process.env.NEXT_PUBLIC_APP_URL ??= "https://www.plankmarket.com";

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
  redis: { get: vi.fn(), set: vi.fn() },
}));

vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: vi.fn(),
}));

vi.mock("@/lib/email/send", () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

const serviceAdmin = {
  updateUserById: vi.fn(),
  deleteUser: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({
    auth: { admin: serviceAdmin },
  })),
  createClient: vi.fn(),
}));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { authRouter } = await import("@/server/routers/auth");
const { listingRouter } = await import("@/server/routers/listing");
const { paymentRouter } = await import("@/server/routers/payment");
const { canApplyPaymentIntentSucceeded } = await import(
  "@/server/services/order-transitions"
);
const { hasPersistedProviderPickupEvidence } = await import(
  "@/server/services/payout-eligibility"
);
const {
  freightSnapshotMatchesListing,
  requireLiveDispatchShipmentId,
} = await import("@/server/services/shipping-workflow");
const { canIssuePartialOrderRefund } = await import("@/server/services/refund");

const appRouter = createTRPCRouter({
  auth: authRouter,
  listing: listingRouter,
  payment: paymentRouter,
});
const createCaller = createCallerFactory(appRouter);

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const AUTH_USER_ID = "auth-user-1";

function sessionUser(role: "buyer" | "seller") {
  return {
    id: role === "buyer" ? BUYER_ID : SELLER_ID,
    role,
    active: true,
    verificationStatus: "verified" as const,
    businessName: `${role} Co`,
    name: `${role} User`,
    proStatus: "active",
    proExpiresAt: null,
  };
}

function authedContext(params: {
  role: "buyer" | "seller";
  db?: Record<string, unknown>;
  supabase?: Record<string, unknown>;
}) {
  return {
    db: params.db ?? {},
    authUser: { id: `auth-${params.role}` },
    user: sessionUser(params.role),
    supabase: params.supabase ?? {},
    clientIp: "127.0.0.1",
    getAuthAssurance: async () => ({
      currentLevel: "aal1",
      nextLevel: "aal1",
      recentVerificationSatisfied: false,
    }),
  } as unknown as Parameters<typeof createCaller>[0];
}

describe("core marketplace loops", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceAdmin.updateUserById.mockResolvedValue({ error: null });
    serviceAdmin.deleteUser.mockResolvedValue({ error: null });
  });

  describe("register and role isolation", () => {
    it("creates an app profile for the chosen buyer or seller role", async () => {
      const inserted = {
        id: BUYER_ID,
        email: "buyer@example.com",
        name: "Buyer Person",
        role: "buyer",
        businessName: "Buyer Co",
        verificationStatus: "unverified",
      };
      const db = {
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([inserted]),
          })),
        })),
      };
      const supabase = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: AUTH_USER_ID,
                email: "buyer@example.com",
                app_metadata: {},
                email_confirmed_at: null,
              },
            },
            error: null,
          }),
        },
      };
      const caller = createCaller(
        authedContext({ role: "buyer", db, supabase }),
      );

      const result = await caller.auth.register({
        email: "buyer@example.com",
        password: "password12",
        name: "Buyer Person",
        role: "buyer",
        businessName: "Buyer Co",
        zipCode: "84101",
      });

      expect(result.user.role).toBe("buyer");
      expect(result.user.email).toBe("buyer@example.com");
      expect(result.user.verificationStatus).toBe("unverified");
      expect(serviceAdmin.updateUserById).toHaveBeenCalledWith(
        AUTH_USER_ID,
        expect.objectContaining({
          app_metadata: expect.objectContaining({ role: "buyer" }),
        }),
      );
      expect(db.insert).toHaveBeenCalled();
    });

    it("rejects invalid register input before creating an auth user", async () => {
      const signUp = vi.fn();
      const caller = createCaller(
        authedContext({
          role: "buyer",
          supabase: { auth: { signUp } },
        }),
      );

      await expect(
        caller.auth.register({
          email: "not-an-email",
          password: "short",
          name: "A",
          role: "buyer",
          businessName: "B",
          zipCode: "12",
        }),
      ).rejects.toBeTruthy();
      expect(signUp).not.toHaveBeenCalled();
    });

    it("rejects a buyer writing a seller listing", async () => {
      const caller = createCaller(authedContext({ role: "buyer" }));

      await expect(
        caller.listing.create({
          title: "Oak plank lot",
        } as never),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Only sellers can perform this action",
      });
    });

    it("rejects a seller creating a buyer payment intent", async () => {
      const transaction = vi.fn();
      const caller = createCaller(
        authedContext({
          role: "seller",
          db: { transaction },
        }),
      );

      await expect(
        caller.payment.createPaymentIntent({
          orderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Only buyers can perform this action",
      });
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  describe("payment apply, payout, and refund gates", () => {
    it("applies a succeeded PaymentIntent only to the matching reserved pending order", () => {
      const matching = {
        orderStatus: "pending",
        paymentStatus: "pending",
        storedPaymentIntentId: "pi_live_1",
        eventPaymentIntentId: "pi_live_1",
        inventoryReleasedAt: null,
      };
      expect(canApplyPaymentIntentSucceeded(matching)).toBe(true);
      expect(
        canApplyPaymentIntentSucceeded({
          ...matching,
          eventPaymentIntentId: "pi_other",
        }),
      ).toBe(false);
      expect(
        canApplyPaymentIntentSucceeded({
          ...matching,
          orderStatus: "cancelled",
        }),
      ).toBe(false);
    });

    it("does not treat a dry-run or unmatched shipment as payout-eligible", () => {
      const evidence = {
        selectedQuoteId: "123",
        shipmentQuoteId: "123",
        priority1ShipmentId: "456",
        shipmentStatus: "in_transit",
        shipmentIsDryRun: false,
        shipmentTrackingEvents: [
          {
            timestamp: "2026-07-11T18:00:00.000Z",
            status: "in_transit",
          },
        ],
      };
      expect(hasPersistedProviderPickupEvidence(evidence)).toBe(true);
      expect(
        hasPersistedProviderPickupEvidence({
          ...evidence,
          shipmentIsDryRun: true,
        }),
      ).toBe(false);
      expect(
        hasPersistedProviderPickupEvidence({
          ...evidence,
          shipmentQuoteId: "999",
        }),
      ).toBe(false);
    });

    it("blocks partial refunds until a seller transfer exists", () => {
      expect(
        canIssuePartialOrderRefund({ stripeTransferId: null }),
      ).toBe(false);
      expect(
        canIssuePartialOrderRefund({ stripeTransferId: "tr_live" }),
      ).toBe(true);
    });
  });

  describe("shipping consume and dispatch", () => {
    it("refuses a quote snapshot whose freight no longer matches the listing", () => {
      const snapshot = {
        originLocation: { address: { postalCode: "84101" } },
        lineItems: [
          {
            freightClass: "125",
            totalWeight: 4200,
            length: 48,
            width: 40,
            height: 52,
            units: 3,
          },
        ],
      };
      const listing = {
        locationZip: "84101",
        freightClass: "125",
        palletWeight: 1400,
        palletLength: 48,
        palletWidth: 40,
        palletHeight: 52,
      };
      expect(
        freightSnapshotMatchesListing({
          snapshot,
          listing,
          palletsNeeded: 3,
        }),
      ).toBe(true);
      expect(
        freightSnapshotMatchesListing({
          snapshot,
          listing: { ...listing, freightClass: "70" },
          palletsNeeded: 3,
        }),
      ).toBe(false);
    });

    it("does not finalize dispatch without a live Priority1 shipment id", () => {
      expect(() => requireLiveDispatchShipmentId(null)).toThrow(
        /did not include a shipment ID/,
      );
      expect(requireLiveDispatchShipmentId(88)).toBe(88);
    });
  });
});
