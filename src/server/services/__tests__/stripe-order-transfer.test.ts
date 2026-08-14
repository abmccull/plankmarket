import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { findStripeTransferForOrder } from "../stripe-order-transfer";

function transfer(id: string, orderId: string): Stripe.Transfer {
  return {
    id,
    metadata: { orderId },
  } as unknown as Stripe.Transfer;
}

function stripeWithTransferPages(
  pages: Array<{ data: Stripe.Transfer[]; has_more: boolean }>,
) {
  const list = vi.fn();
  for (const page of pages) list.mockResolvedValueOnce(page);
  return {
    stripe: { transfers: { list } } as unknown as Stripe,
    list,
  };
}

describe("findStripeTransferForOrder", () => {
  const orderCreatedAt = new Date("2026-01-01T00:00:00.000Z");

  it("returns the unique transfer found by the current transfer group", async () => {
    const expected = transfer("tr_grouped", "order-1");
    const { stripe, list } = stripeWithTransferPages([
      { data: [expected], has_more: false },
    ]);

    await expect(
      findStripeTransferForOrder({
        stripe,
        orderId: "order-1",
        orderCreatedAt,
        destination: "acct_seller",
      }),
    ).resolves.toBe(expected);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({
      transfer_group: "order_order-1",
      limit: 100,
    });
  });

  it("recovers a legacy metadata-only transfer across pages", async () => {
    const expected = transfer("tr_legacy", "order-1");
    const unrelated = transfer("tr_unrelated", "another-order");
    const { stripe, list } = stripeWithTransferPages([
      { data: [], has_more: false },
      { data: [unrelated], has_more: true },
      { data: [expected], has_more: false },
    ]);

    await expect(
      findStripeTransferForOrder({
        stripe,
        orderId: "order-1",
        orderCreatedAt,
        destination: "acct_seller",
      }),
    ).resolves.toBe(expected);
    expect(list).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ starting_after: unrelated.id }),
    );
  });

  it("returns undefined only after both current and legacy searches are empty", async () => {
    const { stripe } = stripeWithTransferPages([
      { data: [], has_more: false },
      { data: [], has_more: false },
    ]);

    await expect(
      findStripeTransferForOrder({
        stripe,
        orderId: "order-1",
        orderCreatedAt,
      }),
    ).resolves.toBeUndefined();
  });

  it("returns undefined when the legacy scan is incomplete and unmatched", async () => {
    const filler = Array.from({ length: 100 }, (_, index) =>
      transfer(`tr_other_${index}`, "another-order"),
    );
    const { stripe } = stripeWithTransferPages([
      { data: [], has_more: false },
      ...Array.from({ length: 10 }, () => ({
        data: filler,
        has_more: true,
      })),
    ]);

    await expect(
      findStripeTransferForOrder({
        stripe,
        orderId: "order-1",
        orderCreatedAt,
        destination: "acct_seller",
      }),
    ).resolves.toBeUndefined();
  });

  it("fails closed when multiple transfers claim the same order", async () => {
    const { stripe } = stripeWithTransferPages([
      {
        data: [
          transfer("tr_first", "order-1"),
          transfer("tr_second", "order-1"),
        ],
        has_more: false,
      },
    ]);

    await expect(
      findStripeTransferForOrder({
        stripe,
        orderId: "order-1",
        orderCreatedAt,
      }),
    ).rejects.toThrow("Multiple seller transfers");
  });
});
