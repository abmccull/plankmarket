/** Actual seller measurements only; null means the minimum cannot be established. */
export function resolveMinimumOrderSqFt(listing: {
  moq?: number | null;
  moqUnit?: "pallets" | "sqft" | null;
  sqFtPerBox?: number | null;
  boxesPerPallet?: number | null;
}): number | null {
  if (listing.moq == null || listing.moq === 0) return 0;
  if (!Number.isFinite(listing.moq) || listing.moq < 0) return null;
  if (listing.moqUnit === "sqft") return listing.moq;
  if (listing.moqUnit !== "pallets") return null;
  const { sqFtPerBox, boxesPerPallet } = listing;
  if (sqFtPerBox == null || !Number.isFinite(sqFtPerBox) || sqFtPerBox <= 0 ||
      boxesPerPallet == null || !Number.isInteger(boxesPerPallet) || boxesPerPallet <= 0) return null;
  const minimum = listing.moq * sqFtPerBox * boxesPerPallet;
  return Number.isFinite(minimum) && minimum > 0 ? minimum : null;
}
