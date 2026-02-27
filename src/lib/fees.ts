export interface OrderFeeBreakdown {
  buyerFee: number;
  totalCharge: number;
  sellerFee: number;
  sellerStripeFee: number;
  totalStripeFee: number;
  platformStripeFee: number;
  sellerPayout: number;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateOrderFees(
  subtotal: number,
  shipping: number,
): OrderFeeBreakdown {
  const safeSubtotal = Math.max(0, subtotal);
  const safeShipping = Math.max(0, shipping);

  const buyerFee = roundMoney(0.03 * (safeSubtotal + safeShipping));
  const totalCharge = roundMoney(safeSubtotal + safeShipping + buyerFee);
  const sellerFee = roundMoney(0.02 * safeSubtotal);
  const sellerStripeFee = roundMoney(0.029 * safeSubtotal + 0.30);
  const totalStripeFee = roundMoney(0.029 * totalCharge + 0.30);
  const platformStripeFee = roundMoney(
    Math.max(0, totalStripeFee - sellerStripeFee),
  );
  const sellerPayout = roundMoney(safeSubtotal - sellerFee - sellerStripeFee);

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
