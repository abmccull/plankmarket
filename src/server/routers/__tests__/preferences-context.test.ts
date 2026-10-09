// Candidate only: copy to src/server/routers/__tests__/preferences-context.test.ts
// before product edits. No execution or passing result is claimed by its author.
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { createTRPCContext } from "@/server/trpc";
import { userPreferences } from "@/server/db/schema/user-preferences";

process.env.SKIP_ENV_VALIDATION = "1";
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() { return {}; }
    async limit() { return { success: true }; }
  },
}));
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}), redis: {} }));
vi.mock("@/server/services/content-moderation", () => ({ checkViolationStatus: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: vi.fn() } }));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { preferencesRouter } = await import("@/server/routers/preferences");
const { authRouter } = await import("@/server/routers/auth");
const createCaller = createCallerFactory(createTRPCRouter({ preferences: preferencesRouter, auth: authRouter }));
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ORIGINAL_DATE = new Date("2026-09-30T12:00:00Z");
type Context = "buyer" | "seller";
type Row = Record<string, unknown> & { userId: string; role: Context };
type Completion = { filledCount: number; totalFields: number; completionPercent: number; missingFields: string[]; profileComplete: boolean };
type Trace = { kind: "begin" | "lock" | "read" | "write" | "commit" | "rollback"; transactionId: number | null; userId?: string; sql?: string; params?: unknown[] };
const defined = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
const clone = <T,>(value: T): T => structuredClone(value);

function row(overrides: Record<string, unknown> = {}): Row {
  return {
    id: "33333333-3333-4333-8333-333333333333", userId: OWNER, role: "seller",
    preferredZip: null, preferredRadiusMiles: 100, preferredMaterialTypes: null,
    preferredSpecies: null, preferredUseCase: null, minLotSizeSqFt: null, maxLotSizeSqFt: null,
    priceMinPerSqFt: null, priceMaxPerSqFt: null, preferredShippingMode: null, urgency: null,
    preferredInstallTypes: null, minThicknessMm: null, minWearLayerMil: null,
    preferredCertifications: null, waterproofRequired: false,
    originZip: null, shipCapable: false, leadTimeDaysMin: null, leadTimeDaysMax: null,
    typicalMaterialTypes: null, minLotSqFt: null, avgLotSqFt: null, canSplitLots: false,
    preferredBuyerRadiusMiles: null, pricingStyle: null, palletizationCapable: true, inventorySource: null,
    partialQuantityMarkupPercent: null, automaticMarkdownEnabled: false,
    automaticMarkdownFloorPercent: null, automaticMarkdownIntervalDays: null,
    defaultAllowOffers: true, allowSampleRequests: false, sellingTerritoryMode: "unrestricted",
    allowedDestinationStates: [], freightPaymentMode: "buyer_pays", sellerFreightStates: [],
    freightDropCharge: null, taxRegisteredStates: [], analyticsTrackingEnabled: false,
    analyticsConsentUpdatedAt: ORIGINAL_DATE, profileComplete: false, completedAt: null,
    createdAt: ORIGINAL_DATE, updatedAt: ORIGINAL_DATE,
    ...overrides,
  } as Row;
}
const BUYING = {
  preferredZip: "80202", preferredRadiusMiles: 100, preferredMaterialTypes: ["engineered"],
  priceMaxPerSqFt: 5, preferredShippingMode: "both", urgency: "2_weeks",
};
const SELLING = {
  originZip: "84101", shipCapable: true, typicalMaterialTypes: ["hardwood"],
  minLotSqFt: 400, preferredBuyerRadiusMiles: 250, pricingStyle: "negotiable", leadTimeDaysMin: 2,
};

