const ANALYTICS_CONSENT_KEY = "plankmarket.analytics-consent";
const ANALYTICS_CONSENT_CHANGE_EVENT = "plankmarket:analytics-consent-change";

const URL_PROPERTY_KEYS = new Set([
  "$current_url",
  "$initial_current_url",
  "$session_entry_url",
  "$referrer",
  "$referring_domain",
]);

const SENSITIVE_KEY =
  /(^|_)(email|name|phone|address|ein|tax|document|tracking|zip|buyer_id|seller_id|user_id|order_id|offer_id|listing_id|request_id|source_id|source_item_id|ingest_batch_id|external_item_id)$/i;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const EIN_PATTERN = /\b\d{2}-?\d{7}\b/;
const PHONE_PATTERN =
  /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/;

export type AnalyticsConsentState = "granted" | "denied";

export function readAnalyticsConsent(): AnalyticsConsentState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
  return value === "granted" || value === "denied" ? value : null;
}

export function writeAnalyticsConsent(value: AnalyticsConsentState): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  window.dispatchEvent(new Event(ANALYTICS_CONSENT_CHANGE_EVENT));
}

export function clearAnalyticsConsent(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ANALYTICS_CONSENT_KEY);
  window.dispatchEvent(new Event(ANALYTICS_CONSENT_CHANGE_EVENT));
}

export function subscribeAnalyticsConsent(
  onStoreChange: () => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStoreChange = () => onStoreChange();
  window.addEventListener("storage", handleStoreChange);
  window.addEventListener(
    ANALYTICS_CONSENT_CHANGE_EVENT,
    handleStoreChange,
  );

  return () => {
    window.removeEventListener("storage", handleStoreChange);
    window.removeEventListener(
      ANALYTICS_CONSENT_CHANGE_EVENT,
      handleStoreChange,
    );
  };
}

export function resolveAnalyticsConsentFlag(
  value: boolean | null | undefined,
): AnalyticsConsentState | null {
  if (value === true) return "granted";
  if (value === false) return "denied";
  return null;
}

function sanitizeString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (
    EMAIL_PATTERN.test(trimmed) ||
    EIN_PATTERN.test(trimmed) ||
    PHONE_PATTERN.test(trimmed)
  ) {
    return "[redacted]";
  }
  return trimmed;
}

function sanitizeUnknown(value: unknown, key?: string): unknown {
  if (value == null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    if (key && URL_PROPERTY_KEYS.has(key)) {
      return null;
    }
    if (key && SENSITIVE_KEY.test(key)) {
      return "[redacted]";
    }
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeUnknown(entry));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).flatMap(
        ([childKey, childValue]) => {
          const sanitized = sanitizeUnknown(childValue, childKey);
          if (sanitized === undefined) {
            return [];
          }
          return [[childKey, sanitized]];
        },
      ),
    );
  }

  return undefined;
}

export function sanitizeAnalyticsProperties(
  properties: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return (sanitizeUnknown(properties ?? {}) as Record<string, unknown>) ?? {};
}
