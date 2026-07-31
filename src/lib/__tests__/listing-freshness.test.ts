import { describe, expect, it } from "vitest";
import {
  getListingFreshnessStatus,
  getNextListingConfirmationDueAt,
  isListingVisibleToBuyers,
  LISTING_CONFIRMATION_WINDOW_DAYS,
} from "@/lib/listing-freshness";

describe("listing freshness policy", () => {
  it("sets the next confirmation due date from the confirmation window", () => {
    const confirmedAt = new Date("2026-07-30T00:00:00.000Z");

    expect(getNextListingConfirmationDueAt(confirmedAt)).toEqual(
      new Date(
        confirmedAt.getTime() +
          LISTING_CONFIRMATION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ),
    );
  });

  it("treats recent confirmations as fresh", () => {
    expect(
      getListingFreshnessStatus({
        lastConfirmedAt: "2026-07-20T00:00:00.000Z",
        confirmationDueAt: "2026-08-03T00:00:00.000Z",
        now: "2026-07-30T00:00:00.000Z",
      }),
    ).toBe("fresh");
  });

  it("marks listings as due soon inside the warning window", () => {
    expect(
      getListingFreshnessStatus({
        lastConfirmedAt: "2026-07-18T00:00:00.000Z",
        confirmationDueAt: "2026-08-01T00:00:00.000Z",
        now: "2026-07-30T00:00:00.000Z",
      }),
    ).toBe("reconfirm_soon");
  });

  it("suppresses overdue or unconfirmed listings from buyer visibility", () => {
    expect(
      isListingVisibleToBuyers({
        status: "active",
        lastConfirmedAt: "2026-07-01T00:00:00.000Z",
        confirmationDueAt: "2026-07-15T00:00:00.000Z",
        now: "2026-07-30T00:00:00.000Z",
      }),
    ).toBe(false);

    expect(
      isListingVisibleToBuyers({
        status: "active",
        lastConfirmedAt: null,
        confirmationDueAt: null,
        now: "2026-07-30T00:00:00.000Z",
      }),
    ).toBe(false);
  });
});