// Stateful persistence double for the actual router, not a duplicate validator.
// It checks owner predicates and applies only supplied insert/conflict values.
// Transaction cloning models rollback; it does NOT prove PostgreSQL locking/concurrency.
function persistence(initial: Row[] = []) {
  const committed = new Map(initial.map((item) => [item.userId, clone(item)]));
  let sequence = 0;
  const trace: Trace[] = [];
  const writes: Array<{ transactionId: number | null; userId: string; inserted: Record<string, unknown>; updated: Record<string, unknown> }> = [];
  const faults = { read: false, lock: false, write: false };
  const ownerFrom = (where: SQL) => {
    const compiled = new PgDialect().sqlToQuery(where);
    expect(compiled.sql).toContain('"user_preferences"."user_id"');
    expect(compiled.params).toHaveLength(1);
    expect(typeof compiled.params[0]).toBe("string");
    return compiled.params[0] as string;
  };
  function executor(rows: Map<string, Row>, transactionId: number | null) {
    const findFirst = vi.fn(async ({ where }: { where: SQL }) => {
      const userId = ownerFrom(where);
      trace.push({ kind: "read", transactionId, userId });
      if (faults.read) throw new Error("Synthetic preference read failed");
      return clone(rows.get(userId));
    });
    const insert = vi.fn((table: unknown) => {
      expect(table).toBe(userPreferences);
      let inserted: Record<string, unknown> = {};
      let updated: Record<string, unknown> = {};
      const builder = {
        values(values: Record<string, unknown>) { inserted = defined(values); return builder; },
        onConflictDoUpdate(input: { target: unknown; set: Record<string, unknown> }) {
          expect(input.target).toBe(userPreferences.userId);
          updated = defined(input.set); return builder;
        },
        async returning(_projection?: unknown) {
          void _projection;
          const userId = inserted.userId as string;
          expect(typeof userId).toBe("string");
          if (faults.write) throw new Error("Synthetic preference write failed");
          trace.push({ kind: "write", transactionId, userId });
          writes.push({ transactionId, userId, inserted: clone(inserted), updated: clone(updated) });
          const existing = rows.get(userId);
          const saved = existing ? { ...existing, ...updated } : row(inserted);
          rows.set(userId, saved);
          return [clone(saved)];
        },
      };
      return builder;
    });
    const execute = vi.fn(async (statement: SQL) => {
      const compiled = new PgDialect().sqlToQuery(statement);
      trace.push({ kind: "lock", transactionId, sql: compiled.sql, params: compiled.params });
      if (faults.lock) throw new Error("Synthetic preference lock failed");
      return [];
    });
    // auth.getOnboardingProgress only needs count rows in these fixtures.
    const select = vi.fn(() => ({ from: () => ({ where: async () => [{ count: 0 }] }) }));
    return { query: { userPreferences: { findFirst } }, insert, execute, select };
  }
  const direct = executor(committed, null);
  const db = {
    ...direct,
    transaction: vi.fn(async (callback: (tx: ReturnType<typeof executor>) => Promise<unknown>) => {
      const transactionId = ++sequence;
      const working = new Map([...committed].map(([key, value]) => [key, clone(value)]));
      trace.push({ kind: "begin", transactionId });
      try {
        const result = await callback(executor(working, transactionId));
        // Preserve the direct executor's reference after commit.
        committed.clear();
        for (const [key, value] of working) committed.set(key, value);
        trace.push({ kind: "commit", transactionId });
        return result;
      } catch (error) {
        trace.push({ kind: "rollback", transactionId });
        throw error;
      }
    }),
  };
  return { db, trace, writes, faults, peek: (userId = OWNER) => clone(committed.get(userId)), count: () => committed.size };
}

