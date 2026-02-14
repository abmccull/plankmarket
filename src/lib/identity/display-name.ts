/**
 * Identity masking utilities for PlankMarket's anti-circumvention system.
 *
 * Core principle: Buyers and sellers should NOT see each other's real business
 * names until a transaction is completed (order status: delivered/completed).
 *
 * This prevents direct contact and circumvention of the platform.
 */

/**
 * Generate an anonymous display name based on user role and state.
 *
 * @example
 * getAnonymousDisplayName({ role: "seller", businessState: "FL" })
 * // => "Verified Seller in FL"
 *
 * @example
 * getAnonymousDisplayName({ role: "buyer", businessState: "TX" })
 * // => "Verified Buyer in TX"
 *
 * @example
 * getAnonymousDisplayName({ role: "seller", businessState: null })
 * // => "Verified Seller"
 *
 * @example
 * getAnonymousDisplayName({ role: "admin", businessState: null })
 * // => "PlankMarket Support"
 */
export function getAnonymousDisplayName(user: {
  role: string;
  businessState?: string | null;
}): string {
  // Admin users are always revealed as platform support
  if (user.role === "admin") {
    return "PlankMarket Support";
  }

  // Capitalize role for display
  const roleLabel = getRoleLabel(user.role);

  // Include state if available
  if (user.businessState) {
    return `Verified ${roleLabel} in ${user.businessState}`;
  }

  return `Verified ${roleLabel}`;
}

/**
 * Determine whether real identity should be revealed based on order status.
 *
 * Identity is only revealed when the transaction is completed or delivered,
 * indicating that the business relationship has been established through
 * the platform.
 *
 * @param orderStatus - The current order status
 * @returns true if identity should be revealed, false otherwise
 */
export function shouldRevealIdentity(orderStatus: string): boolean {
  const revealStatuses = ["delivered", "completed"];
  return revealStatuses.includes(orderStatus);
}

/**
 * Get the role label for display with variety.
 *
 * Uses a simple hash of userId to deterministically vary the label while
 * maintaining consistency for the same user across the app.
 *
 * @param role - The user role ("seller", "buyer", "admin")
 * @param userId - Optional user ID for deterministic variation
 * @returns Capitalized role label with variation
 */
export function getRoleLabel(role: string, userId?: string): string {
  switch (role) {
    case "seller": {
      // Vary between "Seller" and "Supplier" based on user ID
      if (userId && simpleHash(userId) % 2 === 0) {
        return "Supplier";
      }
      return "Seller";
    }
    case "buyer": {
      // Vary between "Buyer" and "Professional" based on user ID
      if (userId && simpleHash(userId) % 2 === 0) {
        return "Professional";
      }
      return "Buyer";
    }
    case "admin":
      return "Admin";
    default:
      // Fallback: capitalize first letter
      return role.charAt(0).toUpperCase() + role.slice(1);
  }
}

/**
 * Get initials for avatar placeholder.
 *
 * Returns two-letter initials based on the anonymous display name.
 *
 * @example
 * getAnonymousInitials("seller") // => "VS" (Verified Seller)
 * getAnonymousInitials("buyer") // => "VB" (Verified Buyer)
 * getAnonymousInitials("admin") // => "PS" (PlankMarket Support)
 */
export function getAnonymousInitials(role: string): string {
  switch (role) {
    case "seller":
      return "VS"; // Verified Seller
    case "buyer":
      return "VB"; // Verified Buyer
    case "admin":
      return "PS"; // PlankMarket Support
    default:
      return "V" + role.charAt(0).toUpperCase();
  }
}

/**
 * Simple hash function for deterministic variation.
 *
 * Takes a string (user ID) and returns a consistent numeric hash.
 * Used to vary role labels while maintaining consistency per user.
 *
 * @param str - String to hash
 * @returns Numeric hash value
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
