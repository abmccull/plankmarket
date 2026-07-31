export const VERIFICATION_STATUSES = [
  "unverified",
  "pending",
  "verified",
  "rejected",
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export function isVerificationStatus(
  value: string,
): value is VerificationStatus {
  return VERIFICATION_STATUSES.includes(value as VerificationStatus);
}

/**
 * verificationStatus is the authorization source of truth. The legacy
 * `verified` boolean is written in lockstep for compatibility and protected by
 * a database check constraint.
 */
export function verificationStateUpdate(status: VerificationStatus) {
  return {
    verificationStatus: status,
    verified: status === "verified",
  } as const;
}

export const VERIFIED_BUSINESS_PROFILE_FIELDS = [
  "businessName",
  "businessAddress",
  "businessCity",
  "businessState",
  "businessZip",
] as const;

type VerifiedBusinessProfileField =
  (typeof VERIFIED_BUSINESS_PROFILE_FIELDS)[number];
type VerifiedBusinessProfile = Record<
  VerifiedBusinessProfileField,
  string | null | undefined
>;

export function getChangedVerifiedBusinessFields(
  current: VerifiedBusinessProfile,
  update: Partial<VerifiedBusinessProfile>,
): VerifiedBusinessProfileField[] {
  return VERIFIED_BUSINESS_PROFILE_FIELDS.filter((field) => {
    if (!Object.prototype.hasOwnProperty.call(update, field)) return false;
    return (update[field] ?? null) !== (current[field] ?? null);
  });
}
