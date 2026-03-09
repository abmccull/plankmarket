/**
 * Pro membership helpers.
 *
 * Central module for checking Pro status and enforcing free-tier limits.
 */

export type ProStatus = "free" | "active" | "trialing" | "past_due" | "cancelled";

export interface ProCheckable {
  proStatus: string;
  proExpiresAt: Date | null;
}

/**
 * Returns true if the user currently has Pro access.
 * Includes grace period: cancelled users retain access until proExpiresAt.
 */
export function isPro(user: ProCheckable): boolean {
  if (user.proStatus === "active" || user.proStatus === "trialing" || user.proStatus === "past_due") return true;
  // Grace period: cancelled but paid period hasn't ended yet
  if (
    user.proStatus === "cancelled" &&
    user.proExpiresAt &&
    user.proExpiresAt > new Date()
  ) {
    return true;
  }
  return false;
}

export const FREE_LIMITS = {
  activeListings: 10,
  savedSearches: 3,
} as const;

/** Monthly promotion credit amount granted to Pro subscribers (in dollars). */
export const PRO_MONTHLY_CREDIT = 15;
