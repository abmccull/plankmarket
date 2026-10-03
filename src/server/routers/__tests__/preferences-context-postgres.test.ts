// Candidate target: src/server/routers/__tests__/preferences-context-postgres.test.ts
// Apply before product edits. Opt-in actual DB proof; no application DB credentials.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { createTRPCContext } from "@/server/trpc";
import { createPreferencesFixture, finish, track, type PreferencesFixture, type Worker } from "./fixtures/preferences-postgres-fixture";

process.env.SKIP_ENV_VALIDATION = "1";
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}), redis: {} }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class { static slidingWindow() { return {}; } async limit() { return { success: true }; } } }));
vi.mock("@/server/services/content-moderation", () => ({ checkViolationStatus: vi.fn() }));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { preferencesRouter } = await import("@/server/routers/preferences");
const createCaller = createCallerFactory(createTRPCRouter({ preferences: preferencesRouter }));
const ORIGINAL_DATE = new Date("2026-09-30T12:00:00Z");
const BUYING = { preferredZip: "80202", preferredRadiusMiles: 100, preferredMaterialTypes: ["engineered"], priceMinPerSqFt: 1,
  priceMaxPerSqFt: 5, preferredShippingMode: "both", urgency: "2_weeks", minLotSizeSqFt: 100, maxLotSizeSqFt: 1000,
  waterproofRequired: true, preferredSpecies: ["Oak"], minThicknessMm: 5 };
const SELLING = { originZip: "84101", shipCapable: true, typicalMaterialTypes: ["hardwood"], minLotSqFt: 400,
  preferredBuyerRadiusMiles: 250, pricingStyle: "negotiable", leadTimeDaysMin: 2, leadTimeDaysMax: 7 };
