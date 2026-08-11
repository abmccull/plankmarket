import { describe, expect, it } from "vitest";
import {
  resolveAnalyticsConsentFlag,
  sanitizeAnalyticsProperties,
} from "@/lib/analytics/privacy";

describe("analytics privacy helpers", () => {
  it("redacts direct identifiers, contact data, and URL properties", () => {
    expect(
      sanitizeAnalyticsProperties({
        buyer_id: "buyer-123",
        contact_email: "owner@example.com",
        shipping_phone: "303-555-0199",
        ein_tax_id: "12-3456789",
        "$current_url": "https://www.plankmarket.com/listings/abc",
        nested: {
          seller_id: "seller-123",
          label: "keep me",
        },
      }),
    ).toEqual({
      buyer_id: "[redacted]",
      contact_email: "[redacted]",
      shipping_phone: "[redacted]",
      ein_tax_id: "[redacted]",
      "$current_url": null,
      nested: {
        seller_id: "[redacted]",
        label: "keep me",
      },
    });
  });

  it("maps persisted consent flags to granted, denied, or null", () => {
    expect(resolveAnalyticsConsentFlag(true)).toBe("granted");
    expect(resolveAnalyticsConsentFlag(false)).toBe("denied");
    expect(resolveAnalyticsConsentFlag(null)).toBeNull();
    expect(resolveAnalyticsConsentFlag(undefined)).toBeNull();
  });
});