function caller(fixture: ReturnType<typeof persistence>, role: Context = "seller", userId = OWNER) {
  const ctx = {
    db: fixture.db, authUser: { id: "auth-synthetic", email_confirmed_at: "2026-09-01" },
    user: { id: userId, role, active: true, verificationStatus: "verified", businessState: "CO",
      name: "Synthetic Business", businessName: "Synthetic Flooring", phone: "5550000000", stripeOnboardingComplete: false },
    clientIp: "127.0.0.1", supabase: {},
    getAuthAssurance: vi.fn().mockRejectedValue(new Error("Ordinary preference use must not request payout MFA")),
  } as unknown as Awaited<ReturnType<typeof createTRPCContext>>;
  return createCaller(ctx);
}
// Wire calls deliberately accept the proposed nullable patch before the old
// schema/types know it; the actual tRPC/Zod input parser still executes.
function save(client: ReturnType<typeof caller>, input: Record<string, unknown>) {
  return client.preferences.upsert(input as Parameters<typeof client.preferences.upsert>[0]);
}
function completion(client: ReturnType<typeof caller>, role: Context) {
  return (client.preferences.getCompletionStatus as unknown as (input: { role: Context }) => Promise<Completion>)({ role });
}

describe("owned buying and selling preference contexts", () => {
  it("keeps disabled saved parents authoritative for dependent-only patches", async () => {
    const f = persistence([row({ ...BUYING, ...SELLING, canSplitLots: false, freightPaymentMode: "buyer_pays" })]);
    await save(caller(f), { role: "seller", partialQuantityMarkupPercent: 20, sellerFreightStates: ["CO"], freightDropCharge: 95 });
    expect(f.peek()).toMatchObject({ ...BUYING, partialQuantityMarkupPercent: null, sellerFreightStates: [], freightDropCharge: null });
  });

  it.each([
    { role: "buyer", answers: { preferredZip: "80202", preferredMaterialTypes: ["engineered"], priceMaxPerSqFt: 5, preferredShippingMode: "both" } },
    { role: "seller", answers: { originZip: "84101", typicalMaterialTypes: ["hardwood"], pricingStyle: "fixed", leadTimeDaysMin: 0 } },
  ] as const)("uses database defaults for first-use $role completion", async ({ role, answers }) => {
    const f = persistence();
    const client = caller(f, role);
    await save(client, { role, ...answers });
    expect(f.peek()).toMatchObject({ role, profileComplete: true });
    expect(await completion(client, role)).toMatchObject({ filledCount: 5, profileComplete: true });
  });

  it("preserves legacy role and completedAt when saving another context", async () => {
    const f = persistence([row({ ...SELLING, profileComplete: true, completedAt: ORIGINAL_DATE })]);
    await save(caller(f), { role: "buyer", preferredZip: "80202" });
    expect(f.peek()).toMatchObject({ role: "seller", profileComplete: true, completedAt: ORIGINAL_DATE });
  });

  it("uses the authenticated account's canonical legacy role on first buyer-context save", async () => {
    const f = persistence();
    await save(caller(f), { role: "buyer", ...BUYING });
    expect(f.peek()).toMatchObject({ role: "seller", profileComplete: false, ...BUYING });
  });

  it.each([
    { role: "buyer", original: { priceMinPerSqFt: 2, priceMaxPerSqFt: 4 }, patch: { priceMaxPerSqFt: 1 } },
    { role: "buyer", original: { minLotSizeSqFt: 400, maxLotSizeSqFt: 900 }, patch: { minLotSizeSqFt: 1000 } },
    { role: "seller", original: { leadTimeDaysMin: 2, leadTimeDaysMax: 5 }, patch: { leadTimeDaysMax: 1 } },
  ] as const)("rejects an inverted saved range in a partial $role update", async ({ role, original, patch }) => {
    const saved = row({ ...BUYING, ...SELLING, ...original });
    const f = persistence([saved]);
    await expect(save(caller(f), { role, ...patch })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(f.peek()).toEqual(saved);
    expect(f.writes).toHaveLength(0);
  });

  it("does not expose a selling setup path to a buyer-only account", async () => {
    const client = caller(persistence([row({ role: "buyer", ...BUYING })]), "buyer");
    await expect(completion(client, "seller")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(client.auth.getOnboardingProgress({ role: "seller" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets a seller save buying preferences into its existing legacy seller row without touching another business", async () => {
    const own = row({ ...SELLING, profileComplete: true, completedAt: ORIGINAL_DATE });
    const other = row({ userId: OTHER, role: "buyer", ...BUYING });
    const f = persistence([own, other]);
    const client = caller(f);
    await save(client, { role: "buyer", ...BUYING });
    expect(f.count()).toBe(2);
    expect(f.peek()).toMatchObject({ ...BUYING, ...SELLING, userId: OWNER, role: "seller" });
    expect(f.peek(OTHER)).toEqual(other);
    expect(await completion(client, "buyer")).toMatchObject({ totalFields: 6, filledCount: 6, profileComplete: true });
    expect(await completion(client, "seller")).toMatchObject({ totalFields: 7, filledCount: 7, profileComplete: true });
  });

  it("does not allow buyer-only authority to write selling defaults", async () => {
    const original = row({ role: "buyer", ...BUYING });
    const f = persistence([original]);
    await expect(save(caller(f, "buyer"), { role: "seller", ...SELLING })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.peek()).toEqual(original);
    expect(f.writes).toHaveLength(0);
    expect(f.db.transaction).not.toHaveBeenCalled();
  });

  it("does not persist seller-only fields smuggled through buying context", async () => {
    const original = row({ role: "buyer", originZip: "84101", defaultAllowOffers: true });
    const f = persistence([original]);
    // Both explicit rejection and Zod's established stripping contract are safe.
    try { await save(caller(f, "buyer"), { role: "buyer", preferredZip: "80202", originZip: "10001", defaultAllowOffers: false }); }
    catch (error) { expect(error).toMatchObject({ code: "BAD_REQUEST" }); }
    expect(f.peek()).toMatchObject({ originZip: "84101", defaultAllowOffers: true });
    for (const write of f.writes) {
      expect(write.updated).not.toHaveProperty("originZip");
      expect(write.updated).not.toHaveProperty("defaultAllowOffers");
    }
  });

  it("keeps completion from the merged saved buyer state after a one-field patch", async () => {
    const f = persistence([row({ role: "buyer", ...BUYING, profileComplete: true, completedAt: ORIGINAL_DATE })]);
    const client = caller(f, "buyer");
    await save(client, { role: "buyer", priceMaxPerSqFt: 4 });
    expect(f.peek()).toMatchObject({ ...BUYING, priceMaxPerSqFt: 4 });
    expect(await completion(client, "buyer")).toMatchObject({ filledCount: 6, profileComplete: true });
    expect(f.writes.at(-1)?.updated).not.toHaveProperty("originZip");
  });

  it("does not validate or rewrite incomplete legacy selling defaults during a buying patch", async () => {
    const f = persistence([row({ ...BUYING, automaticMarkdownEnabled: true, automaticMarkdownFloorPercent: null, automaticMarkdownIntervalDays: null })]);
    await save(caller(f), { role: "buyer", priceMaxPerSqFt: 3 });
    expect(f.peek()).toMatchObject({ priceMaxPerSqFt: 3, automaticMarkdownEnabled: true,
      automaticMarkdownFloorPercent: null, automaticMarkdownIntervalDays: null });
    expect(f.writes.at(-1)?.updated).not.toHaveProperty("automaticMarkdownEnabled");
  });

  it("validates enabled seller parents against existing dependencies", async () => {
    const f = persistence([row({ ...SELLING, automaticMarkdownEnabled: true, automaticMarkdownFloorPercent: 60, automaticMarkdownIntervalDays: 14 })]);
    await save(caller(f), { role: "seller", automaticMarkdownEnabled: true });
    expect(f.peek()).toMatchObject({ automaticMarkdownEnabled: true, automaticMarkdownFloorPercent: 60, automaticMarkdownIntervalDays: 14 });
  });

  it.each([
    { automaticMarkdownFloorPercent: null },
    { automaticMarkdownIntervalDays: null },
  ])("rejects clearing a required dependency while the saved parent remains enabled: %j", async (patch) => {
    const original = row({ ...SELLING, automaticMarkdownEnabled: true, automaticMarkdownFloorPercent: 60, automaticMarkdownIntervalDays: 14 });
    const f = persistence([original]);
    await expect(save(caller(f), { role: "seller", ...patch })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(f.peek()).toEqual(original);
    expect(f.writes).toHaveLength(0);
  });

  it("rejects an empty saved restricted territory even when the patch omits its parent", async () => {
    const original = row({ ...SELLING, sellingTerritoryMode: "allowed_states", allowedDestinationStates: ["CO"] });
    const f = persistence([original]);
    await expect(save(caller(f), { role: "seller", allowedDestinationStates: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(f.peek()).toEqual(original);
    expect(f.writes).toHaveLength(0);
  });

  it("normalizes disabled seller dependencies without touching the buying field group", async () => {
    const f = persistence([row({ ...BUYING, ...SELLING, canSplitLots: true, partialQuantityMarkupPercent: 20,
      automaticMarkdownEnabled: true, automaticMarkdownFloorPercent: 60, automaticMarkdownIntervalDays: 14,
      sellingTerritoryMode: "allowed_states", allowedDestinationStates: ["CO"],
      freightPaymentMode: "seller_pays", sellerFreightStates: ["CO"], freightDropCharge: 95 })]);
    await save(caller(f), { role: "seller", canSplitLots: false, automaticMarkdownEnabled: false,
      sellingTerritoryMode: "unrestricted", freightPaymentMode: "buyer_pays" });
    expect(f.peek()).toMatchObject({ ...BUYING, partialQuantityMarkupPercent: null,
      automaticMarkdownFloorPercent: null, automaticMarkdownIntervalDays: null,
      allowedDestinationStates: [], sellerFreightStates: [], freightDropCharge: null });
    expect(f.writes.at(-1)?.updated).not.toHaveProperty("preferredZip");
  });

  it("supports explicit null clears for optional buyer scalars", async () => {
    const f = persistence([row({ role: "buyer", ...BUYING, minThicknessMm: 5, minLotSizeSqFt: 400 })]);
    await save(caller(f, "buyer"), { role: "buyer", preferredZip: null, priceMaxPerSqFt: null, minThicknessMm: null, minLotSizeSqFt: null });
    expect(f.peek()).toMatchObject({ preferredZip: null, priceMaxPerSqFt: null, minThicknessMm: null, minLotSizeSqFt: null });
    expect(await completion(caller(f, "buyer"), "buyer")).toMatchObject({ filledCount: 4, profileComplete: false });
  });

  it("persists false, zero and empty arrays instead of treating them as omitted", async () => {
    const f = persistence([row({ role: "buyer", ...BUYING, waterproofRequired: true, minThicknessMm: 5, preferredSpecies: ["Oak"] })]);
    await save(caller(f, "buyer"), { role: "buyer", waterproofRequired: false, minThicknessMm: 0, preferredMaterialTypes: [], preferredSpecies: [] });
    expect(f.peek()).toMatchObject({ waterproofRequired: false, minThicknessMm: 0, preferredMaterialTypes: [], preferredSpecies: [] });
    expect(await completion(caller(f, "buyer"), "buyer")).toMatchObject({ filledCount: 5, totalFields: 6, completionPercent: 83, profileComplete: true });
  });

  it("supports explicit null clears for optional seller scalars without clearing buying preferences", async () => {
    const f = persistence([row({ ...BUYING, ...SELLING })]);
    await save(caller(f), { role: "seller", originZip: null, minLotSqFt: null, leadTimeDaysMin: null });
    expect(f.peek()).toMatchObject({ ...BUYING, originZip: null, minLotSqFt: null, leadTimeDaysMin: null });
    expect(await completion(caller(f), "seller")).toMatchObject({ filledCount: 4, profileComplete: false });
    expect(await completion(caller(f), "buyer")).toMatchObject({ profileComplete: true });
  });

  it("leaves omitted fields intact, including an explicitly undefined field", async () => {
    const f = persistence([row({ role: "buyer", ...BUYING, waterproofRequired: true })]);
    await save(caller(f, "buyer"), { role: "buyer", priceMaxPerSqFt: 3, waterproofRequired: undefined });
    expect(f.peek()).toMatchObject({ ...BUYING, priceMaxPerSqFt: 3, waterproofRequired: true });
  });

  it("derives both completion results independently from fields, ignoring the legacy flag", async () => {
    const f = persistence([row({ ...BUYING, role: "seller", profileComplete: false })]);
    const client = caller(f);
    expect(await completion(client, "buyer")).toMatchObject({ filledCount: 6, totalFields: 6, profileComplete: true });
    expect(await completion(client, "seller")).toMatchObject({ filledCount: 1, totalFields: 7, profileComplete: false });
  });

  it("does not complete buying preferences just because legacy selling preferences were complete", async () => {
    const f = persistence([row({ ...SELLING, role: "seller", profileComplete: true })]);
    expect(await completion(caller(f), "buyer")).toMatchObject({ filledCount: 1, totalFields: 6, profileComplete: false });
    expect(await completion(caller(f), "seller")).toMatchObject({ filledCount: 7, totalFields: 7, profileComplete: true });
  });

  it("counts explicit false and zero seller answers at the existing threshold", async () => {
    const f = persistence([row({ shipCapable: false, originZip: "84101", typicalMaterialTypes: ["hardwood"], pricingStyle: "fixed", leadTimeDaysMin: 0 })]);
    expect(await completion(caller(f), "seller")).toMatchObject({ filledCount: 5, totalFields: 7, completionPercent: 71, profileComplete: true });
  });

  it("returns the requested completion shape before the first row exists", async () => {
    const client = caller(persistence());
    expect(await completion(client, "buyer")).toMatchObject({ filledCount: 0, totalFields: 6, profileComplete: false });
    expect(await completion(client, "seller")).toMatchObject({ filledCount: 0, totalFields: 7, profileComplete: false });
  });

  it("saves both contexts once on a first-use row without duplicating it", async () => {
    const f = persistence();
    const client = caller(f);
    await save(client, { role: "buyer", ...BUYING });
    await save(client, { role: "seller", ...SELLING });
    expect(f.count()).toBe(1);
    expect(f.peek()).toMatchObject({ ...BUYING, ...SELLING, userId: OWNER });
    expect(await completion(client, "buyer")).toMatchObject({ profileComplete: true });
    expect(await completion(client, "seller")).toMatchObject({ profileComplete: true });
  });

  it("keeps shared consent and its timestamp when a context patch omits consent", async () => {
    const f = persistence([row({ ...BUYING, ...SELLING, analyticsTrackingEnabled: false, analyticsConsentUpdatedAt: ORIGINAL_DATE })]);
    const client = caller(f);
    await save(client, { role: "buyer", priceMaxPerSqFt: 4 });
    await save(client, { role: "seller", originZip: "10001" });
    expect(f.peek()).toMatchObject({ analyticsTrackingEnabled: false, analyticsConsentUpdatedAt: ORIGINAL_DATE });
    for (const write of f.writes) {
      expect(write.updated).not.toHaveProperty("analyticsTrackingEnabled");
      expect(write.updated).not.toHaveProperty("analyticsConsentUpdatedAt");
    }
  });

  it("allows one shared consent value to change explicitly without erasing either context", async () => {
    const f = persistence([row({ ...BUYING, ...SELLING })]);
    const client = caller(f);
    await save(client, { role: "buyer", analyticsTrackingEnabled: true });
    expect(f.peek()).toMatchObject({ ...BUYING, ...SELLING, analyticsTrackingEnabled: true });
    await client.preferences.setAnalyticsConsent({ enabled: false });
    expect(f.peek()).toMatchObject({ ...BUYING, ...SELLING, analyticsTrackingEnabled: false });
    expect(await completion(client, "buyer")).toMatchObject({ profileComplete: true });
    expect(await completion(client, "seller")).toMatchObject({ profileComplete: true });
    const last = f.writes.at(-1)!.updated;
    expect(last).not.toHaveProperty("profileComplete");
    expect(last).not.toHaveProperty("completedAt");
    expect(last).not.toHaveProperty("role");
  });

  it.each([OWNER, OTHER])("locks the owner before reading/validating/writing a merged row: %s", async (userId) => {
    const f = persistence([row({ userId, role: "buyer", ...BUYING })]);
    await save(caller(f, "buyer", userId), { role: "buyer", priceMaxPerSqFt: 4 });
    expect(f.db.transaction).toHaveBeenCalledOnce();
    const lock = f.trace.find((entry) => entry.kind === "lock");
    expect(lock?.sql).toContain("pg_advisory_xact_lock");
    expect(lock?.params?.some((value) => typeof value === "string" && value.includes(userId))).toBe(true);
    const kinds = f.trace.map((entry) => entry.kind);
    expect(kinds.indexOf("lock")).toBeGreaterThan(kinds.indexOf("begin"));
    expect(kinds.indexOf("read")).toBeGreaterThan(kinds.indexOf("lock"));
    expect(kinds.indexOf("write")).toBeGreaterThan(kinds.indexOf("read"));
    expect(kinds.indexOf("commit")).toBeGreaterThan(kinds.indexOf("write"));
    expect(f.trace.filter((entry) => ["lock", "read", "write"].includes(entry.kind)).every((entry) => entry.transactionId === lock?.transactionId)).toBe(true);
    expect(f.writes[0]?.userId).toBe(userId);
  });

  it.each(["read", "lock", "write"] as const)("retains the saved snapshot if %s fails", async (failure) => {
    const original = row({ role: "buyer", ...BUYING });
    const f = persistence([original]);
    f.faults[failure] = true;
    await expect(save(caller(f, "buyer"), { role: "buyer", priceMaxPerSqFt: 2 })).rejects.toThrow();
    expect(f.peek()).toEqual(original);
    expect(f.trace.some((entry) => entry.kind === "commit")).toBe(false);
    expect(f.writes).toHaveLength(0);
  });
});

describe("onboarding uses the selected preference context", () => {
  it("does not count an analytics-only row as completed preference setup", async () => {
    const client = caller(persistence([row({ analyticsTrackingEnabled: true })]));
    const buying = await client.auth.getOnboardingProgress({ role: "buyer" });
    const selling = await client.auth.getOnboardingProgress({ role: "seller" });
    expect(buying.steps).toMatchObject({ profile_complete: true, business_verified: true, preferences_set: false });
    expect(selling.steps).toMatchObject({ profile_complete: true, business_verified: true, preferences_set: false, stripe_connected: false });
    expect(buying.steps).not.toHaveProperty("stripe_connected");
  });

  it("does not let complete selling fields complete buying onboarding", async () => {
    const client = caller(persistence([row({ ...SELLING, profileComplete: true })]));
    expect((await client.auth.getOnboardingProgress({ role: "buyer" })).steps.preferences_set).toBe(false);
    expect((await client.auth.getOnboardingProgress({ role: "seller" })).steps.preferences_set).toBe(true);
  });

  it("recognizes completed buying fields despite a false legacy seller flag", async () => {
    const client = caller(persistence([row({ ...BUYING, profileComplete: false })]));
    expect((await client.auth.getOnboardingProgress({ role: "buyer" })).steps.preferences_set).toBe(true);
    expect((await client.auth.getOnboardingProgress({ role: "seller" })).steps.preferences_set).toBe(false);
  });
});
