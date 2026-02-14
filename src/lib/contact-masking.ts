import {
  getAnonymousDisplayName,
  shouldRevealIdentity,
} from "./identity/display-name";

/**
 * Mask level determines what information is shown.
 */
type MaskLevel = "hidden" | "masked" | "full";

/**
 * Determine the mask level for contact info based on order status.
 *
 * | Order Status                     | Identity        | Email/Phone |
 * |----------------------------------|-----------------|-------------|
 * | pending                          | Anonymous       | Hidden      |
 * | confirmed, processing            | Anonymous       | Hidden      |
 * | shipped                          | Anonymous       | Masked      |
 * | delivered, completed             | Full real name  | Full        |
 * | cancelled, refunded              | Anonymous       | Hidden      |
 */
export function getMaskLevel(orderStatus: string): {
  identity: "anonymous" | "full";
  contact: MaskLevel;
} {
  // Check if identity should be revealed (delivered or completed)
  if (shouldRevealIdentity(orderStatus)) {
    return {
      identity: "full",
      contact: "full",
    };
  }

  // Shipped orders show masked contact info
  if (orderStatus === "shipped") {
    return {
      identity: "anonymous",
      contact: "masked",
    };
  }

  // All other statuses hide contact info
  return {
    identity: "anonymous",
    contact: "hidden",
  };
}

/**
 * Mask an email address.
 * "john.doe@example.com" → "jo***@example.com"
 * "a@b.com" → "a***@b.com"
 */
export function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return email; // Invalid email, return as-is
  }

  // Show first 1-2 characters based on length, then asterisks
  const visibleChars = localPart.length === 1 ? 1 : 2;
  const maskedLocal = localPart.slice(0, visibleChars) + "***";

  return `${maskedLocal}@${domain}`;
}

/**
 * Mask a phone number.
 * "555-123-4567" → "***-***-4567"
 * "(555) 123-4567" → "(***) ***-4567"
 */
export function maskPhone(phone: string): string {
  // Extract last 4 digits
  const digits = phone.replace(/\D/g, "");
  const lastFour = digits.slice(-4);

  // Detect format and apply masking
  if (phone.includes("(") && phone.includes(")")) {
    // Format: (555) 123-4567 → (***) ***-4567
    return `(***) ***-${lastFour}`;
  } else if (phone.includes("-")) {
    // Format: 555-123-4567 → ***-***-4567
    return `***-***-${lastFour}`;
  } else {
    // No specific format detected, just show asterisks and last 4
    return `******${lastFour}`;
  }
}

/**
 * Apply masking to a user object based on order status.
 * This function is the main entry point used by order routers.
 *
 * @param user - The user data from the database (has name, businessName, email, phone, role, businessState)
 * @param orderStatus - The current order status
 * @param isAdmin - Whether the viewer is an admin (admins always see full info)
 * @returns Masked user object
 */
export function maskUserForOrder(
  user: {
    id: string;
    name: string;
    businessName?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string;
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
  // Admins always see full information
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

  // Determine display name based on identity mask level
  const displayName =
    maskLevel.identity === "full"
      ? user.name
      : getAnonymousDisplayName({ role: user.role ?? "buyer", businessState: user.businessState });

  // Apply contact masking based on contact mask level
  let maskedEmail: string | null = null;
  let maskedPhone: string | null = null;

  if (maskLevel.contact === "full") {
    maskedEmail = user.email ?? null;
    maskedPhone = user.phone ?? null;
  } else if (maskLevel.contact === "masked") {
    maskedEmail = user.email ? maskEmail(user.email) : null;
    maskedPhone = user.phone ? maskPhone(user.phone) : null;
  }
  // For "hidden", leave as null (already set above)

  return {
    id: user.id,
    name: displayName,
    businessName: maskLevel.identity === "full" ? (user.businessName ?? null) : null,
    email: maskedEmail,
    phone: maskedPhone,
  };
}
