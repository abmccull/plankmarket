import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildOfferResponseDeadlineEvent } from "@/lib/offer-lifecycle";

type CapturedHandler = (
  input: Record<string, unknown>,
) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  handler: null as CapturedHandler | null,
  db: {
    query: {
      offers: { findFirst: vi.fn() },
      agentConfigs: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
    transaction: vi.fn(),
  },
  isPro: vi.fn(),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((...args: unknown[]) => {
      mocks.handler = args[2] as CapturedHandler;
      return { id: "agent-offer-handler" };
    }),
  },
}));

vi.mock("@/server/db", () => ({
  db: mocks.db,
}));

vi.mock("@/lib/pro", () => ({
  isPro: mocks.isPro,
}));

await import("@/lib/inngest/functions/agent-offer-handler");

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const LISTING_ID = "33333333-3333-4333-8333-333333333333";
const OFFER_ID = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-07-30T18:00:00.000Z");
const EXPECTED_DEADLINE = new Date("2026-08-01T18:00:00.000Z");

function createOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: OFFER_ID,
    listingId: LISTING_ID,
    buyerId: BUYER_ID,
    sellerId: SELLER_ID,
    status: "pending",
    currentRound: 1,
    lastActorId: BUYER_ID,
    offerPricePerSqFt: 2.5,
    quantitySqFt: 400,
    expiresAt: new Date("2026-07-31T18:00:00.000Z"),
    listing: {
      id: LISTING_ID,
      title: "White Oak Closeout",
      askPricePerSqFt: 2.5,
    },
    ...overrides,
  };
}

function createStep() {
  return {
    run: vi.fn(
      async (_name: string, callback: () => Promise<unknown>) => callback(),
    ),
    sendEvent: vi.fn().mockResolvedValue(undefined),
  };
}

function createTransaction(
  returningValue: unknown[],
  currentOffer: Record<string, unknown> | null = null,
) {
  let updatedValues: Record<string, unknown> | undefined;
  const insertedValues: Record<string, unknown>[] = [];
  const tx = {
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updatedValues = values;
        return {
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue(returningValue),
          })),
        };
      }),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        insertedValues.push(values);
        return Promise.resolve(undefined);
      }),
    })),
    query: {
      offers: {
        findFirst: vi.fn().mockResolvedValue(currentOffer),
      },
    },
  };

  mocks.db.transaction.mockImplementation(
    async (callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx),
  );

  return {
    tx,
    getUpdatedValues: () => updatedValues,
    insertedValues,
  };
}

