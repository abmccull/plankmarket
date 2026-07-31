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
  processOrderRefund: vi.fn(),
  openReconciliationCase: vi.fn(),
  inngestSend: vi.fn(),
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
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}) }));
vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: vi.fn(),
}));
vi.mock("@/server/services/refund", () => ({
  processOrderRefund: mocks.processOrderRefund,
}));
vi.mock("@/server/services/reconciliation-cases", () => ({
  openReconciliationCase: mocks.openReconciliationCase,
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mocks.inngestSend },
}));

const { createCallerFactory, createTRPCRouter } =
  await import("@/server/trpc");
const {
  BUYER_CLAIM_WINDOW_MS,
  disputeRouter,
  evaluateBuyerClaimEligibility,
} = await import("@/server/routers/dispute");

const router = createTRPCRouter({ dispute: disputeRouter });
const createCaller = createCallerFactory(router);

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";
const DISPUTE_ID = "55555555-5555-4555-8555-555555555555";
const MEDIA_ID = "66666666-6666-4666-8666-666666666666";
const NOW = new Date("2026-07-30T18:00:00.000Z");

function callerContext(
  db: unknown,
  params: {
    id?: string;
    role?: "buyer" | "seller" | "admin";
  } = {},
) {
  const role = params.role ?? "buyer";
  const id = params.id ?? BUYER_ID;
  return {
    db,
    authUser: { id: `auth-${id}` },
    user: {
      id,
      role,
      active: true,
      verificationStatus: "verified",
      name: `${role} user`,
      businessName: `${role} business`,
    },
    supabase: {},
    clientIp: "127.0.0.1",
  } as Parameters<typeof createCaller>[0];
}

function createClaimTransaction(params: {
  deliveredAt: Date;
  orderStatus?: string;
  paymentStatus?: string;
}) {
  const insertEvidence = vi.fn().mockResolvedValue(undefined);
  const insertDispute = vi.fn(() => ({
    returning: vi.fn().mockResolvedValue([
      {
        id: DISPUTE_ID,
        orderId: ORDER_ID,
        status: "open",
      },
    ]),
  }));
  const insert = vi
    .fn()
    .mockImplementationOnce(() => ({ values: insertDispute }))
    .mockImplementationOnce(() => ({ values: insertEvidence }));
  const select = vi
    .fn()
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({
          for: vi.fn().mockResolvedValue([
            {
              id: ORDER_ID,
              buyerId: BUYER_ID,
              sellerId: SELLER_ID,
              status: params.orderStatus ?? "delivered",
              paymentStatus: params.paymentStatus ?? "succeeded",
              deliveredAt: params.deliveredAt,
            },
          ]),
        }),
      }),
    })
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ deliveredAt: params.deliveredAt }]),
        }),
      }),
    })
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    })
    .mockReturnValueOnce({
      from: () => ({
        where: vi.fn(() => ({
          for: vi.fn().mockResolvedValue([
            {
              id: MEDIA_ID,
              uploaderId: BUYER_ID,
              listingId: null,
              buyerRequestId: null,
              mimeType: "image/jpeg",
            },
          ]),
        })),
      }),
    });
  return {
    tx: { select, insert },
    insertDispute,
    insertEvidence,
  };
}

