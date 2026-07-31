import { describe, expect, it } from "vitest";
import {
  calculateInventoryAfterRelease,
  calculateInventoryAfterReservation,
} from "../inventory-reservation";

describe("calculateInventoryAfterReservation", () => {
  it("persists zero availability for a full-lot reservation", () => {
    expect(
      calculateInventoryAfterReservation({
        availableQuantity: 1_000,
        reservedQuantity: 1_000,
      }),
    ).toEqual({
      remainingQuantity: 0,
      status: "sold",
    });
  });

  it("keeps only the unreserved quantity available for a partial reservation", () => {
    expect(
      calculateInventoryAfterReservation({
        availableQuantity: 2_000,
        reservedQuantity: 750,
      }),
    ).toEqual({
      remainingQuantity: 1_250,
      status: "active",
    });
  });

  it("treats sub-scale floating point residue as a full-lot reservation", () => {
    expect(
      calculateInventoryAfterReservation({
        availableQuantity: 1_000,
        reservedQuantity: 999.99999,
      }),
    ).toEqual({
      remainingQuantity: 0,
      status: "sold",
    });
  });

  it("rejects a reservation larger than the available quantity", () => {
    expect(() =>
      calculateInventoryAfterReservation({
        availableQuantity: 500,
        reservedQuantity: 501,
      }),
    ).toThrow("Reserved quantity exceeds available inventory");
  });
});

describe("calculateInventoryAfterRelease", () => {
  it("restores a full-lot reservation from zero availability exactly once", () => {
    expect(
      calculateInventoryAfterRelease({
        availableQuantity: 0,
        reservedQuantity: 1_000,
        listingStatus: "sold",
      }),
    ).toBe(1_000);
  });

  it("restores a partial reservation to the remaining available inventory", () => {
    expect(
      calculateInventoryAfterRelease({
        availableQuantity: 1_250,
        reservedQuantity: 750,
        listingStatus: "active",
      }),
    ).toBe(2_000);
  });

  it("does not double legacy full-lot inventory left on a sold listing", () => {
    expect(
      calculateInventoryAfterRelease({
        availableQuantity: 1_000,
        reservedQuantity: 1_000,
        listingStatus: "sold",
      }),
    ).toBe(1_000);
  });

});
