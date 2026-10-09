import { formatCurrency, formatSqFt, formatPricePerSqFt } from "@/lib/utils";
import type { PurchaseQuantityPreview } from "@/lib/marketplace/purchase-quantity-preview";

export function PurchaseQuantityPreview({ preview, showPrice = true }: { preview: PurchaseQuantityPreview; showPrice?: boolean }) {
  if (!preview) return null;
  if (preview.status !== "ready") {
    return <div className="space-y-1 text-sm" data-quantity-preview={preview.status}>
      <p className="font-medium">{preview.status === "unavailable" ? "Cannot cover this job under the current order terms" : "Confirm order details"}</p>
      <p className="text-muted-foreground">{preview.status === "needs_details" && preview.reason === "pallet_details"
        ? "Pallet square footage needs confirmation before we can estimate your order."
        : "Review this lot with the seller before planning your purchase."}</p>
    </div>;
  }
  const label = preview.adjustments.includes("full_lot") ? "Full lot required" : preview.adjustments.includes("minimum") ? "Minimum order" : "Suggested order";
  return <div className="space-y-1 text-sm" data-quantity-preview="ready">
    <p className="font-medium tabular-nums">{label}: {formatSqFt(preview.quantitySqFt)}</p>
    {preview.extraSqFt > 0 && <p className="text-muted-foreground tabular-nums">{formatSqFt(preview.extraSqFt)} above your requirement{preview.adjustments.includes("boxes") ? " · complete boxes" : ""}</p>}
    {showPrice && <>
      {preview.partialMarkupPercent > 0 && <p className="text-muted-foreground">Includes {preview.partialMarkupPercent}% partial-order markup.</p>}
      <p className="text-muted-foreground tabular-nums">{formatPricePerSqFt(preview.unitPrice)} for this quantity</p>
      <p className="font-semibold tabular-nums">{formatCurrency(preview.totalBeforeShippingAndTax)} estimated materials + buyer fee</p>
      <p className="text-xs text-muted-foreground">Includes {formatCurrency(preview.buyerFee)} buyer fee. Freight and applicable tax extra.</p>
    </>}
  </div>;
}
