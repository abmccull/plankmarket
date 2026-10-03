import { PgDialect } from "drizzle-orm/pg-core";
import { findCheckoutReplay } from "@/server/services/checkout-idempotency";
vi.mock("@/server/services/checkout-idempotency", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/services/checkout-idempotency")>(),
  findCheckoutReplay: vi.fn(async () => undefined),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createTRPCContext } from "@/server/trpc";
import { MFA_REQUIRED_MESSAGE } from "@/lib/auth/auth-assurance";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/plankmarket_test";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";
process.env.STRIPE_SECRET_KEY ??= "sk_test_123";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test_123";
process.env.STRIPE_TAX_MODE ??= "disabled";
process.env.STRIPE_TAX_POLICY_VERSION ??= "1";
process.env.STRIPE_TAX_LEGAL_DECISION_ACKNOWLEDGED ??= "false";
process.env.STRIPE_TAX_BUYER_FEE_TREATMENT ??= "undecided";
process.env.UPLOADTHING_TOKEN ??= "uploadthing-test";
process.env.UPSTASH_REDIS_REST_URL ??= "https://example.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN ??= "upstash-token";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= "pk_test_123";

const mocks = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisGetdel: vi.fn(),
  redisEval: vi.fn(),
  stripeAccountsRetrieve: vi.fn(),
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
  redis: {
    get: mocks.redisGet,
    getdel: mocks.redisGetdel,
    eval: mocks.redisEval,
  },
}));
vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: vi.fn(),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    accounts: {
      retrieve: mocks.stripeAccountsRetrieve,
    },
  },
}));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { orderRouter } = await import("@/server/routers/order");
const { authRouter } = await import("@/server/routers/auth");

const router = createTRPCRouter({ order: orderRouter, auth: authRouter });
const createCaller = createCallerFactory(router);
beforeEach(() => { vi.mocked(findCheckoutReplay).mockReset().mockResolvedValue(undefined); });

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const LISTING_ID = "33333333-3333-4333-8333-333333333333";
const OFFER_ID = "44444444-4444-4444-8444-444444444444";

function createContext(db: Record<string, unknown>) {
  return {
    db,
    authUser: { id: "auth-buyer-1" },
    user: {
      id: BUYER_ID,
      role: "buyer" as const,
      active: true,
      verificationStatus: "verified",
      businessState: "CO",
      name: "Buyer User",
      businessName: "Buyer Co",
    },
    supabase: {},
    clientIp: "127.0.0.1",
  } as unknown as Awaited<ReturnType<typeof createTRPCContext>>;
}

function createActiveListing() {
  return {
    id: LISTING_ID,
    sellerId: SELLER_ID,
    status: "active",
    title: "White Oak Closeout",
    totalSqFt: 1200,
    askPricePerSqFt: 2.49,
    buyNowPrice: 2.49,
    fullLotOnly: false,
    partialQuantityMarkupPercent: null,
    moq: null,
    moqUnit: "sqft" as const,
    sqFtPerBox: 20,
    boxesPerPallet: 30,
    territoryMode: "unrestricted" as const,
    allowedDestinationStates: [],
    confirmationDueAt: new Date("2099-08-15T12:00:00.000Z"),
    lastConfirmedAt: new Date("2099-08-01T12:00:00.000Z"),
    freightPaymentMode: "buyer_pays" as const,
    sellerFreightStates: [],
    freightDropCharge: null,
  };
}

function createPendingOrderCountSelect() {
  return {
    from: () => ({
      where: vi.fn().mockResolvedValue([{ count: 0 }]),
    }),
  };
}

function createSellerReadinessSelect() {
  return {
    from: () => ({
      where: () => ({
        for: vi.fn().mockResolvedValue([
          {
            id: SELLER_ID,
            stripeAccountId: "acct_seller_1",
            stripeOnboardingComplete: true,
          },
        ]),
      }),
    }),
  };
}

