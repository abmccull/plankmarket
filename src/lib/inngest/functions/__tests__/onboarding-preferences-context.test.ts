// Candidate only: src/lib/inngest/functions/__tests__/onboarding-preferences-context.test.ts
// Captures the real Inngest handler using the existing offer-response-deadline fixture pattern.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
type Handler = (input: Record<string, unknown>) => Promise<unknown>;
const mocks = vi.hoisted(() => ({
  handler: null as Handler | null,
  trigger: null as unknown,
  user: vi.fn(), preferences: vi.fn(), count: vi.fn(), send: vi.fn(),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { createFunction: vi.fn((...args: unknown[]) => {
    mocks.trigger = args[1]; mocks.handler = args[2] as Handler;
    return { id: "onboarding-drip" };
  }) },
}));
vi.mock("@/server/db", () => ({ db: {
  query: { users: { findFirst: mocks.user }, userPreferences: { findFirst: mocks.preferences } },
  select: () => ({ from: () => ({ where: mocks.count }) }),
} }));
vi.mock("@/lib/email/send", () => ({ sendOnboardingNudgeEmail: mocks.send }));
await import("@/lib/inngest/functions/onboarding-drip");
const OWNER = "11111111-1111-4111-8111-111111111111";
const BUYING = { preferredZip: "80202", preferredRadiusMiles: 100, preferredMaterialTypes: ["engineered"],
  priceMaxPerSqFt: 5, preferredShippingMode: "both", urgency: "2_weeks" };
function step() {
  return { sleep: vi.fn().mockResolvedValue(undefined), run: vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback()) };
}
function run(role: "buyer" | "seller" = "buyer") {
  return mocks.handler!({ event: { data: { userId: OWNER, email: "synthetic@example.invalid", name: "Synthetic Business", role } }, step: step() });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: OWNER, active: true, role: "buyer", name: "Synthetic Business", businessName: "Synthetic Flooring", phone: "5550000000", stripeOnboardingComplete: false });
  mocks.preferences.mockResolvedValue(null);
  mocks.count.mockResolvedValue([{ count: 0 }]);
  mocks.send.mockResolvedValue(undefined);
});

describe("onboarding drip uses buying preference completion", () => {
  it.each([0, 1])("does not treat an old seller-complete flag as buying setup (%s saved searches)", async (savedSearches) => {
    mocks.preferences.mockResolvedValue({ userId: OWNER, role: "seller", profileComplete: true,
      originZip: "84101", shipCapable: true, typicalMaterialTypes: ["hardwood"], minLotSqFt: 400,
      preferredBuyerRadiusMiles: 250, pricingStyle: "fixed", leadTimeDaysMin: 2, preferredRadiusMiles: 100 });
    mocks.count.mockResolvedValue([{ count: savedSearches }]);
    await run();
    expect(mocks.trigger).toEqual({ event: "user/registered" });
    expect(mocks.send.mock.calls.map(([input]) => input.step)).toEqual(savedSearches ? ["day7"] : ["day3", "day7"]);
    for (const [input] of mocks.send.mock.calls) {
      expect(input.role).toBe("buyer");
      expect(input.idempotencyKey).toBe(`onboarding-${input.step}-${OWNER}`);
    }
  });

  it("stops buyer nudges when buying fields and a saved search exist despite a false legacy flag", async () => {
    mocks.preferences.mockResolvedValue({ userId: OWNER, role: "seller", profileComplete: false, ...BUYING });
    mocks.count.mockResolvedValue([{ count: 1 }]);
    await run();
    expect(mocks.send).not.toHaveBeenCalled();
    for (const [input] of mocks.preferences.mock.calls) {
      const query = new PgDialect().sqlToQuery((input as { where: SQL }).where);
      expect(query.params).toEqual([OWNER]);
    }
  });

  it("keeps the original seller campaign and its Connect/listing criteria", async () => {
    mocks.user.mockResolvedValue({ id: OWNER, active: true, role: "seller", name: "Synthetic Business", businessName: "Synthetic Flooring", phone: "5550000000", stripeOnboardingComplete: false });
    mocks.preferences.mockResolvedValue({ userId: OWNER, role: "buyer", profileComplete: true, ...BUYING });
    await run("seller");
    expect(mocks.send.mock.calls.map(([input]) => [input.role, input.step])).toEqual([["seller", "day3"], ["seller", "day7"]]);
  });

  it("does not send either campaign's reminders for an inactive business", async () => {
    mocks.user.mockResolvedValue({ id: OWNER, active: false });
    await run();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
