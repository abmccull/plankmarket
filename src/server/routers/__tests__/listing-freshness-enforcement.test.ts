import { beforeEach, describe, expect, it, vi } from "vitest";

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

const priority1GetRatesMock = vi.fn();
const redisGetMock = vi.fn();
const redisGetdelMock = vi.fn();
const redisEvalMock = vi.fn();

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
    get: redisGetMock,
    getdel: redisGetdelMock,
    eval: redisEvalMock,
  },
}));

vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: vi.fn(),
}));

vi.mock("@/server/services/priority1", () => ({
  priority1: {
    getRates: priority1GetRatesMock,
  },
}));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { offerRouter } = await import("@/server/routers/offer");
const { orderRouter } = await import("@/server/routers/order");
const { shippingRouter } = await import("@/server/routers/shipping");

const router = createTRPCRouter({
  offer: offerRouter,
  order: orderRouter,
  shipping: shippingRouter,
});

const createCaller = createCallerFactory(router);

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const LISTING_ID = "33333333-3333-4333-8333-333333333333";
const OFFER_ID = "44444444-4444-4444-8444-444444444444";

function createCallerContext(overrides: Record<string, unknown> = {}) {
  return {
    db: overrides.db,
    authUser: { id: "auth-1" },
    user: {
      id: BUYER_ID,
      role: "buyer" as const,
      active: true,
      verificationStatus: "verified",
      businessName: null,
      name: "Buyer User",
    },
    supabase: {},
    clientIp: "127.0.0.1",
    ...overrides,
  } as Parameters<typeof createCaller>[0];
}

function createStaleListing(overrides: Record<string, unknown> = {}) {
  return {
    id: LISTING_ID,
    sellerId: SELLER_ID,
    status: "active",
    title: "Stale Oak Lot",
    allowOffers: true,
    totalSqFt: 1200,
    askPricePerSqFt: 2.49,
    buyNowPrice: 2.49,
    fullLotOnly: false,
    partialQuantityMarkupPercent: null,
    moq: null,
    moqUnit: "sqft",
    sqFtPerBox: 20,
    boxesPerPallet: 30,
    territoryMode: "unrestricted",
    allowedDestinationStates: [],
    confirmationDueAt: new Date("2026-07-01T12:00:00.000Z"),
    lastConfirmedAt: new Date("2026-06-15T12:00:00.000Z"),
    ...overrides,
  };
}

function createPendingOrderCountSelect() {
  return {
    from: () => ({
      where: vi.fn().mockResolvedValue([{ count: 0 }]),
    }),
  };
}

function createShippingArtifacts(params: {
  quantitySqFt: number;
  freightFundingMode: "buyer_pays" | "seller_pays";
  buyerFreightCharge: number;
  sellerFreightContribution: number;
}) {
  const quote = {
    quoteId: 321,
    quoteToken: "freight-drift-token",
    carrierRate: 400,
    shippingPrice: 500,
    freightFundingMode: params.freightFundingMode,
    buyerFreightCharge: params.buyerFreightCharge,
    sellerFreightContribution: params.sellerFreightContribution,
    freightFundingReason:
      params.freightFundingMode === "seller_pays"
        ? "seller_pays"
        : "buyer_pays",
    appliedBuyerDropCharge: 0,
    carrierName: "Carrier X",
    transitDays: 3,
    quoteExpiresAt: "2099-07-30T20:00:00.000Z",
    listingId: LISTING_ID,
    buyerId: BUYER_ID,
    quantitySqFt: params.quantitySqFt,
    destinationZip: "80202",
    destinationState: "CO",
  };
  const snapshot = {
    version: 1,
    quoteId: 321,
    listingId: LISTING_ID,
    buyerId: BUYER_ID,
    quantitySqFt: params.quantitySqFt,
    destinationZip: "80202",
    carrierName: "Carrier X",
    carrierScac: "CARR",
    carrierRate: 400,
    shippingPrice: 500,
    transitDays: 3,
    quoteExpiresAt: "2099-07-30T20:00:00.000Z",
    originLocation: {
      address: {
        addressLine1: "100 Seller Way",
        city: "Denver",
        state: "CO",
        postalCode: "80202",
        country: "US",
      },
      contact: {
        companyName: "Seller Co",
        contactName: "Seller Rep",
        phoneNumber: "3035551212",
        email: "seller@example.com",
      },
    },
    lineItems: [
      {
        freightClass: "125",
        packagingType: "Pallet",
        units: 1,
        pieces: 1,
        totalWeight: 1200,
        length: 48,
        width: 40,
        height: 60,
        description: "Flooring lot",
        isStackable: false,
        isHazardous: false,
        isUsed: false,
      },
    ],
    pickupWindow: {
      date: "2099-07-31",
      startTime: "08:00",
      endTime: "17:00",
    },
    deliveryWindow: {
      date: "2099-08-05",
      startTime: "08:00",
      endTime: "17:00",
    },
  };
  return {
    quoteJson: JSON.stringify(quote),
    snapshotJson: JSON.stringify(snapshot),
  };
}

