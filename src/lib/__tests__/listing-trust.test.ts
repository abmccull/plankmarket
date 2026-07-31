import { describe, expect, it } from "vitest";
import { deriveListingTrustFields } from "@/lib/listing-trust";

describe("deriveListingTrustFields", () => {
  it("persists quality, ship-ready state, and refreshes confirmation dates", () => {
    const confirmedAt = new Date("2026-07-30T00:00:00.000Z");

    const result = deriveListingTrustFields(
      {
        materialType: "hardwood",
        condition: "new_overstock",
        title: "Oak closeout",
        totalSqFt: 900,
        brand: "Example",
        color: "Natural",
        species: "Oak",
        grade: "select",
        thickness: 0.75,
        width: 5,
        locationZip: "80202",
        locationState: "CO",
        palletWeight: 1200,
        palletLength: 48,
        palletWidth: 40,
        palletHeight: 48,
        totalPallets: 1,
        photoCount: 4,
      },
      confirmedAt,
    );

    expect(result.qualityScore).toBeGreaterThan(0);
    expect(result.shipReady).toBe(true);
    expect(result.lastConfirmedAt).toEqual(confirmedAt);
    expect(result.confirmationDueAt).toEqual(
      new Date("2026-08-13T00:00:00.000Z"),
    );
  });
});
