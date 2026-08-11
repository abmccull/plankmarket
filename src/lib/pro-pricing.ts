export type BillingInterval = "monthly" | "annual";

export function resolveBillingInterval(
  value: string | undefined,
): BillingInterval {
  return value === "monthly" ? "monthly" : "annual";
}
