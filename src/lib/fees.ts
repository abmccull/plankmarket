import {
  applyBasisPoints,
  basisPointsToPercent,
  basisPointsToRate,
  CURRENT_COMMERCIAL_POLICY,
  type CommercialPolicy,
} from "@/lib/commercial-policy";

export interface OrderFeeBreakdown {
  buyerFee: number;
  totalCharge: number;
  sellerFee: number;
  sellerStripeFee: number;
  totalStripeFee: number;
  platformStripeFee: number;
  sellerPayout: number;
}

/**
 * Canonical marketplace fee policy for new orders.
 *
 * Historical orders keep their persisted fee amounts; these constants are only
 * used when calculating a new order or previewing one in the UI.
 */
export const BUYER_MARKETPLACE_FEE_RATE = basisPointsToRate(
  CURRENT_COMMERCIAL_POLICY.buyerMarketplaceFeeBps,
);
export const SELLER_MARKETPLACE_FEE_RATE = basisPointsToRate(
  CURRENT_COMMERCIAL_POLICY.sellerMarketplaceFeeBps,
);
export const PAYMENT_PROCESSING_RATE = basisPointsToRate(
  CURRENT_COMMERCIAL_POLICY.paymentProcessingRateBps,
);
export const PAYMENT_PROCESSING_FIXED_FEE =
  CURRENT_COMMERCIAL_POLICY.paymentProcessingFixedFeeCents / 100;

export const BUYER_MARKETPLACE_FEE_PERCENT =
  basisPointsToPercent(CURRENT_COMMERCIAL_POLICY.buyerMarketplaceFeeBps);
export const SELLER_MARKETPLACE_FEE_PERCENT =
  basisPointsToPercent(CURRENT_COMMERCIAL_POLICY.sellerMarketplaceFeeBps);

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeMoney(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Calculates the immutable financial snapshot for a new order.
 *
 * `buyerFreightCharge` is the freight included in the buyer's PaymentIntent.
 * `sellerFreightContribution` is the complementary freight amount deducted
 * from seller proceeds. The caller persists their sum separately as the full
 * booked freight (`orders.shippingPrice`).
 */
export function calculateOrderFees(
  subtotal: number,
  buyerFreightCharge: number,
  sellerFreightContribution = 0,
  policy: CommercialPolicy = CURRENT_COMMERCIAL_POLICY,
): OrderFeeBreakdown {
  const safeSubtotal = normalizeMoney(subtotal);
  const safeBuyerFreightCharge = normalizeMoney(buyerFreightCharge);
  const safeSellerFreightContribution = normalizeMoney(
    sellerFreightContribution,
  );

  const buyerFee = applyBasisPoints(
    safeSubtotal,
    policy.buyerMarketplaceFeeBps,
  );
  const totalCharge = roundMoney(
    safeSubtotal + safeBuyerFreightCharge + buyerFee,
  );
  const sellerFee = applyBasisPoints(
    safeSubtotal,
    policy.sellerMarketplaceFeeBps,
  );
  const sellerStripeFee = roundMoney(
    basisPointsToRate(policy.paymentProcessingRateBps) * safeSubtotal +
      policy.paymentProcessingFixedFeeCents / 100,
  );
  const totalStripeFee = roundMoney(
    basisPointsToRate(policy.paymentProcessingRateBps) * totalCharge +
      policy.paymentProcessingFixedFeeCents / 100,
  );
  const platformStripeFee = roundMoney(
    Math.max(0, totalStripeFee - sellerStripeFee),
  );
  const sellerPayout = roundMoney(
    safeSubtotal -
      sellerFee -
      sellerStripeFee -
      safeSellerFreightContribution,
  );

  return {
    buyerFee,
    totalCharge,
    sellerFee,
    sellerStripeFee,
    totalStripeFee,
    platformStripeFee,
    sellerPayout,
  };
}

/**
 * Applies an authoritative, exclusive tax calculation to an already-resolved
 * commercial/freight fee snapshot. Tax increases the buyer charge and Stripe's
 * platform-absorbed processing cost, but never increases a platform-liable
 * seller transfer.
 */
export function applyPlatformLiableTaxToOrderFees(
  fees: OrderFeeBreakdown,
  taxAmount: number,
  policy: CommercialPolicy = CURRENT_COMMERCIAL_POLICY,
): OrderFeeBreakdown {
  const safeTaxAmount = normalizeMoney(taxAmount);
  const totalCharge = roundMoney(fees.totalCharge + safeTaxAmount);
  const totalStripeFee = roundMoney(
    basisPointsToRate(policy.paymentProcessingRateBps) * totalCharge +
      policy.paymentProcessingFixedFeeCents / 100,
  );
  return {
    ...fees,
    totalCharge,
    totalStripeFee,
    platformStripeFee: roundMoney(
      Math.max(0, totalStripeFee - fees.sellerStripeFee),
    ),
    // Platform tax liability is withheld from the later seller transfer.
    sellerPayout: fees.sellerPayout,
  };
}
