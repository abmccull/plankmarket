import {
  getAnonymousDisplayName,
  shouldRevealIdentity,
} from "./identity/display-name";

type MaskLevel = "hidden" | "full";

/**
 * Determine the identity and contact visibility for an order.
 *
 * | Order status                      | Identity       | Email/phone |
 * |-----------------------------------|----------------|-------------|
 * | pending, confirmed, processing    | Anonymous      | Hidden      |
 * | shipped                           | Anonymous      | Hidden      |
 * | delivered, completed              | Full real name | Full        |
 * | cancelled, refunded               | Anonymous      | Hidden      |
 *
 * Operational ship-to fields are released separately by the order router
 * after confirmation. They must not be confused with profile identity.
 */
export function getMaskLevel(orderStatus: string): {
  identity: "anonymous" | "full";
  contact: MaskLevel;
} {
  if (shouldRevealIdentity(orderStatus)) {
    return {
      identity: "full",
      contact: "full",
    };
  }

  return {
    identity: "anonymous",
    contact: "hidden",
  };
}

/**
 * Legacy helpers remain fail-closed for any caller that still imports them.
 * Partial email domains and phone tails can identify a business.
 */
export function maskEmail(email: string): string {
  void email;
  return "Hidden until delivery";
}

export function maskPhone(phone: string): string {
  void phone;
  return "Hidden until delivery";
}

/**
 * Shape a counterparty for an order without revealing profile identity before
 * delivery. Admins retain full access for support and dispute operations.
 */
export function maskUserForOrder(
  user: {
    id: string;
    name: string;
    businessName?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string;
    businessCity?: string | null;
    businessState?: string | null;
  },
  orderStatus: string,
  isAdmin: boolean = false,
): {
  id: string;
  name: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
} {
  if (isAdmin) {
    return {
      id: user.id,
      name: user.name,
      businessName: user.businessName ?? null,
      email: user.email ?? null,
      phone: user.phone ?? null,
    };
  }

  const maskLevel = getMaskLevel(orderStatus);
  const identityRevealed = maskLevel.identity === "full";

  return {
    id: user.id,
    name: identityRevealed
      ? user.name
      : getAnonymousDisplayName({
          id: user.id,
          role: user.role ?? "buyer",
        }),
    businessName: identityRevealed ? (user.businessName ?? null) : null,
    email: maskLevel.contact === "full" ? (user.email ?? null) : null,
    phone: maskLevel.contact === "full" ? (user.phone ?? null) : null,
  };
}
