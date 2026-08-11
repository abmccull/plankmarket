import { describe, expect, it } from "vitest";
import { CURRENT_COMMERCIAL_POLICY } from "@/lib/commercial-policy";
import { calculateOrderFees } from "@/lib/fees";
import { PUBLIC_COMMERCIAL_COPY } from "@/lib/public-commercial-copy";

describe("public commercial copy", () => {
  it("formats published fee labels from the current commercial policy", () => {
    expect(CURRENT_COMMERCIAL_POLICY.buyerMarketplaceFeeBps).toBe(500);
    expect(CURRENT_COMMERCIAL_POLICY.sellerMarketplaceFeeBps).toBe(500);
    expect(CURRENT_COMMERCIAL_POLICY.paymentProcessingRateBps).toBe(290);
    expect(CURRENT_COMMERCIAL_POLICY.paymentProcessingFixedFeeCents).toBe(30);

    expect(PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeeLabel).toBe("5% buyer fee");
    expect(PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel).toBe("5% seller fee");
    expect(PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel).toBe("2.9% + $0.30");
  });

  it("keeps the public pricing example aligned with the fee calculator", () => {
    const exampleOrderFees = calculateOrderFees(10_000, 600);

    expect(PUBLIC_COMMERCIAL_COPY.exampleOrder).toEqual({
      inventorySubtotal: "$10,000.00",
      quotedFreight: "$600.00",
      buyerFee: "$500.00",
      buyerTotal: "$11,100.00",
      sellerFee: "$500.00",
      sellerStripeFee: "$290.30",
      projectedSellerTransfer: "$9,209.70",
    });
    expect(exampleOrderFees.buyerFee).toBe(500);
    expect(exampleOrderFees.sellerFee).toBe(500);
    expect(exampleOrderFees.sellerStripeFee).toBe(290.3);
    expect(exampleOrderFees.sellerPayout).toBe(9_209.7);
  });
});