describe("order detail admin assurance", () => {
  it("keeps the real admin session and profile bootstrap usable before MFA", async () => {
    const context = createContext({});
    context.user!.role = "admin";
    context.getAuthAssurance = vi.fn().mockResolvedValue({ currentLevel: "aal1", nextLevel: "aal2", lastFactorVerificationAt: null, recentVerificationSatisfied: false });
    context.supabase = { auth: { mfa: { listFactors: vi.fn().mockResolvedValue({ data: { totp: [] }, error: null }) } } } as unknown as typeof context.supabase;
    const caller = createCaller(context);
    await expect(caller.auth.getProfile()).resolves.toMatchObject({ role: "admin" });
    await expect(caller.auth.getSession()).resolves.toMatchObject({ isAuthenticated: true, user: { role: "admin" } });
  });

  it.each(["aal1", "unavailable"])("denies %s admin before reading an order", async (state) => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const context = createContext({ query: { orders: { findFirst } } });
    context.user!.role = "admin";
    context.getAuthAssurance = state === "unavailable"
      ? vi.fn().mockRejectedValue(new Error("Auth unavailable"))
      : vi.fn().mockResolvedValue({ currentLevel: "aal1", nextLevel: "aal2", lastFactorVerificationAt: null, recentVerificationSatisfied: false });
    const caller = createCaller(context);
    await expect(caller.order.getById({ id: OFFER_ID })).rejects.toMatchObject(state === "aal1" ? { code: "FORBIDDEN", message: MFA_REQUIRED_MESSAGE } : { code: "SERVICE_UNAVAILABLE" });
    expect(context.getAuthAssurance).toHaveBeenCalledTimes(1);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it.each(["admin", "buyer", "seller"] as const)("retains authorized %s order lookup", async (role) => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const context = createContext({ query: { orders: { findFirst } } });
    context.user!.role = role;
    context.getAuthAssurance = role === "admin"
      ? vi.fn().mockResolvedValue({ currentLevel: "aal2", nextLevel: "aal2", lastFactorVerificationAt: null, recentVerificationSatisfied: false })
      : vi.fn().mockRejectedValue(new Error("Participant order read must not require MFA"));
    const caller = createCaller(context);
    await expect(caller.order.getById({ id: OFFER_ID })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(context.getAuthAssurance).toHaveBeenCalledTimes(role === "admin" ? 1 : 0);
  });
});

describe("order seller payout readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["buyer", "seller"] as const)("blocks buy-now reservation before consuming the shipping quote when the seller is not payout-ready (%s account)", async (role) => {
    mocks.stripeAccountsRetrieve.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: false,
      capabilities: { transfers: "inactive" },
    });

    const tx = {
      execute: vi.fn(),
      select: vi
        .fn()
        .mockImplementationOnce(() => createPendingOrderCountSelect())
        .mockImplementationOnce(() => ({
          from: () => ({
            where: () => ({
              for: vi.fn().mockResolvedValue([createActiveListing()]),
            }),
          }),
        }))
        .mockImplementationOnce(() => createSellerReadinessSelect()),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ id: SELLER_ID }]),
        })),
      })),
      insert: vi.fn(),
    };
    const db = {
      transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const context = createContext(db);
    context.user!.role = role;
    context.getAuthAssurance = vi.fn().mockRejectedValue(new Error("Buying must not require payout MFA"));
    const caller = createCaller(context);

    await expect(
      caller.order.create({
        requestId: "11111111-1111-4111-8111-111111111119",
        listingId: LISTING_ID,
        quantitySqFt: 200,
        shippingName: "Buyer Name",
        shippingAddress: "123 Main St",
        shippingCity: "Denver",
        shippingState: "CO",
        shippingZip: "80202",
        selectedQuoteToken: "quote-token-payout-block",
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Seller cannot currently accept payments for this listing.",
    });

    expect(mocks.redisGet).not.toHaveBeenCalled();
    expect(mocks.redisEval).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it.each(["buyer", "seller"] as const)("blocks accepted-offer reservation before quote consumption when the seller account is deauthorized (%s account)", async (role) => {
    mocks.stripeAccountsRetrieve.mockRejectedValue({
      type: "StripeInvalidRequestError",
      code: "resource_missing",
      statusCode: 404,
    });

    const offer = {
      id: OFFER_ID,
      buyerId: BUYER_ID,
      sellerId: SELLER_ID,
      listingId: LISTING_ID,
      quantitySqFt: 150,
      offerPricePerSqFt: 2.15,
      counterPricePerSqFt: null,
      status: "accepted",
      orderId: null,
      expiresAt: null,
    };
    const updateWhere = vi.fn().mockResolvedValue([{ id: SELLER_ID }]);
    const tx = {
      execute: vi.fn(),
      select: vi
        .fn()
        .mockImplementationOnce(() => createPendingOrderCountSelect())
        .mockImplementationOnce(() => ({
          from: () => ({
            where: () => ({
              for: vi.fn().mockResolvedValue([offer]),
            }),
          }),
        }))
        .mockImplementationOnce(() => ({
          from: () => ({
            where: () => ({
              for: vi.fn().mockResolvedValue([createActiveListing()]),
            }),
          }),
        }))
        .mockImplementationOnce(() => createSellerReadinessSelect()),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: updateWhere,
        })),
      })),
      insert: vi.fn(),
    };
    const db = {
      transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const context = createContext(db);
    context.user!.role = role;
    context.getAuthAssurance = vi.fn().mockRejectedValue(new Error("Buying must not require payout MFA"));
    const caller = createCaller(context);

    await expect(
      caller.order.createFromOffer({
        requestId: "11111111-1111-4111-8111-111111111119",
        offerId: OFFER_ID,
        shippingName: "Buyer Name",
        shippingAddress: "123 Main St",
        shippingCity: "Denver",
        shippingState: "CO",
        shippingZip: "80202",
        selectedQuoteToken: "quote-token-deauthorized",
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Seller cannot currently accept payments for this listing.",
    });

    expect(updateWhere).toHaveBeenCalled();
    expect(mocks.redisGet).not.toHaveBeenCalled();
    expect(mocks.redisEval).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});


