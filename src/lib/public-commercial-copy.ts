import { CURRENT_COMMERCIAL_POLICY, basisPointsToPercent } from "@/lib/commercial-policy";
import { calculateOrderFees } from "@/lib/fees";
import { formatCurrency } from "@/lib/utils";

function formatPercent(value: number): string {
  if (Number.isInteger(value)) {
    return value.toFixed(0);
  }

  return value.toFixed(2).replace(/\.?0+$/, "");
}

const buyerMarketplaceFeePercent = formatPercent(
  basisPointsToPercent(CURRENT_COMMERCIAL_POLICY.buyerMarketplaceFeeBps),
);
const sellerMarketplaceFeePercent = formatPercent(
  basisPointsToPercent(CURRENT_COMMERCIAL_POLICY.sellerMarketplaceFeeBps),
);
const paymentProcessingRatePercent = formatPercent(
  basisPointsToPercent(CURRENT_COMMERCIAL_POLICY.paymentProcessingRateBps),
);
const paymentProcessingFixedFee = formatCurrency(
  CURRENT_COMMERCIAL_POLICY.paymentProcessingFixedFeeCents / 100,
);

const exampleOrderFees = calculateOrderFees(10_000, 600);

export const PUBLIC_COMMERCIAL_COPY = Object.freeze({
  buyerMarketplaceFeePercent,
  sellerMarketplaceFeePercent,
  paymentProcessingRatePercent,
  paymentProcessingFixedFee,
  buyerMarketplaceFeeLabel: `${buyerMarketplaceFeePercent}% buyer fee`,
  sellerMarketplaceFeeLabel: `${sellerMarketplaceFeePercent}% seller fee`,
  sellerProcessingLabel: `${paymentProcessingRatePercent}% + ${paymentProcessingFixedFee}`,
  supportedMarketAvailability:
    "Availability depends on seller-defined territories and current supported-market coverage.",
  exampleOrder: Object.freeze({
    inventorySubtotal: formatCurrency(10_000),
    quotedFreight: formatCurrency(600),
    buyerFee: formatCurrency(exampleOrderFees.buyerFee),
    buyerTotal: formatCurrency(exampleOrderFees.totalCharge),
    sellerFee: formatCurrency(exampleOrderFees.sellerFee),
    sellerStripeFee: formatCurrency(exampleOrderFees.sellerStripeFee),
    projectedSellerTransfer: formatCurrency(exampleOrderFees.sellerPayout),
  }),
  notRegulatedEscrow:
    "PlankMarket is not a regulated escrow service and does not act as a trustee, fiduciary, or regulated funds custodian.",
  paymentHoldModel:
    "Stripe processes a platform charge at checkout. After live carrier pickup is confirmed and the configured delay passes, PlankMarket initiates a separate Stripe Connect transfer if payment, shipment, refund, and dispute checks still pass.",
  sellerTransferWithhold:
    "The seller transfer is withheld when live pickup evidence is missing, the shipment is a dry-run, the charge is refunded or disputed, or a marketplace dispute is open.",
  sellerTransferTiming:
    "Seller transfer begins after confirmed live pickup, the configured delay, and transaction-state checks. It is not a guaranteed payout on pickup alone.",
});
