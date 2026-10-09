import { resolveMinimumOrderSqFt } from "./minimum-order-quantity";
import { calculateOrderFees } from "@/lib/fees";
import { getDirectPurchaseUnitPrice, resolveListingUnitPrice } from "@/lib/listing-pricing";
import { parsePurchaseIntent } from "./purchase-intent";

export interface PublicPurchaseTerms {
  fullLotOnly: boolean;
  partialQuantityMarkupPercent: number | null;
  sqFtPerBox: number | null;
  boxesPerPallet: number | null;
}

export interface QuantityPreviewListing {
  totalSqFt: number;
  askPricePerSqFt: number;
  buyNowPrice?: number | null;
  moq?: number | null;
  moqUnit?: "sqft" | "pallets" | null;
  purchaseTerms?: PublicPurchaseTerms;
}

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const roundArea = (value: number) => Math.round(value * 10000) / 10000;
const fitsBoxes = (quantity: number, boxSize: number) => {
  const remainder = quantity % boxSize;
  return remainder <= 0.01 || boxSize - remainder <= 0.01;
};

/** Null means unknown; a pallet minimum must never use guessed packaging. */
export function getKnownMinimumOrderSqFt(listing: Pick<QuantityPreviewListing, "moq" | "moqUnit" | "purchaseTerms">): number | null {
  return resolveMinimumOrderSqFt({
    moq: listing.moq,
    moqUnit: listing.moqUnit,
    sqFtPerBox: listing.purchaseTerms?.sqFtPerBox,
    boxesPerPallet: listing.purchaseTerms?.boxesPerPallet,
  });
}

/** A comparison suggestion, never a reservation, quote or authorization to buy. */
export function getPurchaseQuantityPreview(listing: QuantityPreviewListing, requested?: number) {
  const requestedSqFt = parsePurchaseIntent({ quantitySqFt: requested }).quantitySqFt;
  if (requestedSqFt === undefined) return null;
  const missing = (reason: "order_terms" | "pallet_details" | "box_conflict" | "price") => ({ status: "needs_details" as const, reason, requestedSqFt });
  const unavailable = (reason: "stock" | "minimum" | "boxes") => ({ status: "unavailable" as const, reason, requestedSqFt });
  if (!positive(listing.totalSqFt) || requestedSqFt > listing.totalSqFt) return unavailable("stock");
  const terms = listing.purchaseTerms;
  if (!terms || typeof terms.fullLotOnly !== "boolean" || terms.partialQuantityMarkupPercent === undefined) return missing("order_terms");
  const minimumSqFt = getKnownMinimumOrderSqFt(listing);
  if (minimumSqFt === null) return missing(listing.moqUnit === "pallets" ? "pallet_details" : "order_terms");
  if (minimumSqFt > listing.totalSqFt) return unavailable("minimum");
  if (terms.sqFtPerBox != null && !positive(terms.sqFtPerBox)) return missing("box_conflict");
  const adjustments: Array<"full_lot" | "minimum" | "boxes"> = [];
  let quantitySqFt = terms.fullLotOnly ? listing.totalSqFt : Math.max(requestedSqFt, minimumSqFt);
  if (terms.fullLotOnly && quantitySqFt > requestedSqFt) adjustments.push("full_lot");
  else if (minimumSqFt > requestedSqFt) adjustments.push("minimum");
  const boxSize = terms.sqFtPerBox;
  if (boxSize) {
    if (terms.fullLotOnly) {
      // This is the same tolerance as direct checkout's box validation.
      if (!fitsBoxes(quantitySqFt, boxSize)) return missing("box_conflict");
    } else {
      // Packaging uses real columns. Remove only representation-scale noise,
      // never lower an exact minimum or clamp a carton above available stock.
      const nearestBoxQuantity = Math.round(quantitySqFt / boxSize) * boxSize;
      const noise = Math.min(0.01, Math.max(1e-8, Math.abs(nearestBoxQuantity) * 2 ** -23));
      const adjusted = Math.abs(quantitySqFt - nearestBoxQuantity) <= noise && fitsBoxes(quantitySqFt, boxSize)
        ? quantitySqFt
        : Math.ceil(quantitySqFt / boxSize) * boxSize;
      const normalized = roundArea(adjusted);
      const rounded = normalized >= minimumSqFt && normalized + 1e-8 >= requestedSqFt && normalized <= listing.totalSqFt && fitsBoxes(normalized, boxSize)
        ? normalized : adjusted;
      if (rounded > quantitySqFt + 1e-8) adjustments.push("boxes");
      quantitySqFt = rounded;
    }
  }
  if (quantitySqFt > listing.totalSqFt) return unavailable("boxes");
  if (quantitySqFt + 1e-8 < requestedSqFt || quantitySqFt < minimumSqFt || !positive(quantitySqFt) || (boxSize && !fitsBoxes(quantitySqFt, boxSize))) return missing("box_conflict");
  const price = resolveListingUnitPrice({ baseUnitPrice: getDirectPurchaseUnitPrice(listing), availableQuantity: listing.totalSqFt,
    requestedQuantity: quantitySqFt, fullLotOnly: terms.fullLotOnly, partialQuantityMarkupPercent: terms.partialQuantityMarkupPercent });
  if (!price.purchaseAllowed || !positive(price.finalUnitPrice)) return missing("price");
  const subtotal = Math.round(quantitySqFt * price.finalUnitPrice * 100) / 100;
  if (!positive(subtotal)) return missing("price");
  const fees = calculateOrderFees(subtotal, 0);
  return { status: "ready" as const, requestedSqFt, quantitySqFt, minimumSqFt, extraSqFt: Math.max(0, roundArea(quantitySqFt - requestedSqFt)),
    adjustments, unitPrice: price.finalUnitPrice, subtotal, buyerFee: fees.buyerFee, totalBeforeShippingAndTax: fees.totalCharge,
    partialMarkupPercent: price.partialQuantity.applied ? price.partialQuantity.markupPercent : 0 };
}

export type PurchaseQuantityPreview = ReturnType<typeof getPurchaseQuantityPreview>;