describe("checkout response replay precedes mutable checkout guards", () => {
  it.each([["buyer", "create"], ["buyer", "createFromOffer"], ["seller", "create"], ["seller", "createFromOffer"]] as const)("%s %s returns the original order before quote, offer, inventory or pending-limit checks", async (role, mode) => {
    const previous = { id: "55555555-5555-4555-8555-555555555555", orderNumber: "PM-REPLAY", status: "pending", paymentStatus: "pending", totalPrice: 100, taxAmount: 0, taxStatus: "disabled", taxLiability: "none", taxJurisdictionSummary: [] };
    vi.mocked(findCheckoutReplay).mockResolvedValueOnce(previous as unknown as Awaited<ReturnType<typeof findCheckoutReplay>>);
    const tx = { execute: vi.fn(), select: vi.fn(), insert: vi.fn(), update: vi.fn() };
    const db = { transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)) };
    const context = createContext(db);
    context.user!.role = role;
    context.getAuthAssurance = vi.fn().mockRejectedValue(new Error("Buying must not require payout MFA"));
    const caller = createCaller(context);
    const input = { requestId: "11111111-1111-4111-8111-111111111119", listingId: LISTING_ID, offerId: OFFER_ID, quantitySqFt: 100,
      shippingName: "Buyer Name", shippingAddress: "123 Main St", shippingCity: "Denver", shippingState: "CO", shippingZip: "80202", selectedQuoteToken: "already-consumed" };
    await expect(caller.order[mode](input)).resolves.toMatchObject({ id: previous.id });
    expect(findCheckoutReplay).toHaveBeenCalledWith(tx, BUYER_ID, input.requestId, expect.any(String));
    expect(tx.select).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(mocks.redisGet).not.toHaveBeenCalled();
    expect(mocks.redisEval).not.toHaveBeenCalled();
  });
});