describe("agent offer lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.isPro.mockReturnValue(true);
    mocks.db.query.users.findFirst.mockResolvedValue({
      proStatus: "active",
      proExpiresAt: new Date("2026-12-31T00:00:00.000Z"),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-accepts atomically, sets the checkout deadline, and durably emits offer/accepted", async () => {
    mocks.db.query.offers.findFirst.mockResolvedValue(createOffer());
    mocks.db.query.agentConfigs.findFirst.mockResolvedValue({
      offerAutoEnabled: true,
      offerAcceptAbove: 90,
      offerCounterAt: 80,
      offerRejectBelow: 50,
      offerCounterMessage: null,
      offerRejectMessage: null,
    });
    const transaction = createTransaction([{ id: OFFER_ID }]);
    const step = createStep();

    await mocks.handler!({
      event: { data: { offerId: OFFER_ID } },
      step,
    });

    expect(transaction.getUpdatedValues()).toMatchObject({
      status: "accepted",
      lastActorId: SELLER_ID,
      expiresAt: EXPECTED_DEADLINE,
      updatedAt: NOW,
    });
    expect(mocks.db.transaction).toHaveBeenCalledTimes(1);
    expect(transaction.insertedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          offerId: OFFER_ID,
          actorId: SELLER_ID,
          eventType: "accept",
          pricePerSqFt: 2.5,
          quantitySqFt: 400,
          totalPrice: 1_000,
        }),
      ]),
    );
    expect(step.sendEvent).toHaveBeenCalledWith(
      "emit-offer-accepted",
      {
        id: `offer-accepted:${OFFER_ID}`,
        name: "offer/accepted",
        data: {
          offerId: OFFER_ID,
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          listingId: LISTING_ID,
          listingTitle: "White Oak Closeout",
          acceptedPrice: "$2.50/sq ft",
          quantity: "400 sq ft",
          estimatedTotal: "$1000.00",
          expiresAt: EXPECTED_DEADLINE.toISOString(),
        },
      },
    );
  });

  it("auto-countering starts and schedules a fresh 48-hour response window", async () => {
    mocks.db.query.offers.findFirst.mockResolvedValue(
      createOffer({
        offerPricePerSqFt: 2.7,
        listing: {
          id: LISTING_ID,
          title: "White Oak Closeout",
          askPricePerSqFt: 3,
        },
      }),
    );
    mocks.db.query.agentConfigs.findFirst.mockResolvedValue({
      offerAutoEnabled: true,
      offerAcceptAbove: 95,
      offerCounterAt: 80,
      offerRejectBelow: 50,
      offerCounterMessage: "Meet us at 95% of ask.",
      offerRejectMessage: null,
    });
    const transaction = createTransaction([{ id: OFFER_ID }]);
    const step = createStep();

    await mocks.handler!({
      event: { data: { offerId: OFFER_ID } },
      step,
    });

    expect(transaction.getUpdatedValues()).toMatchObject({
      status: "countered",
      counterPricePerSqFt: 2.85,
      currentRound: 2,
      lastActorId: SELLER_ID,
      expiresAt: EXPECTED_DEADLINE,
      updatedAt: NOW,
    });
    expect(transaction.insertedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          offerId: OFFER_ID,
          actorId: SELLER_ID,
          eventType: "counter",
          pricePerSqFt: 2.85,
          quantitySqFt: 400,
          totalPrice: 1_140,
        }),
      ]),
    );
    expect(step.sendEvent).toHaveBeenCalledWith(
      "emit-offer-response-deadline",
      buildOfferResponseDeadlineEvent(OFFER_ID, EXPECTED_DEADLINE),
    );
  });

  it("does not emit events or notifications when a manual action wins the race", async () => {
    mocks.db.query.offers.findFirst.mockResolvedValue(createOffer());
    mocks.db.query.agentConfigs.findFirst.mockResolvedValue({
      offerAutoEnabled: true,
      offerAcceptAbove: 90,
      offerCounterAt: 80,
      offerRejectBelow: 50,
      offerCounterMessage: null,
      offerRejectMessage: null,
    });
    const transaction = createTransaction([], {
      status: "countered",
      expiresAt: EXPECTED_DEADLINE,
    });
    const step = createStep();

    await mocks.handler!({
      event: { data: { offerId: OFFER_ID } },
      step,
    });

    expect(transaction.insertedValues).toHaveLength(0);
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it("recovers the accepted event when the database commit outlives the Inngest step checkpoint", async () => {
    mocks.db.query.offers.findFirst.mockResolvedValue(createOffer());
    mocks.db.query.agentConfigs.findFirst.mockResolvedValue({
      offerAutoEnabled: true,
      offerAcceptAbove: 90,
      offerCounterAt: 80,
      offerRejectBelow: 50,
      offerCounterMessage: null,
      offerRejectMessage: null,
    });
    const transaction = createTransaction([], {
      status: "accepted",
      expiresAt: EXPECTED_DEADLINE,
    });
    const step = createStep();

    await mocks.handler!({
      event: { data: { offerId: OFFER_ID } },
      step,
    });

    expect(transaction.insertedValues).toHaveLength(0);
    expect(step.sendEvent).toHaveBeenCalledWith(
      "emit-offer-accepted",
      expect.objectContaining({
        id: `offer-accepted:${OFFER_ID}`,
        name: "offer/accepted",
        data: expect.objectContaining({
          offerId: OFFER_ID,
          expiresAt: EXPECTED_DEADLINE.toISOString(),
        }),
      }),
    );
  });

  it("recovers counter deadline scheduling after a committed counter loses its step checkpoint", async () => {
    mocks.db.query.offers.findFirst.mockResolvedValue(
      createOffer({
        offerPricePerSqFt: 2.7,
        listing: {
          id: LISTING_ID,
          title: "White Oak Closeout",
          askPricePerSqFt: 3,
        },
      }),
    );
    mocks.db.query.agentConfigs.findFirst.mockResolvedValue({
      offerAutoEnabled: true,
      offerAcceptAbove: 95,
      offerCounterAt: 80,
      offerRejectBelow: 50,
      offerCounterMessage: null,
      offerRejectMessage: null,
    });
    const transaction = createTransaction([], {
      status: "countered",
      lastActorId: SELLER_ID,
      currentRound: 2,
      expiresAt: EXPECTED_DEADLINE,
    });
    const step = createStep();

    await mocks.handler!({
      event: { data: { offerId: OFFER_ID } },
      step,
    });

    expect(transaction.insertedValues).toHaveLength(0);
    expect(step.sendEvent).toHaveBeenCalledWith(
      "emit-offer-response-deadline",
      buildOfferResponseDeadlineEvent(OFFER_ID, EXPECTED_DEADLINE),
    );
  });
});
