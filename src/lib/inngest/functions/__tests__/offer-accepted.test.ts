import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CapturedHandler = (
  input: Record<string, unknown>,
) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  handler: null as CapturedHandler | null,
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
  sendOfferAcceptedEmail: vi.fn(),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((...args: unknown[]) => {
      mocks.handler = args[2] as CapturedHandler;
      return { id: "offer-accepted" };
    }),
  },
}));

vi.mock("@/server/db", () => ({
  db: mocks.db,
}));

vi.mock("@/lib/email/send", () => ({
  sendOfferAcceptedEmail: mocks.sendOfferAcceptedEmail,
}));

await import("@/lib/inngest/functions/offer-accepted");

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const OFFER_ID = "22222222-2222-4222-8222-222222222222";
const DEADLINE = new Date("2026-07-30T18:00:00.000Z");
const NOW = new Date("2026-07-30T18:00:01.000Z");

function createEvent() {
  return {
    data: {
      offerId: OFFER_ID,
      buyerId: BUYER_ID,
      listingId: "33333333-3333-4333-8333-333333333333",
      listingTitle: "White Oak Closeout",
      acceptedPrice: "$2.50/sq ft",
      quantity: "400 sq ft",
      estimatedTotal: "$1,000.00",
      expiresAt: DEADLINE.toISOString(),
    },
  };
}

describe("accepted offer expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sleeps to the exact deadline and records one atomic expire event across retries", async () => {
    mocks.db.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const returning = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: OFFER_ID,
          offerPricePerSqFt: 2.25,
          counterPricePerSqFt: 2.5,
          quantitySqFt: 400,
        },
      ])
      .mockResolvedValueOnce([]);
    const expireEventValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning,
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: expireEventValues,
      })),
      query: {
        offers: {
          findFirst: vi.fn().mockResolvedValue({
            id: OFFER_ID,
            status: "expired",
            orderId: null,
          }),
        },
      },
    };
    mocks.db.transaction.mockImplementation(
      async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );

    const run = vi.fn(
      async (_name: string, callback: () => Promise<unknown>) => callback(),
    );
    const sleepUntil = vi.fn().mockResolvedValue(undefined);
    const step = { run, sleepUntil };

    const firstResult = await mocks.handler!({
      event: createEvent(),
      step,
    });
    const retryResult = await mocks.handler!({
      event: createEvent(),
      step,
    });

    expect(firstResult).toEqual({ expired: true, offerId: OFFER_ID });
    expect(retryResult).toEqual({
      expired: false,
      reason: "Offer status is expired",
    });
    expect(sleepUntil).toHaveBeenNthCalledWith(
      1,
      "wait-for-payment",
      DEADLINE,
    );
    expect(sleepUntil).toHaveBeenNthCalledWith(
      2,
      "wait-for-payment",
      DEADLINE,
    );
    expect(expireEventValues).toHaveBeenCalledTimes(1);
    expect(expireEventValues).toHaveBeenCalledWith({
      offerId: OFFER_ID,
      actorId: BUYER_ID,
      eventType: "expire",
      pricePerSqFt: 2.5,
      quantitySqFt: 400,
      totalPrice: 1_000,
      message:
        "Automatically expired after the 48-hour checkout window; no order was created.",
    });
  });
});