describe("one business buying and selling order boundaries", () => {
  function detailFixture(side: "buyer" | "seller" | "neither") {
    const order = {
      id: OFFER_ID, orderNumber: "PM-DUAL", buyerId: side === "buyer" ? BUYER_ID : LISTING_ID,
      sellerId: side === "seller" ? BUYER_ID : SELLER_ID,
      listingId: LISTING_ID, quantitySqFt: 200, pricePerSqFt: 2, subtotal: 400,
      buyerFee: 20, sellerFee: 20, sellerStripeFee: 12, sellerPayout: 368,
      carrierRate: 500, shippingMargin: 50, shippingPrice: 550, buyerFreightCharge: 550,
      freightFundingMode: "buyer_pays", sellerFreightContribution: 0,
      totalPrice: 970, taxAmount: 0, taxStatus: "disabled", resaleDecision: null,
      status: "shipped", paymentStatus: "succeeded", escrowStatus: "held", confirmedAt: null,
      stripePaymentIntentId: "pi_PRIVATE", stripeTransferId: "tr_PRIVATE", stripeRefundId: "re_PRIVATE",
      stripeTransferReversalId: "trr_PRIVATE", transferReversedAmount: 5, transferFailedAt: null,
      transferError: "PRIVATE-provider-error", notes: "PRIVATE-internal-notes",
      shippingName: "Buyer Contact", shippingAddress: "123 Synthetic Rd", shippingCity: "Denver",
      shippingState: "CO", shippingZip: "80202", shippingPhone: "5550000000",
      buyer: { id: BUYER_ID, role: "seller", name: "PRIVATE BUYER", businessName: "PRIVATE BUYER CO", email: "buyer@example.test", phone: "5550000000" },
      seller: { id: SELLER_ID, role: "seller", name: "PRIVATE SELLER", businessName: "PRIVATE SELLER CO", email: "seller@example.test", phone: "5551111111" },
      listing: null, shipment: null, dispute: null,
    };
    const findFirst = vi.fn().mockResolvedValue(order);
    const context = createContext({ query: { orders: { findFirst } } });
    context.user!.role = "seller";
    context.getAuthAssurance = vi.fn().mockRejectedValue(new Error("Ordinary participant read must not request MFA"));
    return { order, findFirst, context, caller: createCaller(context) };
  }

  it("lets a seller read its purchase with buyer privacy and exact participant SQL", async () => {
    const f = detailFixture("buyer");
    const result = await f.caller.order.getById({ id: OFFER_ID });
    expect(result.sellerFinancials).toBeNull();
    expect(result.adminFinancials).toBeNull();
    expect(result.shippingAddress).toBe("123 Synthetic Rd");
    expect(result.buyer.name).toMatch(/^Verified Buyer /);
    expect(result.seller.name).toMatch(/^Verified Seller /);
    expect(result.buyer.email).toBeNull();
    expect(result.seller.email).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE/);
    const query = new PgDialect().sqlToQuery(f.findFirst.mock.calls[0][0].where);
    expect(query.sql).toBe('(\"orders\".\"id\" = $1 and (\"orders\".\"buyer_id\" = $2 or \"orders\".\"seller_id\" = $3))');
    expect(query.params).toEqual([OFFER_ID, BUYER_ID, BUYER_ID]);
    expect(f.context.getAuthAssurance).not.toHaveBeenCalled();
  });

  it("keeps sale financials available only on the account's sale", async () => {
    const f = detailFixture("seller");
    const result = await f.caller.order.getById({ id: OFFER_ID });
    expect(result.sellerFinancials).toMatchObject({ sellerPayout: 368, sellerFee: 20 });
    expect(result.adminFinancials).toBeNull();
    expect(result.shippingAddress).toBeNull();
    expect(f.context.getAuthAssurance).not.toHaveBeenCalled();
  });

  it("defensively rejects a nonparticipant row", async () => {
    await expect(detailFixture("neither").caller.order.getById({ id: OFFER_ID })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each([
    ["create", "self"],
    ["createFromOffer", "self"],
    ["createFromOffer", "mismatched-seller"],
  ] as const)("%s rejects %s purchase before quote consumption or writes", async (mode, failure) => {
    const listing = { ...createActiveListing(), sellerId: failure === "self" ? BUYER_ID : SELLER_ID };
    const offer = { id: OFFER_ID, buyerId: BUYER_ID, sellerId: BUYER_ID, listingId: LISTING_ID, status: "accepted", orderId: null, expiresAt: null, quantitySqFt: 200, offerPricePerSqFt: 2 };
    const select = vi.fn().mockImplementationOnce(() => createPendingOrderCountSelect());
    if (mode === "createFromOffer") select.mockImplementationOnce(() => ({ from: () => ({ where: () => ({ for: vi.fn().mockResolvedValue([offer]) }) }) }));
    select.mockImplementationOnce(() => ({ from: () => ({ where: () => ({ for: vi.fn().mockResolvedValue([listing]) }) }) }));
    const tx = { select, execute: vi.fn(), insert: vi.fn(), update: vi.fn() };
    const context = createContext({ transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)) });
    context.user!.role = "seller";
    vi.clearAllMocks();
    await expect(createCaller(context).order[mode]({ requestId: "11111111-1111-4111-8111-111111111119", listingId: LISTING_ID, offerId: OFFER_ID, quantitySqFt: 200, shippingName: "Buyer Name", shippingAddress: "123 Synthetic Rd", shippingCity: "Denver", shippingState: "CO", shippingZip: "80202", selectedQuoteToken: "self-purchase-blocked" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: failure === "self" ? "You cannot purchase your own listing" : "This offer no longer matches the listing seller. Please negotiate a new offer." });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(mocks.redisGet).not.toHaveBeenCalled();
    expect(mocks.redisEval).not.toHaveBeenCalled();
    expect(mocks.stripeAccountsRetrieve).not.toHaveBeenCalled();
  });
});