describe("buyer claim policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it("enforces the 48-hour window from carrier-confirmed delivery", () => {
    const atBoundary = evaluateBuyerClaimEligibility({
      orderStatus: "delivered",
      paymentStatus: "succeeded",
      deliveryOccurredAt: new Date(NOW.getTime() - BUYER_CLAIM_WINDOW_MS),
      now: NOW,
    });
    expect(atBoundary.eligible).toBe(true);

    const late = evaluateBuyerClaimEligibility({
      orderStatus: "delivered",
      paymentStatus: "succeeded",
      deliveryOccurredAt: new Date(
        NOW.getTime() - BUYER_CLAIM_WINDOW_MS - 1,
      ),
      now: NOW,
    });
    expect(late).toMatchObject({
      eligible: false,
      code: "window_expired",
    });
  });

  it("requires paid and delivered order state", () => {
    expect(
      evaluateBuyerClaimEligibility({
        orderStatus: "shipped",
        paymentStatus: "succeeded",
        deliveryOccurredAt: null,
        now: NOW,
      }),
    ).toMatchObject({ eligible: false, code: "not_delivered" });
    expect(
      evaluateBuyerClaimEligibility({
        orderStatus: "delivered",
        paymentStatus: "pending",
        deliveryOccurredAt: NOW,
        now: NOW,
      }),
    ).toMatchObject({ eligible: false, code: "not_paid" });
  });

  it("fails before touching the database when visible freight damage lacks BOL evidence", async () => {
    const db = { transaction: vi.fn() };
    const caller = createCaller(callerContext(db));

    await expect(
      caller.dispute.create({
        orderId: ORDER_ID,
        reasonCode: "freight_damage",
        description:
          "Multiple cartons were crushed and boards were visibly damaged.",
        damageVisibleAtDelivery: true,
        bolDamageNoted: false,
        evidence: [
          {
            mediaId: MEDIA_ID,
            evidenceType: "photo",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("delivery receipt"),
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("atomically attaches owned evidence for an eligible buyer claim", async () => {
    const { tx, insertDispute, insertEvidence } = createClaimTransaction({
      deliveredAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    });
    const db = {
      transaction: vi.fn(
        async (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const caller = createCaller(callerContext(db));

    const result = await caller.dispute.create({
      orderId: ORDER_ID,
      reasonCode: "quantity_shortage",
      description:
        "The delivery was short six cartons compared with the signed order.",
      evidence: [
        {
          mediaId: MEDIA_ID,
          evidenceType: "photo",
          description: "Pallet and carton count",
        },
      ],
    });

    expect(result.id).toBe(DISPUTE_ID);
    expect(insertDispute).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "buyer",
        reasonCode: "quantity_shortage",
        reportedLate: false,
      }),
    );
    expect(insertEvidence).toHaveBeenCalledWith([
      expect.objectContaining({
        disputeId: DISPUTE_ID,
        mediaId: MEDIA_ID,
        uploaderId: BUYER_ID,
      }),
    ]);
  });

  it("does not allow a buyer to submit an admin reporting-window override", async () => {
    const db = { transaction: vi.fn() };
    const caller = createCaller(callerContext(db));
    await expect(
      caller.dispute.create({
        orderId: ORDER_ID,
        reasonCode: "other",
        description:
          "The buyer is asking support to review an issue after the deadline.",
        reportingWindowOverrideReason:
          "Support approved a documented carrier timestamp exception.",
        evidence: [{ mediaId: MEDIA_ID, evidenceType: "photo" }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe("claim resolution money safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processOrderRefund.mockResolvedValue({
      refundId: "re_test",
      amountRefunded: 80,
    });
  });

  function existingPartialRefundDispute() {
    return {
      id: DISPUTE_ID,
      orderId: ORDER_ID,
      status: "under_review",
      order: {
        id: ORDER_ID,
        orderNumber: "PM-000001",
        status: "delivered",
        shippedAt: new Date("2026-07-29T10:00:00.000Z"),
        paymentStatus: "partially_refunded",
        stripePaymentIntentId: "pi_test",
        totalPrice: 100,
        refundedAmount: 20,
      },
    };
  }

  it("defaults buyer-favor resolution to the full remaining balance", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            for: vi.fn().mockResolvedValue([{ id: ORDER_ID }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            for: vi.fn().mockResolvedValue([{ status: "under_review" }]),
          }),
        }),
      });
    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              id: DISPUTE_ID,
              status: "resolved_buyer",
              resolvedRefundAmountCents: 8000,
            },
          ]),
        })),
      })),
    }));
    const tx = { select, update };
    const db = {
      query: {
        disputes: {
          findFirst: vi
            .fn()
            .mockResolvedValue(existingPartialRefundDispute()),
        },
      },
      transaction: vi.fn(
        async (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const caller = createCaller(
      callerContext(db, { id: ADMIN_ID, role: "admin" }),
    );

    const result = await caller.dispute.resolve({
      disputeId: DISPUTE_ID,
      outcome: "resolved_buyer",
      resolution:
        "Buyer evidence confirms the shortage; refund the remaining balance.",
    });

    expect(mocks.processOrderRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER_ID,
        amountCents: 8000,
      }),
    );
    expect(result.dispute.status).toBe("resolved_buyer");
  });

  it("blocks an accidental final partial settlement without explicit confirmation", async () => {
    const db = {
      query: {
        disputes: {
          findFirst: vi
            .fn()
            .mockResolvedValue(existingPartialRefundDispute()),
        },
      },
      transaction: vi.fn(),
    };
    const caller = createCaller(
      callerContext(db, { id: ADMIN_ID, role: "admin" }),
    );

    await expect(
      caller.dispute.resolve({
        disputeId: DISPUTE_ID,
        outcome: "resolved_buyer",
        resolution:
          "Buyer and seller discussed a smaller settlement for the shortage.",
        refundAmountCents: 3000,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("partial refund"),
    });
    expect(mocks.processOrderRefund).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("leaves the claim open and creates a durable case when refund execution fails", async () => {
    mocks.processOrderRefund.mockRejectedValueOnce(
      new Error("Provider refund unavailable"),
    );
    mocks.openReconciliationCase.mockResolvedValueOnce({ id: "case-1" });
    const db = {
      query: {
        disputes: {
          findFirst: vi
            .fn()
            .mockResolvedValue(existingPartialRefundDispute()),
        },
      },
      transaction: vi.fn(),
    };
    const caller = createCaller(
      callerContext(db, { id: ADMIN_ID, role: "admin" }),
    );

    await expect(
      caller.dispute.resolve({
        disputeId: DISPUTE_ID,
        outcome: "resolved_buyer",
        resolution:
          "Buyer evidence confirms the shortage; refund the remaining balance.",
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.stringContaining("reconciliation case"),
    });
    expect(mocks.openReconciliationCase).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        caseKey: `dispute-refund:${DISPUTE_ID}`,
        severity: "high",
      }),
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
