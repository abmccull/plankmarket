import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
import { purchaseIntentFromParams, withPurchaseIntent } from "@/lib/marketplace/purchase-intent";

/** Navigation intent only: never an inventory reservation or checkout authorization. */
export function getBuyerContinuation(value: string | null | undefined) {
  const safePath = sanitizeRedirectPath(value, null);
  if (!safePath) return null;
  const url = new URL(safePath, "https://marketplace.invalid");
  if (url.pathname === "/listings") {
    return { href: safePath, browseHref: safePath, isCheckout: false, label: "Return to your search" };
  }
  const lot = /^\/listings\/([a-zA-Z0-9-]+)(\/checkout)?\/?$/.exec(url.pathname);
  if (!lot) return null;
  return {
    href: safePath,
    browseHref: withPurchaseIntent("/listings/" + lot[1], purchaseIntentFromParams(url.searchParams)),
    isCheckout: Boolean(lot[2]),
    label: lot[2] ? "Continue to checkout" : "Return to selected lot",
  };
}

export function buyerVerificationHref(returnPath?: string | null) {
  const continuation = getBuyerContinuation(returnPath);
  return continuation
    ? "/buyer/verification?" + new URLSearchParams({ redirect: continuation.href }).toString()
    : "/buyer/verification";
}
