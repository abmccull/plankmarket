import type { AppRole } from "@/lib/supabase/roles";

type AuthenticationMethod =
  | string
  | {
      method?: string;
      timestamp?: number;
    };

type AssuranceLevel = "aal1" | "aal2" | (string & {}) | null;

const MFA_METHODS = new Set(["totp", "mfa/totp", "mfa/webauthn"]);

const PRIVATE_ROUTE_PREFIXES = [
  "/buyer",
  "/seller",
  "/admin",
  "/messages",
  "/offers",
  "/notifications",
  "/preferences",
  "/settings",
] as const;

const HIGH_ASSURANCE_ROUTE_PREFIXES = [
  "/admin",
  "/seller/payments",
  "/seller/payouts",
  "/seller/stripe-onboarding",
] as const;

const SELLER_FINANCIAL_PROCEDURES = new Set([
  "payment.createConnectAccount",
  "payment.createAccountSession",
  "payment.createLoginLink",
]);

const RECENT_AUTH_PROCEDURES = new Set([
  "admin.refundOrder",
  "admin.retryTransfer",
  "admin.suspendUser",
  "admin.unsuspendUser",
  "admin.forceCancelOrder",
  "admin.updateUser",
  "admin.updateVerification",
  "admin.updateSetting",
  "admin.updateSettings",
  "admin.setListingTaxCode",
  "dispute.resolve",
  "promotion.adminCancel",
  "payment.createConnectAccount",
  "payment.createAccountSession",
  "payment.createLoginLink",
]);

export const RECENT_AUTH_MAX_AGE_SECONDS = 15 * 60;
export const MFA_REQUIRED_MESSAGE =
  "Multi-factor authentication is required before you can continue.";
export const RECENT_AUTH_REQUIRED_MESSAGE =
  "Re-enter your authenticator code to continue with this sensitive action.";

export interface AuthAssuranceState {
  currentLevel: AssuranceLevel;
  nextLevel: AssuranceLevel;
  lastFactorVerificationAt: string | null;
  recentVerificationSatisfied: boolean;
}

function isPathWithin(pathname: string, routePrefix: string): boolean {
  return pathname === routePrefix || pathname.startsWith(`${routePrefix}/`);
}

function normalizeAuthenticationMethods(
  methods: AuthenticationMethod[] | null | undefined,
) {
  return (methods ?? [])
    .map((entry) => {
      if (typeof entry === "string") {
        return { method: entry, timestamp: null };
      }

      return {
        method: typeof entry?.method === "string" ? entry.method : "",
        timestamp:
          typeof entry?.timestamp === "number" && Number.isFinite(entry.timestamp)
            ? entry.timestamp
            : null,
      };
    })
    .filter((entry) => entry.method.length > 0);
}

export function getLastStrongAuthTimestamp(
  methods: AuthenticationMethod[] | null | undefined,
): number | null {
  const strongMethods = normalizeAuthenticationMethods(methods)
    .filter((entry) => MFA_METHODS.has(entry.method))
    .map((entry) => entry.timestamp)
    .filter((timestamp): timestamp is number => timestamp !== null)
    .sort((left, right) => right - left);

  return strongMethods[0] ?? null;
}

export function summarizeAuthAssurance(params: {
  currentLevel: AssuranceLevel;
  nextLevel: AssuranceLevel;
  currentAuthenticationMethods?: AuthenticationMethod[] | null;
  nowMs?: number;
}): AuthAssuranceState {
  const nowMs = params.nowMs ?? Date.now();
  const lastStrongAuthTimestamp = getLastStrongAuthTimestamp(
    params.currentAuthenticationMethods,
  );
  const lastFactorVerificationAt =
    lastStrongAuthTimestamp === null
      ? null
      : new Date(lastStrongAuthTimestamp * 1000).toISOString();
  const recentVerificationSatisfied =
    lastStrongAuthTimestamp !== null &&
    nowMs - lastStrongAuthTimestamp * 1000 <=
      RECENT_AUTH_MAX_AGE_SECONDS * 1000;

  return {
    currentLevel: params.currentLevel,
    nextLevel: params.nextLevel,
    lastFactorVerificationAt,
    recentVerificationSatisfied,
  };
}

export function isPrivateAppPath(pathname: string): boolean {
  return PRIVATE_ROUTE_PREFIXES.some((routePrefix) =>
    isPathWithin(pathname, routePrefix),
  );
}

export function isHighAssuranceRoute(pathname: string): boolean {
  return HIGH_ASSURANCE_ROUTE_PREFIXES.some((routePrefix) =>
    isPathWithin(pathname, routePrefix),
  );
}

export function getProcedureAssuranceRequirement(params: {
  path: string;
  role: AppRole | null;
}) {
  const requiresAal2 =
    params.role === "admin" ||
    SELLER_FINANCIAL_PROCEDURES.has(params.path);

  return {
    requiresAal2,
    requiresRecentAuth:
      requiresAal2 && RECENT_AUTH_PROCEDURES.has(params.path),
  };
}
