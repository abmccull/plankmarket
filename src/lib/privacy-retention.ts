const DAY_MS = 24 * 60 * 60 * 1000;

export const VERIFICATION_DRAFT_RETENTION_DAYS = 30;
export const VERIFICATION_EVIDENCE_RETENTION_DAYS = 30;
export const SAMPLE_REQUEST_PII_RETENTION_DAYS = 180;
export const SHIPPING_ADDRESS_RETENTION_DAYS = 365;

export function addRetentionDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}
