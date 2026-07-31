export interface MarketplaceHealthInput {
  windowDays: number;
  activeListings: number;
  activeSupplySqFt: number;
  openBuyerRequests: number;
  openDemandSqFt: number;
  requests: {
    total: number;
    responded: number;
    matched: number;
    averageHoursToResponse: number | null;
  };
  listings: {
    total: number;
    withOffers: number;
  };
  offers: {
    total: number;
    responded: number;
    averageHoursToResponse: number | null;
  };
  orders: {
    paid: number;
    delivered: number;
    withIssues: number;
    averageHoursToPickup: number | null;
  };
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round((numerator / denominator) * 100) : null;
}

function optionalHours(value: number | null): number | null {
  return value === null ? null : round(Math.max(0, value));
}

export function calculateMarketplaceHealth(input: MarketplaceHealthInput) {
  return {
    windowDays: input.windowDays,
    activeListings: input.activeListings,
    activeSupplySqFt: round(input.activeSupplySqFt, 0),
    openBuyerRequests: input.openBuyerRequests,
    openDemandSqFt: round(input.openDemandSqFt, 0),
    supplyCoverage:
      input.openDemandSqFt > 0
        ? round(input.activeSupplySqFt / input.openDemandSqFt, 2)
        : null,
    requestResponseRate: rate(
      input.requests.responded,
      input.requests.total,
    ),
    requestMatchRate: rate(input.requests.matched, input.requests.total),
    averageHoursToRequestResponse: optionalHours(
      input.requests.averageHoursToResponse,
    ),
    listingOfferRate: rate(
      input.listings.withOffers,
      input.listings.total,
    ),
    offerResponseRate: rate(input.offers.responded, input.offers.total),
    averageHoursToOfferResponse: optionalHours(
      input.offers.averageHoursToResponse,
    ),
    paidOrders: input.orders.paid,
    orderCompletionRate: rate(input.orders.delivered, input.orders.paid),
    averageHoursToPickup: optionalHours(input.orders.averageHoursToPickup),
    transactionIssueRate: rate(input.orders.withIssues, input.orders.paid),
  };
}

export type MarketplaceHealth = ReturnType<typeof calculateMarketplaceHealth>;
