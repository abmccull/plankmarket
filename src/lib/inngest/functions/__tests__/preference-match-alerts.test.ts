// Candidate only: apply before product edits to
// src/lib/inngest/functions/__tests__/preference-match-alerts.test.ts.
// Real handler/domain helpers/SQL compilation; database and delivery are disconnected doubles.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { notifications } from "@/server/db/schema/notifications";
import { userPreferences } from "@/server/db/schema/user-preferences";
import { users } from "@/server/db/schema/users";
import { buildEmailIdempotencyKey } from "@/lib/email/delivery-policy";
import type { SendEmailOrThrowInput } from "@/lib/email/delivery";

type Handler = (input: Record<string, unknown>) => Promise<unknown>;
const mocks = vi.hoisted(() => ({
  handler: null as Handler | null,
  trigger: null as unknown,
  options: null as unknown,
  listing: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  send: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/inngest/client", () => ({ inngest: {
  createFunction: vi.fn((...args: unknown[]) => {
    mocks.options = args[0]; mocks.trigger = args[1]; mocks.handler = args[2] as Handler;
    return { id: "preference-match-alerts" };
  }),
} }));
vi.mock("@/server/db", () => ({ db: {
  query: { listings: { findFirst: mocks.listing } },
  select: mocks.select,
  transaction: mocks.transaction,
} }));
vi.mock("@/lib/email/delivery", () => ({ sendEmailOrThrow: mocks.send }));
vi.mock("@/env", () => ({ env: {
  NEXT_PUBLIC_APP_URL: "https://plankmarket.example",
  EMAIL_FROM: "PlankMarket <noreply@plankmarket.example>",
} }));
await import("@/lib/inngest/functions/preference-match-alerts");

const RECIPIENT = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const LISTING_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-10-01T12:00:00Z");
const dialect = new PgDialect();
type Query = ReturnType<PgDialect["sqlToQuery"]>;
type Recipient = {
  userId: string;
  preferredMaterialTypes: string[];
  priceMinPerSqFt: number | null;
  priceMaxPerSqFt: number | null;
  preferredZip: string | null;
  preferredRadiusMiles: number | null;
  buyerMatchInAppEnabled: boolean;
  buyerMatchEmailEnabled: boolean;
  buyerEmail: string;
  buyerName: string;
  buyerRole: "buyer" | "seller" | "admin";
  buyerVerificationStatus: "verified" | "unverified";
  buyerBusinessState: string | null;
  // Fixture metadata only. It must not become selection authority.
  legacyPreferenceRole: "buyer" | "seller";
  profileComplete: boolean;
};
type Notification = { userId: string; type: string; message: string; data: {
  listingId: string; listingSlug: string; directPurchasePricePerSqFt: number;
} };

function recipient(overrides: Partial<Recipient> = {}): Recipient {
  return {
    userId: RECIPIENT, preferredMaterialTypes: ["engineered"],
    priceMinPerSqFt: null, priceMaxPerSqFt: null,
    preferredZip: null, preferredRadiusMiles: null,
    buyerMatchInAppEnabled: true, buyerMatchEmailEnabled: true,
    buyerEmail: "synthetic@example.invalid", buyerName: "Synthetic Business",
    buyerRole: "seller", buyerVerificationStatus: "verified", buyerBusinessState: "CO",
    legacyPreferenceRole: "seller", profileComplete: false,
    ...overrides,
  };
}
function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: LISTING_ID, slug: "synthetic-oak-lot", sellerId: OWNER,
    seller: { id: OWNER, name: "Synthetic Supplier" },
    title: "Synthetic engineered oak", materialType: "engineered", totalSqFt: 900,
    askPricePerSqFt: 8, buyNowPrice: 3, status: "active",
    lastConfirmedAt: new Date("2026-09-30T12:00:00Z"),
    confirmationDueAt: new Date("2026-10-14T12:00:00Z"),
    territoryMode: "unrestricted", allowedDestinationStates: [],
    locationLat: null, locationLng: null, locationCity: "Denver", locationState: "CO",
    locationZip: "80202", condition: "new_overstock",
    ...overrides,
  };
}

