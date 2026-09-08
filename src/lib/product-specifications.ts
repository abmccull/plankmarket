import { z } from "zod";

export const packagingTypes = ["unknown", "sealed_cartons", "open_cartons", "loose_boards", "mixed"] as const;
export const installationMethods = ["unknown", "click_lock", "glue_down", "nail_down", "staple_down", "floating", "multiple"] as const;
export const waterResistanceValues = ["unknown", "not_waterproof", "water_resistant", "waterproof"] as const;
export type SpecificationProvenance = "unknown" | "seller_declared" | "evidence_reviewed";

// Review status is deliberately absent from seller-editable fields.
export const productSpecificationFields = {
  packagingType: z.enum(packagingTypes).optional(),
  installationMethod: z.enum(installationMethods).optional(),
  lotNumber: z.string().trim().max(100).optional(),
  waterResistance: z.enum(waterResistanceValues).optional(),
};
export const specificationKeys = ["packagingType", "installationMethod", "lotNumber", "waterResistance", "brand", "modelNumber", "materialType", "species", "finish", "grade", "thickness", "width", "length", "wearLayer", "sqFtPerBox", "boxesPerPallet", "certifications"] as const;

export function sellerSpecificationProvenance(input: Record<string, unknown>): SpecificationProvenance {
  return specificationKeys.some(key => {
    const value = input[key];
    return value != null && value !== "" && value !== "unknown" && (!Array.isArray(value) || value.length > 0);
  }) ? "seller_declared" : "unknown";
}

export function specificationReviewInvalidated(previous: Record<string, unknown>, changes: Record<string, unknown>): boolean {
  return specificationKeys.some(key => Object.prototype.hasOwnProperty.call(changes, key)
    && JSON.stringify(changes[key] ?? null) !== JSON.stringify(previous[key] ?? null));
}

export function hasReviewedWaterproofSpecification(listing: { waterResistance?: string | null; specificationProvenance?: string | null; specificationReviewedAt?: Date | string | null; specificationEvidenceId?: string | null }): boolean {
  return listing.waterResistance === "waterproof" && listing.specificationProvenance === "evidence_reviewed"
    && Boolean(listing.specificationReviewedAt) && Boolean(listing.specificationEvidenceId);
}

export function specificationLabel(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "Unknown";
}
