import { describe, expect, it, vi } from "vitest";

const registrations = vi.hoisted(() => ({
  handlers: [] as Array<(...args: unknown[]) => Promise<unknown>>,
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((...args: unknown[]) => {
      registrations.handlers.push(args[2] as (...args: unknown[]) => Promise<unknown>);
      return { id: String((args[0] as { id?: string }).id ?? "saved-search") };
    }),
  },
}));

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/lib/email/delivery", () => ({ sendEmailOrThrow: vi.fn() }));
vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "https://plankmarket.example",
    EMAIL_FROM: "PlankMarket <noreply@plankmarket.example>",
  },
}));

const alerts = await import("../saved-search-alerts");

function createSearch(
  id: string,
  overrides: Partial<{
    alertFrequency: "instant" | "daily" | "weekly";
    createdAt: Date;
    lastAlertAt: Date | null;
  }> = {},
) {
  return {
    id,
    alertFrequency: "daily" as const,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    lastAlertAt: null,
    ...overrides,
  };
}

describe("saved-search digest batching", () => {
  it("orders due searches by earliest due time across frequencies", () => {
    const now = new Date("2026-07-31T16:00:00.000Z");
    const dailyVeryOverdue = createSearch("daily-very-overdue", {
      alertFrequency: "daily",
      lastAlertAt: new Date("2026-07-26T16:00:00.000Z"),
    });
    const weeklyBarelyDue = createSearch("weekly-barely-due", {
      alertFrequency: "weekly",
      lastAlertAt: new Date("2026-07-24T16:00:00.000Z"),
    });
    const dailyNotDue = createSearch("daily-not-due", {
      alertFrequency: "daily",
      lastAlertAt: new Date("2026-07-31T08:00:00.000Z"),
    });

    const batch = alerts.selectDueDigestBatch(
      [weeklyBarelyDue, dailyNotDue, dailyVeryOverdue],
      now,
      10,
    );

    expect(batch.map((search) => search.id)).toEqual([
      "daily-very-overdue",
      "weekly-barely-due",
    ]);
  });

  it("does not treat a never-alerted search as due before its interval", () => {
    const now = new Date("2026-07-31T16:00:00.000Z");
    const newDailySearch = createSearch("new-daily", {
      createdAt: new Date("2026-07-31T08:00:00.000Z"),
    });
    const oldDailySearch = createSearch("old-daily", {
      createdAt: new Date("2026-07-29T08:00:00.000Z"),
    });

    expect(alerts.isDigestSearchDue(newDailySearch, now)).toBe(false);
    expect(alerts.isDigestSearchDue(oldDailySearch, now)).toBe(true);
  });

  it("starts a first digest at search creation so delayed runs do not miss listings", () => {
    const createdAt = new Date("2026-07-29T08:00:00.000Z");
    const firstDigest = createSearch("first-digest", {
      createdAt,
      lastAlertAt: null,
    });
    const subsequentDigest = createSearch("subsequent-digest", {
      createdAt,
      lastAlertAt: new Date("2026-07-30T12:00:00.000Z"),
    });

    expect(alerts.getDigestWindowStart(firstDigest)).toEqual(createdAt);
    expect(alerts.getDigestWindowStart(subsequentDigest)).toEqual(
      new Date("2026-07-30T12:00:00.000Z"),
    );
  });

  it("continues when the merged cohorts overflow even if neither cohort fills its limit", () => {
    expect(alerts.hasMoreDigestCandidates(13, 13, 25)).toBe(true);
    expect(alerts.hasMoreDigestCandidates(25, 0, 25)).toBe(true);
    expect(alerts.hasMoreDigestCandidates(12, 13, 25)).toBe(false);
  });
});
