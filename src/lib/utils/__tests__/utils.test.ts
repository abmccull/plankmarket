// src/lib/utils/__tests__/utils.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cn,
  formatCurrency,
  formatNumber,
  formatSqFt,
  formatPricePerSqFt,
  formatDate,
  formatRelativeTime,
  slugify,
  truncate,
  calculateBuyerFee,
  calculateSellerFee,
  calculateTotalWithFees,
} from "@/lib/utils";

// ---------------------------------------------------------------------------
// cn (class merger)
// ---------------------------------------------------------------------------
describe("cn", () => {
  it("should merge class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("should handle conditional classes", () => {
    expect(cn("base", { active: true, inactive: false })).toBe("base active");
  });

  it("should resolve tailwind conflicts by keeping the last class", () => {
    // twMerge keeps the latter of conflicting utilities
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("should return empty string when no classes provided", () => {
    expect(cn()).toBe("");
  });

  it("should filter out falsy values", () => {
    expect(cn("foo", undefined, null, false, "bar")).toBe("foo bar");
  });
});

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------
describe("formatCurrency", () => {
  it("should format a whole dollar amount", () => {
    expect(formatCurrency(100)).toBe("$100.00");
  });

  it("should format a fractional dollar amount", () => {
    expect(formatCurrency(1.5)).toBe("$1.50");
  });

  it("should format zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("should format large amounts with commas", () => {
    expect(formatCurrency(1234567.89)).toBe("$1,234,567.89");
  });

  it("should format negative amounts", () => {
    expect(formatCurrency(-50)).toBe("-$50.00");
  });

  it("should handle very small fractional amounts", () => {
    expect(formatCurrency(0.01)).toBe("$0.01");
  });
});

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------
describe("formatNumber", () => {
  it("should format a whole number", () => {
    expect(formatNumber(1000)).toBe("1,000");
  });

  it("should format zero", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("should format large numbers with commas", () => {
    expect(formatNumber(1000000)).toBe("1,000,000");
  });
});

// ---------------------------------------------------------------------------
// formatSqFt
// ---------------------------------------------------------------------------
describe("formatSqFt", () => {
  it("should append sq ft label", () => {
    expect(formatSqFt(500)).toBe("500 sq ft");
  });

  it("should format large values with commas", () => {
    expect(formatSqFt(10000)).toBe("10,000 sq ft");
  });

  it("should format zero", () => {
    expect(formatSqFt(0)).toBe("0 sq ft");
  });
});

// ---------------------------------------------------------------------------
// formatPricePerSqFt
// ---------------------------------------------------------------------------
describe("formatPricePerSqFt", () => {
  it("should append per sq ft unit", () => {
    expect(formatPricePerSqFt(2.5)).toBe("$2.50/sq ft");
  });

  it("should handle whole dollar amounts", () => {
    expect(formatPricePerSqFt(10)).toBe("$10.00/sq ft");
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe("formatDate", () => {
  it("should format a Date object", () => {
    // Use a fixed date for determinism
    const date = new Date("2024-06-15T12:00:00Z");
    const result = formatDate(date);
    // The formatter uses en-US locale with month short, day numeric, year numeric
    expect(result).toContain("2024");
    expect(result).toContain("Jun");
    expect(result).toContain("15");
  });

  it("should format a date string with explicit time to avoid timezone shift", () => {
    // Use a date with an explicit midday time so UTC-offset doesn't shift the day
    const result = formatDate("2024-06-15T12:00:00");
    expect(result).toContain("2024");
    expect(result).toContain("Jun");
    expect(result).toContain("15");
  });

  it("should handle different months", () => {
    // Use a Date object constructed from local time to avoid UTC-parsing gotchas
    const result = formatDate(new Date(2024, 11, 25)); // month is 0-indexed: 11 = December
    expect(result).toContain("Dec");
    expect(result).toContain("25");
  });
});

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------
describe("formatRelativeTime", () => {
  beforeEach(() => {
    // Pin the current time for determinism
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return 'just now' for a date less than 1 minute ago", () => {
    const thirtySecondsAgo = new Date("2024-06-15T11:59:40Z");
    expect(formatRelativeTime(thirtySecondsAgo)).toBe("just now");
  });

  it("should return minutes ago for a date less than 60 minutes ago", () => {
    const tenMinutesAgo = new Date("2024-06-15T11:50:00Z");
    expect(formatRelativeTime(tenMinutesAgo)).toBe("10m ago");
  });

  it("should return 1 minute ago for exactly 1 minute", () => {
    const oneMinuteAgo = new Date("2024-06-15T11:59:00Z");
    expect(formatRelativeTime(oneMinuteAgo)).toBe("1m ago");
  });

  it("should return hours ago for a date less than 24 hours ago", () => {
    const fiveHoursAgo = new Date("2024-06-15T07:00:00Z");
    expect(formatRelativeTime(fiveHoursAgo)).toBe("5h ago");
  });

  it("should return days ago for a date less than 30 days ago", () => {
    const threeDaysAgo = new Date("2024-06-12T12:00:00Z");
    expect(formatRelativeTime(threeDaysAgo)).toBe("3d ago");
  });

  it("should return formatted date for a date older than 30 days", () => {
    const twoMonthsAgo = new Date("2024-04-10T12:00:00Z");
    const result = formatRelativeTime(twoMonthsAgo);
    // Falls back to formatDate
    expect(result).toContain("2024");
    expect(result).toContain("Apr");
    expect(result).toContain("10");
  });

  it("should accept a date string", () => {
    const tenMinutesAgo = "2024-06-15T11:50:00Z";
    expect(formatRelativeTime(tenMinutesAgo)).toBe("10m ago");
  });
});

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------
describe("slugify", () => {
  it("should convert spaces to hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("should lowercase the string", () => {
    expect(slugify("UPPER CASE")).toBe("upper-case");
  });

  it("should remove special characters", () => {
    expect(slugify("hello! world@#$")).toBe("hello-world");
  });

  it("should collapse multiple hyphens", () => {
    expect(slugify("hello   world")).toBe("hello-world");
  });

  it("should strip leading and trailing hyphens", () => {
    expect(slugify("  hello  ")).toBe("hello");
  });

  it("should handle already-slugified strings", () => {
    expect(slugify("already-slugified")).toBe("already-slugified");
  });

  it("should return empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("should handle strings with numbers", () => {
    expect(slugify("Product 123")).toBe("product-123");
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------
describe("truncate", () => {
  it("should not truncate strings within the limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("should not truncate strings exactly at the limit", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("should truncate and append ellipsis for strings over the limit", () => {
    expect(truncate("hello world", 5)).toBe("hello...");
  });

  it("should trim trailing whitespace before ellipsis", () => {
    expect(truncate("hello world", 6)).toBe("hello...");
  });

  it("should handle empty string", () => {
    expect(truncate("", 5)).toBe("");
  });

  it("should handle limit of zero", () => {
    expect(truncate("hello", 0)).toBe("...");
  });

  it("should handle limit of one", () => {
    expect(truncate("hello", 1)).toBe("h...");
  });
});

// ---------------------------------------------------------------------------
// calculateBuyerFee
// ---------------------------------------------------------------------------
describe("calculateBuyerFee", () => {
  it("should calculate 3% buyer fee", () => {
    expect(calculateBuyerFee(100)).toBe(3);
  });

  it("should return 0 for a zero price", () => {
    expect(calculateBuyerFee(0)).toBe(0);
  });

  it("should round to two decimal places", () => {
    // 3% of 10.00 = 0.30
    expect(calculateBuyerFee(10)).toBe(0.3);
    // 3% of 33.33 = 0.9999 → rounds to 1.00
    expect(calculateBuyerFee(33.33)).toBe(1);
  });

  it("should handle large amounts", () => {
    expect(calculateBuyerFee(100000)).toBe(3000);
  });

  it("should handle fractional prices", () => {
    // 3% of 1.99 = 0.0597 → rounds to 0.06
    expect(calculateBuyerFee(1.99)).toBe(0.06);
  });
});

// ---------------------------------------------------------------------------
// calculateSellerFee
// ---------------------------------------------------------------------------
describe("calculateSellerFee", () => {
  it("should calculate 2% seller fee", () => {
    expect(calculateSellerFee(100)).toBe(2);
  });

  it("should return 0 for a zero price", () => {
    expect(calculateSellerFee(0)).toBe(0);
  });

  it("should round to two decimal places", () => {
    // 2% of 33.33 = 0.6666 → rounds to 0.67
    expect(calculateSellerFee(33.33)).toBe(0.67);
  });

  it("should handle large amounts", () => {
    expect(calculateSellerFee(100000)).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// calculateTotalWithFees
// ---------------------------------------------------------------------------
describe("calculateTotalWithFees", () => {
  it("should add 3% buyer fee to the base price", () => {
    expect(calculateTotalWithFees(100)).toBe(103);
  });

  it("should return 0 for a zero price", () => {
    expect(calculateTotalWithFees(0)).toBe(0);
  });

  it("should equal price + calculateBuyerFee(price)", () => {
    const price = 250;
    expect(calculateTotalWithFees(price)).toBe(price + calculateBuyerFee(price));
  });

  it("should handle large amounts", () => {
    expect(calculateTotalWithFees(100000)).toBe(103000);
  });
});
