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
});
