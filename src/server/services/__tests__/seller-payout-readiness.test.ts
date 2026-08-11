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

const mocks = vi.hoisted(() => ({
  stripeAccountsRetrieve: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    accounts: {
      retrieve: mocks.stripeAccountsRetrieve,
    },
  },
}));

const { assertSellerPayoutReadyForOrderReservation } = await import(
  "@/server/services/seller-payout-readiness"
);

const SELLER_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "acct_test_ready";

function createSelect(seller: {
  id: string;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
}) {
  return vi.fn(() => ({
    from: () => ({
      where: () => ({
        for: vi.fn().mockResolvedValue([seller]),
      }),
    }),
  }));
}

describe("assertSellerPayoutReadyForOrderReservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts live-ready sellers and repairs a stale local readiness flag", async () => {
    mocks.stripeAccountsRetrieve.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: true,
      capabilities: { transfers: "active" },
    });

    const updateSet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue([{ id: SELLER_ID }]),
    }));
    const db = {
      select: createSelect({
        id: SELLER_ID,
        stripeAccountId: ACCOUNT_ID,
        stripeOnboardingComplete: false,
      }),
      update: vi.fn(() => ({
        set: updateSet,
      })),
    };

    await expect(
      assertSellerPayoutReadyForOrderReservation(
        db as never,
        SELLER_ID,
      ),
    ).resolves.toEqual({ stripeAccountId: ACCOUNT_ID });

    expect(mocks.stripeAccountsRetrieve).toHaveBeenCalledWith(ACCOUNT_ID, {
      timeout: 4_000,
      maxNetworkRetries: 0,
    });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeOnboardingComplete: true,
      }),
    );
  });

  it("rejects sellers whose live Stripe account cannot receive payouts", async () => {
    mocks.stripeAccountsRetrieve.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: false,
      capabilities: { transfers: "inactive" },
    });

    const updateSet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue([{ id: SELLER_ID }]),
    }));
    const db = {
      select: createSelect({
        id: SELLER_ID,
        stripeAccountId: ACCOUNT_ID,
        stripeOnboardingComplete: true,
      }),
      update: vi.fn(() => ({
        set: updateSet,
      })),
    };

    await expect(
      assertSellerPayoutReadyForOrderReservation(
        db as never,
        SELLER_ID,
      ),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Seller cannot currently accept payments for this listing.",
    });

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeOnboardingComplete: false,
      }),
    );
  });

  it("marks readiness false when Stripe says the connected account is missing", async () => {
    mocks.stripeAccountsRetrieve.mockRejectedValue({
      type: "StripeInvalidRequestError",
      code: "resource_missing",
      statusCode: 404,
    });

    const updateSet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue([{ id: SELLER_ID }]),
    }));
    const db = {
      select: createSelect({
        id: SELLER_ID,
        stripeAccountId: ACCOUNT_ID,
        stripeOnboardingComplete: true,
      }),
      update: vi.fn(() => ({
        set: updateSet,
      })),
    };

    await expect(
      assertSellerPayoutReadyForOrderReservation(
        db as never,
        SELLER_ID,
      ),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Seller cannot currently accept payments for this listing.",
    });

    expect(mocks.stripeAccountsRetrieve).toHaveBeenCalledWith(ACCOUNT_ID, {
      timeout: 4_000,
      maxNetworkRetries: 0,
    });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeOnboardingComplete: false,
      }),
    );
  });

  it("fails closed when the Stripe readiness request times out", async () => {
    mocks.stripeAccountsRetrieve.mockRejectedValue(
      new Error("Request timed out after 4000ms"),
    );

    const updateSet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue([{ id: SELLER_ID }]),
    }));
    const db = {
      select: createSelect({
        id: SELLER_ID,
        stripeAccountId: ACCOUNT_ID,
        stripeOnboardingComplete: true,
      }),
      update: vi.fn(() => ({
        set: updateSet,
      })),
    };

    await expect(
      assertSellerPayoutReadyForOrderReservation(
        db as never,
        SELLER_ID,
      ),
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message:
        "Seller payout readiness could not be confirmed. Please try again.",
    });

    expect(mocks.stripeAccountsRetrieve).toHaveBeenCalledWith(ACCOUNT_ID, {
      timeout: 4_000,
      maxNetworkRetries: 0,
    });
    expect(updateSet).not.toHaveBeenCalled();
  });
});
