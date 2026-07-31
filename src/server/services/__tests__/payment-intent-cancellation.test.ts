import { beforeEach, describe, expect, it, vi } from "vitest";

const { retrieve, cancel } = vi.hoisted(() => ({
  retrieve: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    paymentIntents: { retrieve, cancel },
  },
}));

import { cancelUncapturedOrderPayment } from "../payment-intent-cancellation";

const matchingIntent = {
  id: "pi_order",
  amount: 10_000,
  currency: "usd",
  metadata: { orderId: "order-1" },
  status: "requires_payment_method",
};

describe("cancelUncapturedOrderPayment", () => {
  beforeEach(() => {
    retrieve.mockReset();
    cancel.mockReset();
  });

  it("cancels a matching uncaptured PaymentIntent idempotently", async () => {
    retrieve.mockResolvedValue(matchingIntent);
    cancel.mockResolvedValue({ ...matchingIntent, status: "canceled" });

    await expect(
      cancelUncapturedOrderPayment({
        orderId: "order-1",
        paymentIntentId: "pi_order",
        expectedAmountCents: 10_000,
      }),
    ).resolves.toEqual({
      cancelled: true,
      reason: "PaymentIntent cancelled",
    });
    expect(cancel).toHaveBeenCalledWith(
      "pi_order",
      {},
      { idempotencyKey: "cancel-order-payment:order-1" },
    );
  });

  it("fails closed instead of cancelling a succeeded payment", async () => {
    retrieve.mockResolvedValue({ ...matchingIntent, status: "succeeded" });

    await expect(
      cancelUncapturedOrderPayment({
        orderId: "order-1",
        paymentIntentId: "pi_order",
        expectedAmountCents: 10_000,
      }),
    ).rejects.toThrow("not safe to cancel");
    expect(cancel).not.toHaveBeenCalled();
  });

  it("rejects a PaymentIntent bound to another order", async () => {
    retrieve.mockResolvedValue({
      ...matchingIntent,
      metadata: { orderId: "different-order" },
    });

    await expect(
      cancelUncapturedOrderPayment({
        orderId: "order-1",
        paymentIntentId: "pi_order",
        expectedAmountCents: 10_000,
      }),
    ).rejects.toThrow("does not match");
    expect(cancel).not.toHaveBeenCalled();
  });
});
