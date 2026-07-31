import { describe, expect, it, vi } from "vitest";

const registrations = vi.hoisted(
  () =>
    [] as Array<{
      options: Record<string, unknown>;
      trigger: Record<string, unknown>;
    }>,
);

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn(
      (
        options: Record<string, unknown>,
        trigger: Record<string, unknown>,
      ) => {
        registrations.push({ options, trigger });
        return { options, trigger };
      },
    ),
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

await import("../saved-search-alerts");

describe("saved-search alert registration", () => {
  it("registers instant alerts on listing publication", () => {
    expect(registrations).toContainEqual({
      options: expect.objectContaining({ id: "instant-saved-search-alerts" }),
      trigger: { event: "listing/created" },
    });
  });

  it("keeps a separate scheduler for daily and weekly digests", () => {
    expect(registrations).toContainEqual({
      options: expect.objectContaining({ id: "saved-search-digests" }),
      trigger: { cron: "0 */4 * * *" },
    });
  });
});