function fixture(rows: Recipient[] = [recipient()]) {
  const preferenceQueries: Query[] = [];
  const saved = new Map<string, Notification>();
  const locks: Query[] = [];
  const trace: string[] = [];
  const failures = { notification: 0 };
  // Rows represent the material-matched DB result. Generated predicate assertions below
  // independently verify the SQL boundary; this double does not execute PostgreSQL.
  mocks.select.mockImplementation(() => ({
    from(table: unknown) {
      expect(table).toBe(userPreferences);
      return {
        innerJoin(joinedTable: unknown, _predicate: SQL) {
          void _predicate;
          expect(joinedTable).toBe(users);
          return { where: async (condition: SQL) => {
            preferenceQueries.push(dialect.sqlToQuery(condition));
            return rows;
          } };
        },
      };
    },
  }));
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    trace.push("begin");
    let lockKey: unknown;
    const tx = {
      execute: async (statement: SQL) => {
        const query = dialect.sqlToQuery(statement);
        locks.push(query); lockKey = query.params[0]; trace.push("lock");
      },
      select: () => ({ from: (table: unknown) => {
        expect(table).toBe(notifications);
        return { where: (condition: SQL) => ({ limit: async (count: number) => {
          const query = dialect.sqlToQuery(condition);
          expect(count).toBe(1);
          expect(query.params).toEqual([rows[0]!.userId, "listing_match", LISTING_ID]);
          expect(lockKey).toBe(`preference-match:${rows[0]!.userId}:${LISTING_ID}`);
          trace.push("read");
          const key = `${String(query.params[0])}:${LISTING_ID}`;
          return saved.has(key) ? [{ id: "existing-synthetic-notification" }] : [];
        } }) };
      } }),
      insert: (table: unknown) => {
        expect(table).toBe(notifications);
        return { values: async (value: Notification) => {
          if (failures.notification > 0) { failures.notification--; throw new Error("Synthetic notification failure"); }
          expect(value.userId).toBe(rows[0]!.userId);
          expect(value.type).toBe("listing_match");
          expect(value.data.listingId).toBe(LISTING_ID);
          saved.set(`${value.userId}:${value.data.listingId}`, structuredClone(value));
          trace.push("insert");
        } };
      },
    };
    try {
      const result = await callback(tx);
      trace.push("commit");
      return result;
    } catch (error) { trace.push("rollback"); throw error; }
  });
  return { preferenceQueries, saved, locks, trace, failures };
}
function run() {
  const step = { run: vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback()) };
  return mocks.handler!({ event: { data: { listingId: LISTING_ID } }, step });
}
function lastEmail(): SendEmailOrThrowInput {
  return mocks.send.mock.calls.at(-1)![0] as SendEmailOrThrowInput;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  mocks.listing.mockReset().mockResolvedValue(listing());
  mocks.send.mockReset().mockResolvedValue({ id: "synthetic-provider-result", status: "accepted" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("preference match alerts use buying fields independently of legacy role", () => {
  it.each(["buyer", "seller"] as const)("includes a seller with legacy %s metadata without a completion gate", async (legacyPreferenceRole) => {
    const f = fixture([recipient({ legacyPreferenceRole, profileComplete: false })]);
    await run();
    expect(mocks.trigger).toEqual({ event: "listing/created" });
    expect(mocks.options).toMatchObject({ id: "preference-match-alerts" });
    expect(f.preferenceQueries).toHaveLength(3);
    expect(f.preferenceQueries[0]!.sql).not.toMatch(/"user_preferences"\."role"/);
    expect(f.preferenceQueries[0]!.sql).not.toContain("profile_complete");
    expect(f.saved.size).toBe(1);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(lastEmail().message.to).toBe("synthetic@example.invalid");
  });

  it("preserves material membership and non-null query predicates for existing buyers", async () => {
    const f = fixture([recipient({ buyerRole: "buyer", legacyPreferenceRole: "buyer" })]);
    await run();
    const query = f.preferenceQueries[0]!;
    expect(query.sql).toMatch(/"preferred_material_types"\s+IS NOT NULL/i);
    expect(query.sql).toMatch(/"preferred_material_types"\s+\?\s+\$\d+/);
    expect(query.params).toContain("engineered");
    expect(f.saved.size).toBe(1);
  });

  it("links email preference management explicitly to Buying", async () => {
    fixture(); await run();
    expect(lastEmail().message.html).toContain('href="https://plankmarket.example/preferences?workspace=buyer"');
    expect(lastEmail().message.html).toContain('href="https://plankmarket.example/listings/synthetic-oak-lot"');
  });

  it("does not notify or email the owner about their own listing", async () => {
    const f = fixture([recipient({ userId: OWNER })]);
    await run();
    expect(f.saved.size).toBe(0);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    { min: 3, max: 3, expected: 1 },
    { min: 4, max: null, expected: 0 },
    { min: null, max: 2, expected: 0 },
    { min: null, max: 0, expected: 0 },
  ])("preserves inclusive direct-purchase price bounds: %j", async ({ min, max, expected }) => {
    const f = fixture([recipient({ priceMinPerSqFt: min, priceMaxPerSqFt: max })]);
    await run();
    expect(f.saved.size).toBe(expected);
    expect(mocks.send).toHaveBeenCalledTimes(expected);
    if (expected) {
      expect([...f.saved.values()][0]!.data.directPurchasePricePerSqFt).toBe(3);
      expect(lastEmail().message.html).toContain("$3.00/sq ft direct purchase");
    }
  });

  it.each([
    { state: "CO", verification: "verified", expected: 1 },
    { state: "UT", verification: "verified", expected: 0 },
    { state: "CO", verification: "unverified", expected: 0 },
    { state: null, verification: "verified", expected: 0 },
  ] as const)("retains restricted-territory eligibility for a seller purchasing: %j", async ({ state, verification, expected }) => {
    mocks.listing.mockResolvedValue(listing({ territoryMode: "allowed_states", allowedDestinationStates: ["CO"] }));
    const f = fixture([recipient({ buyerBusinessState: state, buyerVerificationStatus: verification })]);
    await run();
    expect(f.saved.size).toBe(expected);
    expect(mocks.send).toHaveBeenCalledTimes(expected);
  });

  it.each([
    { name: "missing", value: null },
    { name: "inactive", value: listing({ status: "draft" }) },
    { name: "overdue", value: listing({ confirmationDueAt: new Date("2026-09-30T00:00:00Z") }) },
  ])("skips a $name listing before matching or fan-out", async ({ value }) => {
    mocks.listing.mockResolvedValue(value); fixture();
    expect(await run()).toMatchObject({ skipped: true });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("replays one recipient/listing notification under the same transaction lock and email key", async () => {
    const f = fixture();
    await run(); await run();
    expect(f.saved.size).toBe(1);
    expect(f.trace).toEqual(["begin", "lock", "read", "insert", "commit", "begin", "lock", "read", "commit"]);
    for (const query of f.locks) {
      expect(query.sql).toContain("pg_advisory_xact_lock(hashtextextended(");
      expect(query.params).toEqual([`preference-match:${RECIPIENT}:${LISTING_ID}`]);
    }
    expect(mocks.send).toHaveBeenCalledTimes(2);
    const keys = mocks.send.mock.calls.map(([input]) => (input as SendEmailOrThrowInput).idempotencyKey);
    expect(keys).toEqual(Array(2).fill(buildEmailIdempotencyKey("preference_match_alert", LISTING_ID, RECIPIENT)));
    expect(lastEmail().category).toBe("preference_match_alert");
  });

  it.each(["notification", "email"] as const)("surfaces a %s failure and retries with the same identities", async (failure) => {
    const f = fixture();
    if (failure === "notification") f.failures.notification = 1;
    else mocks.send.mockRejectedValueOnce(new Error("Synthetic email failure"));
    await expect(run()).rejects.toBeInstanceOf(AggregateError);
    expect(f.saved.size).toBe(failure === "email" ? 1 : 0);
    await run();
    expect(f.saved.size).toBe(1);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(new Set(mocks.send.mock.calls.map(([input]) => (input as SendEmailOrThrowInput).idempotencyKey)).size).toBe(1);
  });
});
