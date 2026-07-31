import {
  submitVerificationSchema,
  type SaveVerificationDraftInput,
} from "@/lib/validators/auth";

export interface StoredVerificationDraftFields {
  businessWebsite: string | null;
  einTaxId: string | null;
  verificationDocUrl: string | null;
  businessAddress: string | null;
  businessCity: string | null;
  businessState: string | null;
  businessZip: string | null;
}

const normalize = (value: string | undefined, fallback: string | null) =>
  value === undefined ? fallback : value.trim() || null;

/** Merge a partial step save without erasing fields from another saved step. */
export function mergeVerificationDraftFields(
  existing: StoredVerificationDraftFields | null | undefined,
  input: SaveVerificationDraftInput,
): StoredVerificationDraftFields {
  return {
    businessWebsite: normalize(
      input.businessWebsite,
      existing?.businessWebsite ?? null,
    ),
    einTaxId: normalize(input.einTaxId, existing?.einTaxId ?? null),
    verificationDocUrl: normalize(
      input.verificationDocUrl,
      existing?.verificationDocUrl ?? null,
    ),
    businessAddress: normalize(
      input.businessAddress,
      existing?.businessAddress ?? null,
    ),
    businessCity: normalize(
      input.businessCity,
      existing?.businessCity ?? null,
    ),
    businessState: normalize(
      input.businessState?.toUpperCase(),
      existing?.businessState ?? null,
    ),
    businessZip: normalize(input.businessZip, existing?.businessZip ?? null),
  };
}

/** The strict final gate for a server-saved draft. */
export function parseVerificationDraftSubmission(
  draft: StoredVerificationDraftFields,
) {
  return submitVerificationSchema.safeParse({
    einTaxId: draft.einTaxId ?? "",
    businessWebsite: draft.businessWebsite ?? "",
    verificationDocUrl: draft.verificationDocUrl ?? "",
    businessAddress: draft.businessAddress ?? "",
    businessCity: draft.businessCity ?? "",
    businessState: draft.businessState ?? "",
    businessZip: draft.businessZip ?? "",
  });
}
