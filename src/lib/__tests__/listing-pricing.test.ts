import { describe, expect, it } from "vitest";

import {
  previewAutomaticMarkdownSchedule,
  resolveAutomaticMarkdownListingUpdate,
  resolveListingUnitPrice,
} from "@/lib/listing-pricing";

describe("listing pricing", () => {
  it("resolves the base unit price for a full-lot request without advanced rules", () => {
    const result = resolveListingUnitPrice({
      baseUnitPrice: 2.99,
      availableQuantity: 2000,
      requestedQuantity: 2000,
    });

    expect(result.status).toBe("resolved");
    expect(result.isValid).toBe(true);
    expect(result.purchaseAllowed).toBe(true);
    expect(result.baseUnitPrice).toBe(2.99);
    expect(result.currentBaseUnitPrice).toBe(2.99);
    expect(result.finalUnitPrice).toBe(2.99);
    expect(result.quantity.reason).toBe("full_quantity");
    expect(result.partialQuantity.applied).toBe(false);
    expect(result.automaticMarkdown.applied).toBe(false);
  });

  it("applies a partial-quantity markup only when the request is below the available quantity", () => {
    const result = resolveListingUnitPrice({
      baseUnitPrice: 1.99,
      availableQuantity: 2000,
      requestedQuantity: 1500,
      partialQuantityMarkupPercent: 20,
    });

    expect(result.status).toBe("resolved");
    expect(result.quantity.isPartialQuantity).toBe(true);
    expect(result.quantity.reason).toBe("partial_quantity");
    expect(result.currentBaseUnitPrice).toBe(1.99);
    expect(result.partialQuantity.applied).toBe(true);
    expect(result.partialQuantity.markupPercent).toBe(20);
    expect(result.finalUnitPrice).toBe(2.39);
  });

  it("does not apply partial markup when the quantity is effectively full within tolerance", () => {
    const result = resolveListingUnitPrice({
      baseUnitPrice: 1.99,
      availableQuantity: 2000,
      requestedQuantity: 1999.99995,
      partialQuantityMarkupPercent: 20,
    });

    expect(result.status).toBe("resolved");
    expect(result.quantity.isPartialQuantity).toBe(false);
    expect(result.quantity.reason).toBe("within_tolerance");
    expect(result.partialQuantity.applied).toBe(false);
    expect(result.finalUnitPrice).toBe(1.99);
  });

  it("blocks partial purchases when the listing is full-lot only", () => {
    const result = resolveListingUnitPrice({
      baseUnitPrice: 2.49,
      availableQuantity: 1000,
      requestedQuantity: 750,
      fullLotOnly: true,
      partialQuantityMarkupPercent: 15,
    });

    expect(result.status).toBe("blocked");
    expect(result.isValid).toBe(true);
    expect(result.purchaseAllowed).toBe(false);
    expect(result.currentBaseUnitPrice).toBe(2.49);
    expect(result.finalUnitPrice).toBeNull();
    expect(result.reason).toBe("blocked_full_lot_only");
    expect(result.partialQuantity.reason).toBe("blocked_full_lot_only");
  });

  it("applies automatic markdown in four equal intervals down to the configured floor", () => {
    const result = resolveListingUnitPrice({
      baseUnitPrice: 2.99,
      availableQuantity: 2000,
      requestedQuantity: 2000,
      automaticMarkdownFloorPercent: 60,
      automaticMarkdownIntervalDays: 21,
      automaticMarkdownStartedAt: "2026-01-01T00:00:00.000Z",
      now: "2026-02-20T00:00:00.000Z",
    });

    expect(result.status).toBe("resolved");
    expect(result.currentBaseUnitPrice).toBe(2.39);
    expect(result.finalUnitPrice).toBe(2.39);
    expect(result.automaticMarkdown.applied).toBe(true);
    expect(result.automaticMarkdown.step).toBe(2);
    expect(result.automaticMarkdown.percentOfOriginal).toBe(80);
    expect(result.automaticMarkdown.discountPercent).toBe(20);
  });

  it("composes markdown first, then partial markup, with cents rounding at each stage", () => {
    const result = resolveListingUnitPrice({
      baseUnitPrice: 2.99,
      availableQuantity: 2000,
      requestedQuantity: 1000,
      partialQuantityMarkupPercent: 20,
      automaticMarkdownFloorPercent: 60,
      automaticMarkdownIntervalDays: 21,
      automaticMarkdownStartedAt: "2026-03-01T00:00:00.000Z",
      now: "2026-05-25T00:00:00.000Z",
    });

    expect(result.automaticMarkdown.step).toBe(4);
    expect(result.currentBaseUnitPrice).toBe(1.79);
    expect(result.partialQuantity.applied).toBe(true);
    expect(result.finalUnitPrice).toBe(2.15);
  });

  it("fails closed when the requested quantity exceeds available quantity", () => {
    const result = resolveListingUnitPrice({
      baseUnitPrice: 2.99,
      availableQuantity: 1000,
      requestedQuantity: 1000.5,
    });

    expect(result.status).toBe("invalid");
    expect(result.isValid).toBe(false);
    expect(result.purchaseAllowed).toBe(false);
    expect(result.finalUnitPrice).toBeNull();
    expect(result.reason).toBe("quantity_exceeds_available");
  });

  it("fails closed when automatic markdown configuration is invalid", () => {
    const result = resolveListingUnitPrice({
      baseUnitPrice: 2.99,
      availableQuantity: 1000,
      automaticMarkdownFloorPercent: 110,
      automaticMarkdownIntervalDays: 21,
      automaticMarkdownStartedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.status).toBe("invalid");
    expect(result.isValid).toBe(false);
    expect(result.finalUnitPrice).toBeNull();
    expect(result.reason).toBe("invalid_markdown_floor_percent");
    expect(result.automaticMarkdown.reason).toBe("invalid_floor_percent");
  });

  it("fails closed when partial markup is invalid", () => {
    const result = resolveListingUnitPrice({
      baseUnitPrice: 2.99,
      availableQuantity: 1000,
      requestedQuantity: 900,
      partialQuantityMarkupPercent: -5,
    });

    expect(result.status).toBe("invalid");
    expect(result.isValid).toBe(false);
    expect(result.finalUnitPrice).toBeNull();
    expect(result.reason).toBe("invalid_partial_markup_percent");
    expect(result.partialQuantity.reason).toBe("invalid_markup_percent");
  });

  it("builds a deterministic markdown schedule preview for UI use", () => {
    const preview = previewAutomaticMarkdownSchedule({
      baseUnitPrice: 2.99,
      floorPercent: 60,
      intervalDays: 21,
      startedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(preview.isValid).toBe(true);
    expect(preview.entries).toHaveLength(5);
    expect(preview.entries.map((entry) => entry.percentOfOriginal)).toEqual([
      100, 90, 80, 70, 60,
    ]);
    expect(preview.entries.map((entry) => entry.unitPrice)).toEqual([
      2.99, 2.69, 2.39, 2.09, 1.79,
    ]);
    expect(preview.entries[0]?.startsAt?.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(preview.entries[0]?.endsBefore?.toISOString()).toBe(
      "2026-01-22T00:00:00.000Z",
    );
    expect(preview.entries[4]?.endsBefore).toBeNull();
  });

  it("returns an invalid preview for invalid markdown schedule inputs", () => {
    const preview = previewAutomaticMarkdownSchedule({
      baseUnitPrice: 2.99,
      floorPercent: 60,
      intervalDays: 0,
    });

    expect(preview.isValid).toBe(false);
    expect(preview.reason).toBe("invalid_interval_days");
    expect(preview.entries).toEqual([]);
  });

  it("returns a no-op before the next markdown interval is due", () => {
    const result = resolveAutomaticMarkdownListingUpdate({
      listingStatus: "active",
      currentAskPricePerSqFt: 2.99,
      automaticMarkdownEnabled: true,
      automaticMarkdownFloorPercent: 60,
      automaticMarkdownIntervalDays: 21,
      automaticMarkdownStartedAt: "2026-07-01T00:00:00.000Z",
      automaticMarkdownCurrentStep: 0,
      now: "2026-07-15T00:00:00.000Z",
    });

    expect(result.status).toBe("noop");
    expect(result.reason).toBe("step_not_due");
    expect(result.targetStep).toBe(0);
    expect(result.targetAskPricePerSqFt).toBe(2.99);
  });

  it("catches up multiple missed intervals from the schedule base without compounding", () => {
    const result = resolveAutomaticMarkdownListingUpdate({
      listingStatus: "active",
      currentAskPricePerSqFt: 2.99,
      currentBuyNowPricePerSqFt: 3.49,
      automaticMarkdownEnabled: true,
      automaticMarkdownFloorPercent: 60,
      automaticMarkdownIntervalDays: 21,
      automaticMarkdownStartedAt: "2026-04-01T00:00:00.000Z",
      automaticMarkdownCurrentStep: 0,
      now: "2026-06-15T00:00:00.000Z",
    });

    expect(result.status).toBe("ready");
    expect(result.currentStep).toBe(0);
    expect(result.targetStep).toBe(3);
    expect(result.appliedSteps).toBe(3);
    expect(result.baseUnitPrice).toBe(2.99);
    expect(result.targetPercentOfOriginal).toBe(70);
    expect(result.targetAskPricePerSqFt).toBe(2.09);
    expect(result.targetBuyNowPricePerSqFt).toBe(2.44);
    expect(result.lastAppliedAt?.toISOString()).toBe(
      "2026-06-15T00:00:00.000Z",
    );
    expect(result.dueAt?.toISOString()).toBe("2026-06-03T00:00:00.000Z");
  });

  it("is idempotent once the scheduled step has already been applied", () => {
    const result = resolveAutomaticMarkdownListingUpdate({
      listingStatus: "active",
      currentAskPricePerSqFt: 2.39,
      automaticMarkdownEnabled: true,
      automaticMarkdownFloorPercent: 60,
      automaticMarkdownIntervalDays: 21,
      automaticMarkdownStartedAt: "2026-05-01T00:00:00.000Z",
      automaticMarkdownCurrentStep: 2,
      automaticMarkdownLastAppliedAt: "2026-06-12T00:00:00.000Z",
      now: "2026-06-20T00:00:00.000Z",
    });

    expect(result.status).toBe("noop");
    expect(result.reason).toBe("step_not_due");
    expect(result.currentStep).toBe(2);
    expect(result.targetStep).toBe(2);
    expect(result.lastAppliedAt?.toISOString()).toBe(
      "2026-06-12T00:00:00.000Z",
    );
  });

  it("returns no-op for disabled, draft, and sold listings", () => {
    const disabled = resolveAutomaticMarkdownListingUpdate({
      listingStatus: "active",
      currentAskPricePerSqFt: 2.99,
      automaticMarkdownEnabled: false,
    });
    const draft = resolveAutomaticMarkdownListingUpdate({
      listingStatus: "draft",
      currentAskPricePerSqFt: 2.99,
      automaticMarkdownEnabled: true,
      automaticMarkdownFloorPercent: 60,
      automaticMarkdownIntervalDays: 21,
      automaticMarkdownStartedAt: "2026-07-01T00:00:00.000Z",
      automaticMarkdownCurrentStep: 0,
    });
    const sold = resolveAutomaticMarkdownListingUpdate({
      listingStatus: "sold",
      currentAskPricePerSqFt: 2.99,
      automaticMarkdownEnabled: true,
      automaticMarkdownFloorPercent: 60,
      automaticMarkdownIntervalDays: 21,
      automaticMarkdownStartedAt: "2026-07-01T00:00:00.000Z",
      automaticMarkdownCurrentStep: 1,
    });

    expect(disabled.reason).toBe("disabled");
    expect(draft.reason).toBe("listing_not_active");
    expect(sold.reason).toBe("listing_not_active");
  });

  it("completes exactly at the fourth and final markdown step", () => {
    const result = resolveAutomaticMarkdownListingUpdate({
      listingStatus: "active",
      currentAskPricePerSqFt: 2.09,
      automaticMarkdownEnabled: true,
      automaticMarkdownFloorPercent: 60,
      automaticMarkdownIntervalDays: 21,
      automaticMarkdownStartedAt: "2026-04-01T00:00:00.000Z",
      automaticMarkdownCurrentStep: 3,
      now: "2026-07-01T00:00:00.000Z",
    });

    expect(result.status).toBe("ready");
    expect(result.targetStep).toBe(4);
    expect(result.targetAskPricePerSqFt).toBe(1.79);
    expect(result.lastAppliedAt?.toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
    expect(result.dueAt?.toISOString()).toBe("2026-06-24T00:00:00.000Z");
  });
});
