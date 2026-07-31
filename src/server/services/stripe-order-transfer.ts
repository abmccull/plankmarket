import type Stripe from "stripe";

const LEGACY_TRANSFER_SCAN_PAGE_LIMIT = 10;

function matchingOrderTransfers(
  transfers: Stripe.Transfer[],
  orderId: string,
): Stripe.Transfer[] {
  return transfers.filter(
    (candidate) => candidate.metadata.orderId === orderId,
  );
}

function requireUniqueTransfer(
  matches: Stripe.Transfer[],
  orderId: string,
): Stripe.Transfer | undefined {
  if (matches.length > 1) {
    throw new Error(`Multiple seller transfers exist for order ${orderId}`);
  }
  return matches[0];
}

/**
 * Recover a transfer whose provider creation committed before the local order
 * transaction did. New transfers are found by transfer_group. The bounded
 * legacy scan covers the previous payout implementation, which wrote orderId
 * metadata but did not set a transfer group.
 */
export async function findStripeTransferForOrder(params: {
  stripe: Stripe;
  orderId: string;
  orderCreatedAt: Date;
  destination?: string;
}): Promise<Stripe.Transfer | undefined> {
  const grouped = await params.stripe.transfers.list({
    transfer_group: `order_${params.orderId}`,
    limit: 100,
  });
  const groupedMatch = requireUniqueTransfer(
    matchingOrderTransfers(grouped.data, params.orderId),
    params.orderId,
  );
  if (groupedMatch) return groupedMatch;

  let startingAfter: string | undefined;
  const legacyMatches: Stripe.Transfer[] = [];
  for (let page = 0; page < LEGACY_TRANSFER_SCAN_PAGE_LIMIT; page += 1) {
    const result = await params.stripe.transfers.list({
      created: {
        gte: Math.max(
          0,
          Math.floor(params.orderCreatedAt.getTime() / 1000) - 5 * 60,
        ),
      },
      ...(params.destination ? { destination: params.destination } : {}),
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    legacyMatches.push(...matchingOrderTransfers(result.data, params.orderId));
    requireUniqueTransfer(legacyMatches, params.orderId);
    if (!result.has_more) return legacyMatches[0];

    const lastTransfer = result.data[result.data.length - 1];
    if (!lastTransfer) break;
    startingAfter = lastTransfer.id;
  }

  if (legacyMatches[0]) return legacyMatches[0];
  throw new Error(
    `Legacy seller-transfer scan limit reached for order ${params.orderId}; refusing to create or refund without reconciliation`,
  );
}
