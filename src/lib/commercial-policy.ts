import releaseContract from "@/lib/release-contract.json";

export const BASIS_POINTS_PER_UNIT = 10_000;

/**
 * A commercial policy is immutable once it is used for an order.
 *
 * Changes require a new version so an order, quote, refund, and finance report
 * can always explain the exact rules that produced their persisted amounts.
 */
export interface CommercialPolicy {
  version: number;
  buyerMarketplaceFeeBps: number;
  sellerMarketplaceFeeBps: number;
  paymentProcessingRateBps: number;
  paymentProcessingFixedFeeCents: number;
  shippingMarkupBps: number;
}

export interface CommercialPolicySnapshot extends CommercialPolicy {
  capturedAt: string;
}

export const CURRENT_COMMERCIAL_POLICY: Readonly<CommercialPolicy> =
  Object.freeze({
    version: releaseContract.commercialPolicyVersion,
    buyerMarketplaceFeeBps: 500,
    sellerMarketplaceFeeBps: 500,
    paymentProcessingRateBps: 290,
    paymentProcessingFixedFeeCents: 30,
    shippingMarkupBps: 2_500,
  });

export function basisPointsToRate(basisPoints: number): number {
  return basisPoints / BASIS_POINTS_PER_UNIT;
}

export function basisPointsToPercent(basisPoints: number): number {
  return basisPoints / 100;
}

export function applyBasisPoints(amount: number, basisPoints: number): number {
  return Math.round(
    amount * basisPoints / BASIS_POINTS_PER_UNIT * 100,
  ) / 100;
}

export function applyShippingMarkup(
  carrierRate: number,
  policy: CommercialPolicy = CURRENT_COMMERCIAL_POLICY,
): number {
  const safeCarrierRate =
    Number.isFinite(carrierRate) && carrierRate >= 0 ? carrierRate : 0;
  return (
    Math.round(
      safeCarrierRate *
        (BASIS_POINTS_PER_UNIT + policy.shippingMarkupBps) /
        BASIS_POINTS_PER_UNIT *
        100,
    ) / 100
  );
}

export function captureCommercialPolicy(
  capturedAt = new Date(),
  policy: CommercialPolicy = CURRENT_COMMERCIAL_POLICY,
): CommercialPolicySnapshot {
  return {
    ...policy,
    capturedAt: capturedAt.toISOString(),
  };
}

export function assertCommercialPolicy(
  policy: CommercialPolicy,
): CommercialPolicy {
  const boundedBasisPoints = [
    policy.buyerMarketplaceFeeBps,
    policy.sellerMarketplaceFeeBps,
    policy.paymentProcessingRateBps,
    policy.shippingMarkupBps,
  ];

  if (
    !Number.isInteger(policy.version) ||
    policy.version < 1 ||
    boundedBasisPoints.some(
      (value) => !Number.isInteger(value) || value < 0 || value > 10_000,
    ) ||
    !Number.isInteger(policy.paymentProcessingFixedFeeCents) ||
    policy.paymentProcessingFixedFeeCents < 0
  ) {
    throw new Error("Commercial policy contains invalid rates.");
  }

  return policy;
}
