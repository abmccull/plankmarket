import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFFER_RESPONSE_DEADLINE_EVENT } from "@/lib/offer-lifecycle";

type CapturedHandler = (
  input: Record<string, unknown>,
) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  handler: null as CapturedHandler | null,
  trigger: null as Record<string, unknown> | null,
  db: {
    transaction: vi.fn(),
  },
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((...args: unknown[]) => {
      mocks.trigger = args[1] as Record<string, unknown>;
      mocks.handler = args[2] as CapturedHandler;
      return { id: "offer-response-deadline" };
    }),
  },
}));

vi.mock("@/server/db", () => ({
  db: mocks.db,
}));

await import("@/lib/inngest/functions/offer-response-deadline");

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const OFFER_ID = "33333333-3333-4333-8333-333333333333";
const DEADLINE = new Date("2026-07-30T18:00:00.000Z");
const NOW = new Date("2026-07-30T18:00:01.000Z");

function createStep() {
  return {
    sleepUntil: vi.fn().mockResolvedValue(undefined),
    run: vi.fn(
      async (_name: string, callback: () => Promise<unknown>) => callback(),
    ),
  };
}

function createEvent(expiresAt = DEADLINE) {
  return {
    data: {
      offerId: OFFER_ID,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

describe("offer response deadline scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is registered for response deadlines and atomically expires an untouched offer once", async () => {
    const returning = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: OFFER_ID,
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          lastActorId: BUYER_ID,
          offerPricePerSqFt: 2.25,
          counterPricePerSqFt: null,
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
            status: "expired",
            expiresAt: DEADLINE,
          }),
        },
      },
    };
    mocks.db.transaction.mockImplementation(
      async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );
    const step = createStep();

    const firstResult = await mocks.handler!({
      event: createEvent(),
      step,
    });
    const retryResult = await mocks.handler!({
      event: createEvent(),
      step,
    });

    expect(mocks.trigger).toEqual({
      event: OFFER_RESPONSE_DEADLINE_EVENT,
    });
    expect(step.sleepUntil).toHaveBeenNthCalledWith(
      1,
      "wait-for-response-deadline",
      DEADLINE,
    );
    expect(firstResult).toEqual({
      expired: true,
      offerId: OFFER_ID,
    });
    expect(retryResult).toEqual({
      expired: false,
      offerId: OFFER_ID,
      reason: "Offer status is expired",
    });
    expect(expireEventValues).toHaveBeenCalledTimes(1);
    expect(expireEventValues).toHaveBeenCalledWith({
      offerId: OFFER_ID,
      actorId: SELLER_ID,
      eventType: "expire",
      pricePerSqFt: 2.25,
      quantitySqFt: 400,
      totalPrice: 900,
      message:
        "Automatically expired after the 48-hour response window.",
    });
  });

  it("does not let an older scheduled event expire a counter with a newer deadline", async () => {
    const newerDeadline = new Date(NOW.getTime() + 60_000);
    const expireEventValues = vi.fn();
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: expireEventValues,
      })),
      query: {
        offers: {
          findFirst: vi.fn().mockResolvedValue({
            status: "countered",
            expiresAt: newerDeadline,
          }),
        },
      },
    };
    mocks.db.transaction.mockImplementation(
      async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );
    const step = createStep();

    const result = await mocks.handler!({
      event: createEvent(),
      step,
    });

    expect(result).toEqual({
      expired: false,
      offerId: OFFER_ID,
      reason: "A newer response deadline is active",
    });
    expect(expireEventValues).not.toHaveBeenCalled();
  });
});
