import { z } from "zod";
import type { ListingFormInput } from "./listing";

// Editable fields only. This shape protects storage; listingCreationSchema remains
// the publication gate. Never apply creation defaults while saving a draft.
export const LISTING_DRAFT_FIELD_TYPES = {
  warehouseId: "text", warehouseRevision: "number",
  packagingType: "text", installationMethod: "text", lotNumber: "text", waterResistance: "text",
  title: "text", description: "text", materialType: "text", species: "text", finish: "text", grade: "text",
  color: "text", colorFamily: "text", brand: "text", modelNumber: "text", moqUnit: "text",
  nmfcCode: "text", freightClass: "text", locationCity: "text", locationState: "text", locationZip: "text",
  condition: "text", reasonCode: "text", territoryMode: "text", freightPaymentMode: "text",
  thickness: "number", width: "number", length: "number", wearLayer: "number",
  sqFtPerBox: "number", boxesPerPallet: "number", buyNowPrice: "number", floorPrice: "number",
  totalSqFt: "number", totalPallets: "number", moq: "number", palletWeight: "number", palletLength: "number",
  palletWidth: "number", palletHeight: "number", askPricePerSqFt: "number",
  partialQuantityMarkupPercent: "number", automaticMarkdownFloorPercent: "number",
  automaticMarkdownIntervalDays: "number", freightDropCharge: "number",
  allowOffers: "boolean", fullLotOnly: "boolean", automaticMarkdownEnabled: "boolean", allowSampleRequests: "boolean",
  certifications: "strings", allowedDestinationStates: "strings", sellerFreightStates: "strings",
} as const satisfies Partial<Record<keyof ListingFormInput, "text" | "number" | "boolean" | "strings">>;

export type ListingDraftFormData = Partial<Record<keyof typeof LISTING_DRAFT_FIELD_TYPES, string | number | boolean | null | string[]>>;
const fieldValue = z.union([z.string().max(10_000), z.number().finite(), z.boolean(), z.null(), z.array(z.string().max(100)).max(100)]).optional();
const draftFormDataSchema = z.record(z.string(), fieldValue).superRefine((data, ctx) => {
  for (const [field, value] of Object.entries(data)) {
    if (!Object.hasOwn(LISTING_DRAFT_FIELD_TYPES, field)) {
      ctx.addIssue({ code: "custom", path: [field], message: "This field cannot be saved in a listing draft." });
      continue;
    }
    const type = LISTING_DRAFT_FIELD_TYPES[field as keyof typeof LISTING_DRAFT_FIELD_TYPES];
    if (value === undefined) continue;
    const valid = type === "text" ? typeof value === "string"
      : type === "number" ? value === null || typeof value === "number"
      : type === "boolean" ? typeof value === "boolean"
      : Array.isArray(value) && value.every(item => typeof item === "string");
    if (!valid) ctx.addIssue({ code: "custom", path: [field], message: "This draft field has an unsupported value." });
  }
}).transform(data => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as ListingDraftFormData);

export const listingDraftSnapshotSchema = z.object({
  schemaVersion: z.literal(2),
  currentStep: z.number().int().min(1).max(3),
  defaultsApplied: z.boolean(),
  // Zod records sanitize __proto__ before field refinements; reject it while
  // inspecting the raw own keys so malformed snapshots fail explicitly.
  formData: z.unknown().superRefine((raw, ctx) => {
    if (raw !== null && typeof raw === "object" && Object.hasOwn(raw, "__proto__")) {
      ctx.addIssue({ code: "custom", message: "This field cannot be saved in a listing draft." });
    }
  }).pipe(draftFormDataSchema),
  uploadedMediaIds: z.array(z.string().uuid()).max(20).refine(ids => new Set(ids).size === ids.length, "Choose distinct photos."),
}).strict().refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 100_000, "This listing draft is too large to save.");

export type ListingDraftSnapshot = z.infer<typeof listingDraftSnapshotSchema>;
export const listingDraftReferenceSchema = z.object({ id: z.string().uuid(), revision: z.number().int().min(1) }).strict();
export type ListingDraftReference = z.infer<typeof listingDraftReferenceSchema>;
export const saveListingDraftSchema = z.object({
  id: z.string().uuid(), expectedRevision: z.number().int().min(1).nullable(),
  operationId: z.string().uuid(), snapshot: listingDraftSnapshotSchema,
}).strict();
export const advanceListingDraftSchema = z.object({
  id: z.string().uuid(), expectedRevision: z.number().int().min(1),
  nextId: z.string().uuid(), operationId: z.string().uuid(),
}).strict().refine(value => value.id !== value.nextId, "A new lot needs a new draft identity.");

export const blankListingDraftSnapshot = (): ListingDraftSnapshot => ({
  schemaVersion: 2, currentStep: 1, defaultsApplied: false, formData: {}, uploadedMediaIds: [],
});