type Input = { role: "buyer" | "seller" } & Record<string, unknown>;
function caller(worker: Worker, userId: string, role: "buyer" | "seller" = "seller") {
  return createCaller({ db: worker.db, authUser: { id: `synthetic-${userId}`, email_confirmed_at: "2026-09-01" },
    user: { id: userId, role, active: true, verificationStatus: "verified", businessState: "CO", stripeOnboardingComplete: false },
    clientIp: "127.0.0.1", supabase: {},
    getAuthAssurance: vi.fn().mockRejectedValue(new Error("Ordinary preferences must not require payout MFA")),
  } as unknown as Awaited<ReturnType<typeof createTRPCContext>>);
}
function save(client: ReturnType<typeof caller>, input: Input) {
  // Preserve baseline execution of nullable future contract through the real parser.
  return client.preferences.upsert(input as Parameters<typeof client.preferences.upsert>[0]);
}
async function beforeRelease<T>(operation: ReturnType<typeof track<T>>, milliseconds = 2000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([finish(operation), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Independent operation did not finish while owner lock remained held")), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
}

describe.skipIf(process.env.PREFERENCES_CONTEXT_DB_PROOF !== "1")("preference contexts on isolated real PostgreSQL", () => {
  let f: PreferencesFixture;
  beforeAll(async () => { f = await createPreferencesFixture(); }, 15000);
  afterAll(async () => { if (f) await f.cleanup(); }, 15000);
  async function seeded(fields: Record<string, unknown> = {}) {
    const id = randomUUID();
    await f.seed(id, { role: "seller", ...BUYING, ...SELLING, analyticsTrackingEnabled: false,
      analyticsConsentUpdatedAt: ORIGINAL_DATE, profileComplete: true, completedAt: ORIGINAL_DATE,
      createdAt: ORIGINAL_DATE, updatedAt: ORIGINAL_DATE, ...fields });
    return id;
  }

  it.each(["buyer", "seller"] as const)("persists independent match channels for a purchasing %s without changing Selling or consent", async role => {
    const id = await seeded();
    const client = caller(f.a, id, role);
    await save(client, { role: "buyer", buyerMatchInAppEnabled: false, buyerMatchEmailEnabled: true });
    expect(await client.preferences.get()).toMatchObject({ userId: id, buyerMatchInAppEnabled: false, buyerMatchEmailEnabled: true, ...BUYING, ...SELLING, analyticsTrackingEnabled: false });
    await save(client, { role: "buyer", buyerMatchEmailEnabled: false });
    expect(await f.read(id)).toMatchObject({ buyerMatchInAppEnabled: false, buyerMatchEmailEnabled: false, ...BUYING, ...SELLING });
    f.note(`match-channels-${role}`, await f.read(id));
  });

  it("preserves match channels across a Selling save and ignores cross-context channel input", async () => {
    const id = await seeded();
    const client = caller(f.a, id);
    await save(client, { role: "buyer", buyerMatchInAppEnabled: false, buyerMatchEmailEnabled: false });
    await save(client, { role: "seller", originZip: "90210", buyerMatchEmailEnabled: true });
    expect(await f.read(id)).toMatchObject({ originZip: "90210", buyerMatchInAppEnabled: false, buyerMatchEmailEnabled: false, ...BUYING });
  });

  it("defaults a new preference profile to in-app matches with email off", async () => {
    const id = randomUUID(), client = caller(f.a, id);
    await save(client, { role: "buyer", preferredMaterialTypes: ["engineered"] });
    expect(await f.read(id)).toMatchObject({ buyerMatchInAppEnabled: true, buyerMatchEmailEnabled: false });
  });

  it("rejects malformed channel values without changing the owned row", async () => {
    const id = await seeded(), before = await f.read(id);
    await expect(save(caller(f.a, id), { role: "buyer", buyerMatchEmailEnabled: "false" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await f.read(id)).toEqual(before);
  });

  it("persists a seller's buying patch without overwriting selling, omitted values, or consent", async () => {
    const id = await seeded();
    await save(caller(f.a, id), { role: "buyer", priceMaxPerSqFt: 4, waterproofRequired: undefined });
    const row = await f.read(id);
    expect(row).toMatchObject({ ...BUYING, ...SELLING, userId: id, role: "seller", priceMaxPerSqFt: 4,
      waterproofRequired: true, analyticsTrackingEnabled: false, analyticsConsentUpdatedAt: ORIGINAL_DATE });
    f.note("partial-context-readback", row);
  });

  it("persists explicit null, empty arrays, false and zero distinctly from undefined", async () => {
    const id = await seeded({ role: "buyer" });
    await save(caller(f.a, id, "buyer"), { role: "buyer", preferredZip: null, priceMaxPerSqFt: null,
      minThicknessMm: 0, waterproofRequired: false, preferredSpecies: [], preferredMaterialTypes: [], urgency: undefined });
    expect(await f.read(id)).toMatchObject({ preferredZip: null, priceMaxPerSqFt: null, minThicknessMm: 0,
      waterproofRequired: false, preferredSpecies: [], preferredMaterialTypes: [], urgency: "2_weeks", ...SELLING });
    f.note("explicit-empty-readback", await f.read(id));
  });

  it("clears optional seller scalars without disturbing the buying group", async () => {
    const id = await seeded();
    await save(caller(f.a, id), { role: "seller", originZip: null, minLotSqFt: null, leadTimeDaysMin: null });
    expect(await f.read(id)).toMatchObject({ ...BUYING, originZip: null, minLotSqFt: null, leadTimeDaysMin: null });
  });

  it("uses persisted dependencies when an enabled parent is patched alone", async () => {
    const id = await seeded({ automaticMarkdownEnabled: true, automaticMarkdownFloorPercent: 60, automaticMarkdownIntervalDays: 14 });
    await save(caller(f.a, id), { role: "seller", automaticMarkdownEnabled: true });
    expect(await f.read(id)).toMatchObject({ automaticMarkdownEnabled: true, automaticMarkdownFloorPercent: 60, automaticMarkdownIntervalDays: 14, ...BUYING });
  });

  it.each([
    { automaticMarkdownFloorPercent: null }, { automaticMarkdownIntervalDays: null }, { allowedDestinationStates: [] },
  ])("rolls back an explicit dependency clear while its saved parent remains enabled: %j", async patch => {
    const id = await seeded({ automaticMarkdownEnabled: true, automaticMarkdownFloorPercent: 60, automaticMarkdownIntervalDays: 14,
      sellingTerritoryMode: "allowed_states", allowedDestinationStates: ["CO"] });
    const before = await f.read(id);
    await expect(save(caller(f.a, id), { role: "seller", ...patch })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await f.read(id)).toEqual(before); await f.noAdvisoryLocks(f.a);
    f.note("dependency-rejection-unchanged", { userId: id, patch, row: await f.read(id) });
  });

  it.each([
    { role: "buyer" as const, priceMinPerSqFt: 6 },
    { role: "buyer" as const, maxLotSizeSqFt: 50 },
    { role: "seller" as const, leadTimeDaysMin: 8 },
  ])("rejects a range inverted by a partial saved-context merge: %j", async patch => {
    const id = await seeded(), before = await f.read(id);
    await expect(save(caller(f.a, id), patch)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await f.read(id)).toEqual(before); await f.noAdvisoryLocks(f.a);
  });

  it("normalizes disabled dependencies with real JSON and money serialization", async () => {
    const id = await seeded({ canSplitLots: true, partialQuantityMarkupPercent: 20,
      automaticMarkdownEnabled: true, automaticMarkdownFloorPercent: 60, automaticMarkdownIntervalDays: 14,
      sellingTerritoryMode: "allowed_states", allowedDestinationStates: ["CO"],
      freightPaymentMode: "seller_pays", sellerFreightStates: ["CO"], freightDropCharge: 95.125 });
    expect((await f.read(id))?.freightDropCharge).toBe(95.125);
    await save(caller(f.a, id), { role: "seller", canSplitLots: false, automaticMarkdownEnabled: false,
      sellingTerritoryMode: "unrestricted", freightPaymentMode: "buyer_pays" });
    expect(await f.read(id)).toMatchObject({ ...BUYING, canSplitLots: false, partialQuantityMarkupPercent: null,
      automaticMarkdownEnabled: false, automaticMarkdownFloorPercent: null, automaticMarkdownIntervalDays: null,
      allowedDestinationStates: [], sellerFreightStates: [], freightDropCharge: null });
  });

  it("waits on the exact user transaction lock before accessing the preferences table and releases at commit", async () => {
    const id = await seeded({ role: "buyer" }), held = await f.hold(id);
    const operation = track(save(caller(f.a, id, "buyer"), { role: "buyer", priceMaxPerSqFt: 4 }));
    try { await f.blockedBeforeRead(f.a, operation, id); }
    finally { await held.release(); await operation.outcome; }
    await finish(operation); expect((await f.read(id))?.priceMaxPerSqFt).toBe(4); await f.noAdvisoryLocks(f.a);
  }, 12000);

  it("allows another user to persist while the first user remains observably blocked", async () => {
    const first = await seeded({ role: "buyer" }), second = await seeded({ role: "buyer" });
    const held = await f.hold(first);
    const blocked = track(save(caller(f.a, first, "buyer"), { role: "buyer", priceMaxPerSqFt: 4 }));
    let independent: ReturnType<typeof track<unknown>> | undefined;
    try {
      await f.blockedBeforeRead(f.a, blocked, first);
      independent = track(save(caller(f.b, second, "buyer"), { role: "buyer", priceMaxPerSqFt: 3 }));
      await beforeRelease(independent); expect(blocked.settled).toBe(false);
      // Read through B: A's single physical connection is intentionally still blocked.
      const persisted = await f.b.db.query.userPreferences.findFirst({ where: (table, { eq }) => eq(table.userId, second) });
      expect(persisted?.priceMaxPerSqFt).toBe(3); f.note("cross-user-progress", { blocked: first, completed: second, persisted });
    } finally { await held.release(); await blocked.outcome; if (independent) await independent.outcome; }
    await finish(blocked); await f.noAdvisoryLocks(f.a); await f.noAdvisoryLocks(f.b);
  }, 12000);

  it.each(["existing-row", "first-use"] as const)("preserves concurrent different-field buying/selling patches: %s", async mode => {
    const id = mode === "existing-row" ? await seeded() : randomUUID();
    const held = await f.hold(id);
    const buying = track(save(caller(f.a, id), { role: "buyer", ...BUYING, priceMaxPerSqFt: 4 }));
    const selling = track(save(caller(f.b, id), { role: "seller", ...SELLING, originZip: "10001" }));
    try { await Promise.all([f.blockedBeforeRead(f.a, buying, id), f.blockedBeforeRead(f.b, selling, id)]); }
    finally { await held.release(); await Promise.all([buying.outcome, selling.outcome]); }
    await finish(buying); await finish(selling);
    const row = await f.read(id); expect(row).toMatchObject({ ...BUYING, ...SELLING, priceMaxPerSqFt: 4, originZip: "10001" });
    expect(await f.count(id)).toBe(1); await f.noAdvisoryLocks(f.a); await f.noAdvisoryLocks(f.b);
    f.note("concurrent-context-readback", { mode, row, rowCount: await f.count(id) });
  }, 12000);

  it("preserves two concurrent different fields within the same buying group", async () => {
    const id = await seeded({ role: "buyer" }), held = await f.hold(id);
    const min = track(save(caller(f.a, id, "buyer"), { role: "buyer", priceMinPerSqFt: 2 }));
    const max = track(save(caller(f.b, id, "buyer"), { role: "buyer", priceMaxPerSqFt: 4 }));
    try { await Promise.all([f.blockedBeforeRead(f.a, min, id), f.blockedBeforeRead(f.b, max, id)]); }
    finally { await held.release(); await Promise.all([min.outcome, max.outcome]); }
    await finish(min); await finish(max);
    expect(await f.read(id)).toMatchObject({ priceMinPerSqFt: 2, priceMaxPerSqFt: 4, ...SELLING });
  }, 12000);

  it.each(["existing-row", "first-use"] as const)("retains shared consent committed while a context upsert waits, without requiring a consent lock: %s", async mode => {
    const id = mode === "existing-row" ? await seeded() : randomUUID();
    const before = await f.read(id), held = await f.hold(id);
    const patch = track(save(caller(f.a, id), mode === "existing-row" ? { role: "seller", originZip: "10001" } : { role: "buyer", ...BUYING }));
    let consent: ReturnType<typeof track<unknown>> | undefined;
    let consentAt: Date | null | undefined;
    try {
      await f.blockedBeforeRead(f.a, patch, id);
      consent = track(caller(f.b, id).preferences.setAnalyticsConsent({ enabled: true }));
      await beforeRelease(consent); expect(patch.settled).toBe(false);
      const interim = await f.b.db.query.userPreferences.findFirst({ where: (table, { eq }) => eq(table.userId, id) });
      expect(interim).toMatchObject(mode === "existing-row" ? { ...BUYING, ...SELLING, role: before!.role,
        profileComplete: before!.profileComplete, completedAt: before!.completedAt, analyticsTrackingEnabled: true }
        : { role: "seller", profileComplete: false, completedAt: null, analyticsTrackingEnabled: true });
      consentAt = interim?.analyticsConsentUpdatedAt;
      expect(consentAt).toBeInstanceOf(Date); expect(consentAt?.getTime()).toBeGreaterThan(ORIGINAL_DATE.getTime());
      f.note("consent-committed-while-context-waits", { mode, userId: id, consentAt });
    } finally { await held.release(); await patch.outcome; if (consent) await consent.outcome; }
    await finish(patch);
    expect(await f.read(id)).toMatchObject(mode === "existing-row" ? { ...BUYING, ...SELLING, originZip: "10001", analyticsTrackingEnabled: true, analyticsConsentUpdatedAt: consentAt }
      : { ...BUYING, role: "seller", profileComplete: false, completedAt: null, analyticsTrackingEnabled: true, analyticsConsentUpdatedAt: consentAt });
    expect(await f.count(id)).toBe(1);
  }, 12000);

  it("rolls back an actual PostgreSQL constraint failure and releases the user lock", async () => {
    const id = await seeded({ role: "buyer" }), before = await f.read(id);
    await f.addWriteFailure();
    try {
      await expect(save(caller(f.a, id, "buyer"), { role: "buyer", priceMaxPerSqFt: 9 })).rejects.toThrow();
      expect(await f.read(id)).toEqual(before); await f.noAdvisoryLocks(f.a);
      f.note("sql-write-rejection-unchanged", { userId: id, row: await f.read(id) });
    } finally { await f.removeWriteFailure(); }
    // Same actor/connection can proceed after rollback; failed transaction must not poison it.
    await save(caller(f.a, id, "buyer"), { role: "buyer", priceMaxPerSqFt: 4 });
    expect((await f.read(id))?.priceMaxPerSqFt).toBe(4);
  });
});