describe("listing freshness enforcement on buyer write paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects shipping quotes for overdue listings before calling Priority1", async () => {
    const db = {
      query: {
        listings: {
          findFirst: vi.fn().mockResolvedValue(
            createStaleListing({
              seller: {
                id: SELLER_ID,
                name: "Seller",
                email: "seller@example.com",
                phone: "3035551212",
                businessName: "Seller Co",
                businessAddress: "123 Seller St",
              },
            }),
          ),
        },
      },
    };

    const caller = createCaller(createCallerContext({ db }));

    await expect(
      caller.shipping.getQuotes({
        listingId: LISTING_ID,
        destinationZip: "80202",
        quantitySqFt: 200,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Listing not found",
    });

    expect(priority1GetRatesMock).not.toHaveBeenCalled();
  });

  it("rejects offer creation for unconfirmed listings", async () => {
    const db = {
      query: {
        listings: {
          findFirst: vi.fn().mockResolvedValue(
            createStaleListing({
              confirmationDueAt: null,
              lastConfirmedAt: null,
            }),
          ),
        },
        offers: {
          findFirst: vi.fn(),
        },
      },
      transaction: vi.fn(),
    };

    const caller = createCaller(createCallerContext({ db }));

    await expect(
      caller.offer.createOffer({
        listingId: LISTING_ID,
        offerPricePerSqFt: 2.1,
        quantitySqFt: 200,
        message: "Can close this week.",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Listing not found or no longer available",
    });

    expect(db.query.offers.findFirst).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects buy-now order creation for overdue listings before consuming a shipping quote", async () => {
    const tx = {
      execute: vi.fn(),
      select: vi.fn((fields?: unknown) => {
        if (fields) {
          return createPendingOrderCountSelect();
        }

        return {
          from: () => ({
            where: () => ({
              for: vi.fn().mockResolvedValue([createStaleListing()]),
            }),
          }),
        };
      }),
    };
    const db = {
      transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    const caller = createCaller(createCallerContext({ db }));

    await expect(
      caller.order.create({
        listingId: LISTING_ID,
        quantitySqFt: 200,
        shippingName: "Buyer Name",
        shippingAddress: "123 Main St",
        shippingCity: "Denver",
        shippingState: "CO",
        shippingZip: "80202",
        selectedQuoteToken: "quote-token-1",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Listing not found or no longer available",
    });

    expect(redisGetdelMock).not.toHaveBeenCalled();
  });

  it("rejects accepted-offer order creation when the listing is unconfirmed", async () => {
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
              for: vi.fn().mockResolvedValue([
                createStaleListing({
                  confirmationDueAt: null,
                  lastConfirmedAt: null,
                }),
              ]),
            }),
          }),
        })),
    };
    const db = {
      transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    const caller = createCaller(createCallerContext({ db }));

    await expect(
      caller.order.createFromOffer({
        offerId: OFFER_ID,
        shippingName: "Buyer Name",
        shippingAddress: "123 Main St",
        shippingCity: "Denver",
        shippingState: "CO",
        shippingZip: "80202",
        selectedQuoteToken: "quote-token-2",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Listing not found or no longer available",
    });

    expect(redisGetMock).not.toHaveBeenCalled();
    expect(redisEvalMock).not.toHaveBeenCalled();
    expect(redisGetdelMock).not.toHaveBeenCalled();
  });

  it("consumes accepted-offer quote artifacts exactly once after validation succeeds", async () => {
    const quoteJson = JSON.stringify({
      quoteId: 123,
      quoteToken: "quote-token-3",
      carrierRate: 400,
      shippingPrice: 500,
      freightFundingMode: "buyer_pays",
      buyerFreightCharge: 500,
      sellerFreightContribution: 0,
      freightFundingReason: "buyer_pays",
      appliedBuyerDropCharge: 0,
      carrierName: "Carrier X",
      transitDays: 3,
      quoteExpiresAt: "2099-07-30T20:00:00.000Z",
      listingId: LISTING_ID,
      buyerId: BUYER_ID,
      quantitySqFt: 150,
      destinationZip: "80202",
      destinationState: "CO",
    });
    const snapshotJson = JSON.stringify({
      version: 1,
      quoteId: 123,
      listingId: LISTING_ID,
      buyerId: BUYER_ID,
      quantitySqFt: 150,
      destinationZip: "80202",
      carrierName: "Carrier X",
      carrierScac: "CARR",
      carrierRate: 400,
      shippingPrice: 500,
      transitDays: 3,
      quoteExpiresAt: "2099-07-30T20:00:00.000Z",
      originLocation: {
        address: {
          addressLine1: "100 Seller Way",
          city: "Denver",
          state: "CO",
          postalCode: "80202",
          country: "US",
        },
        contact: {
          companyName: "Seller Co",
          contactName: "Seller Rep",
          phoneNumber: "3035551212",
          email: "seller@example.com",
        },
      },
      lineItems: [
        {
          freightClass: "125",
          packagingType: "Pallet",
          units: 1,
          pieces: 1,
          totalWeight: 1200,
          length: 48,
          width: 40,
          height: 60,
          description: "Flooring lot",
          isStackable: false,
          isHazardous: false,
          isUsed: false,
        },
      ],
      pickupWindow: {
        date: "2099-07-31",
        startTime: "08:00",
        endTime: "17:00",
      },
      deliveryWindow: {
        date: "2099-08-05",
        startTime: "08:00",
        endTime: "17:00",
      },
    });

    redisGetMock.mockResolvedValueOnce(quoteJson).mockResolvedValueOnce(snapshotJson);
    redisEvalMock.mockResolvedValueOnce(1);

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

    let insertedOrderValues: Record<string, unknown> | undefined;
    const insertedOrder = {
      id: "55555555-5555-4555-8555-555555555555",
      orderNumber: "PM-TEST123",
      status: "pending",
      paymentStatus: null,
      totalPrice: 838.55,
    };

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
              for: vi.fn().mockResolvedValue([
                createStaleListing({
                  totalSqFt: 500,
                  confirmationDueAt: new Date("2099-08-01T12:00:00.000Z"),
                  lastConfirmedAt: new Date("2099-07-29T12:00:00.000Z"),
                }),
              ]),
            }),
          }),
        })),
      insert: vi.fn().mockImplementation((table) => {
        if (table === undefined) {
          throw new Error("Unexpected insert target");
        }

        return {
          values: (values: Record<string, unknown>) => {
            insertedOrderValues = values;
            return {
              returning: vi.fn().mockResolvedValue([insertedOrder]),
            };
          },
        };
      }),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: LISTING_ID }]),
          })),
        })),
      })),
    };

    const db = {
      transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    const caller = createCaller(createCallerContext({ db }));

    await expect(
      caller.order.createFromOffer({
        offerId: OFFER_ID,
        shippingName: "Buyer Name",
        shippingAddress: "123 Main St",
        shippingCity: "Denver",
        shippingState: "CO",
        shippingZip: "80202",
        selectedQuoteToken: "quote-token-3",
      }),
    ).resolves.toMatchObject({
      id: insertedOrder.id,
      orderNumber: insertedOrder.orderNumber,
      status: "pending",
      totalPrice: insertedOrder.totalPrice,
    });

    expect(redisGetMock).toHaveBeenCalledTimes(2);
    expect(redisGetMock).toHaveBeenNthCalledWith(
      1,
      "shipping-quote-token:quote-token-3",
    );
    expect(redisGetMock).toHaveBeenNthCalledWith(
      2,
      "shipping-booking-snapshot:123",
    );
    expect(redisEvalMock).toHaveBeenCalledTimes(1);
    expect(redisGetdelMock).not.toHaveBeenCalled();
    expect(insertedOrderValues).toMatchObject({
      selectedQuoteId: "123",
      selectedCarrier: "Carrier X",
      shippingPrice: 500,
      freightFundingMode: "buyer_pays",
      buyerFreightCharge: 500,
      sellerFreightContribution: 0,
      carrierRate: 400,
    });
    expect((insertedOrderValues?.shippingBookingSnapshot as { quoteId?: number })?.quoteId).toBe(123);
  });

  it("rejects buy-now checkout when locked listing freight terms drift from the quote", async () => {
    const artifacts = createShippingArtifacts({
      quantitySqFt: 160,
      freightFundingMode: "seller_pays",
      buyerFreightCharge: 0,
      sellerFreightContribution: 500,
    });
    redisGetMock
      .mockResolvedValueOnce(artifacts.quoteJson)
      .mockResolvedValueOnce(artifacts.snapshotJson);

    const tx = {
      execute: vi.fn(),
      select: vi
        .fn()
        .mockImplementationOnce(() => createPendingOrderCountSelect())
        .mockImplementationOnce(() => ({
          from: () => ({
            where: () => ({
              for: vi.fn().mockResolvedValue([
                createStaleListing({
                  totalSqFt: 500,
                  confirmationDueAt: new Date("2099-08-01T12:00:00.000Z"),
                  lastConfirmedAt: new Date("2099-07-29T12:00:00.000Z"),
                  freightPaymentMode: "buyer_pays",
                  sellerFreightStates: [],
                  freightDropCharge: null,
                }),
              ]),
            }),
          }),
        })),
      insert: vi.fn(),
    };
    const db = {
      transaction: vi.fn(
        async (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const caller = createCaller(createCallerContext({ db }));

    await expect(
      caller.order.create({
        listingId: LISTING_ID,
        quantitySqFt: 160,
        shippingName: "Buyer Name",
        shippingAddress: "123 Main St",
        shippingCity: "Denver",
        shippingState: "CO",
        shippingZip: "80202",
        selectedQuoteToken: "freight-drift-token",
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("freight terms changed"),
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("preserves accepted-offer quote artifacts when locked freight terms drift", async () => {
    const artifacts = createShippingArtifacts({
      quantitySqFt: 150,
      freightFundingMode: "seller_pays",
      buyerFreightCharge: 0,
      sellerFreightContribution: 500,
    });
    redisGetMock
      .mockResolvedValueOnce(artifacts.quoteJson)
      .mockResolvedValueOnce(artifacts.snapshotJson);

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
              for: vi.fn().mockResolvedValue([
                createStaleListing({
                  totalSqFt: 500,
                  confirmationDueAt: new Date("2099-08-01T12:00:00.000Z"),
                  lastConfirmedAt: new Date("2099-07-29T12:00:00.000Z"),
                  freightPaymentMode: "buyer_pays",
                  sellerFreightStates: [],
                  freightDropCharge: null,
                }),
              ]),
            }),
          }),
        })),
      insert: vi.fn(),
    };
    const db = {
      transaction: vi.fn(
        async (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const caller = createCaller(createCallerContext({ db }));

    await expect(
      caller.order.createFromOffer({
        offerId: OFFER_ID,
        shippingName: "Buyer Name",
        shippingAddress: "123 Main St",
        shippingCity: "Denver",
        shippingState: "CO",
        shippingZip: "80202",
        selectedQuoteToken: "freight-drift-token",
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("freight terms changed"),
    });
    expect(redisEvalMock).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("blocks an accepted-offer order before quote consumption when seller-funded freight leaves no payout", async () => {
    const artifacts = createShippingArtifacts({
      quantitySqFt: 150,
      freightFundingMode: "seller_pays",
      buyerFreightCharge: 0,
      sellerFreightContribution: 500,
    });
    redisGetMock
      .mockResolvedValueOnce(artifacts.quoteJson)
      .mockResolvedValueOnce(artifacts.snapshotJson);

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
              for: vi.fn().mockResolvedValue([
                createStaleListing({
                  totalSqFt: 500,
                  confirmationDueAt: new Date("2099-08-01T12:00:00.000Z"),
                  lastConfirmedAt: new Date("2099-07-29T12:00:00.000Z"),
                  freightPaymentMode: "seller_pays",
                  sellerFreightStates: [],
                  freightDropCharge: null,
                }),
              ]),
            }),
          }),
        })),
      insert: vi.fn(),
    };
    const db = {
      transaction: vi.fn(
        async (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const caller = createCaller(createCallerContext({ db }));

    await expect(
      caller.order.createFromOffer({
        offerId: OFFER_ID,
        shippingName: "Buyer Name",
        shippingAddress: "123 Main St",
        shippingCity: "Denver",
        shippingState: "CO",
        shippingZip: "80202",
        selectedQuoteToken: "freight-drift-token",
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("no transferable seller payout"),
    });
    expect(redisEvalMock).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
