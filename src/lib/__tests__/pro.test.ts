import { describe, expect, it, vi } from "vitest";
import { isPro } from "@/lib/pro";
import { resolveBillingInterval } from "@/lib/pro-pricing";

describe("isPro", () => {
  it("returns true for active subscription states", () => {
    expect(isPro({ proStatus: "active", proExpiresAt: null })).toBe(true);
    expect(isPro({ proStatus: "trialing", proExpiresAt: null })).toBe(true);
    expect(isPro({ proStatus: "past_due", proExpiresAt: null })).toBe(true);
  });

  it("keeps cancelled users in Pro during their paid-through period", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:00:00.000Z"));

    expect(
      isPro({
        proStatus: "cancelled",
        proExpiresAt: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ).toBe(true);

    vi.useRealTimers();
  });

  it("returns false after cancelled access expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:00:00.000Z"));

    expect(
      isPro({
        proStatus: "cancelled",
        proExpiresAt: new Date("2026-07-30T12:00:00.000Z"),
      }),
    ).toBe(false);
    expect(isPro({ proStatus: "free", proExpiresAt: null })).toBe(false);

    vi.useRealTimers();
  });
});

describe("resolveBillingInterval", () => {
  it("defaults unknown or missing values to annual billing", () => {
    expect(resolveBillingInterval(undefined)).toBe("annual");
    expect(resolveBillingInterval("weekly")).toBe("annual");
  });

  it("accepts the monthly interval", () => {
    expect(resolveBillingInterval("monthly")).toBe("monthly");
  });
});
