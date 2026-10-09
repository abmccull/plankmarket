import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { createTRPCContext } from "@/server/trpc";
import type { Notification } from "@/server/db/schema/notifications";
import { MFA_REQUIRED_MESSAGE } from "@/lib/auth/auth-assurance";

process.env.SKIP_ENV_VALIDATION = "1";
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}), redis: {} }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
  static slidingWindow() { return {}; }
  async limit() { return { success: true }; }
} }));
vi.mock("@/server/services/content-moderation", () => ({ checkViolationStatus: vi.fn() }));
const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { notificationRouter } = await import("@/server/routers/notification");
const createCaller = createCallerFactory(createTRPCRouter({ notification: notificationRouter }));
const dialect = new PgDialect();
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";
const TARGET = "44444444-4444-4444-8444-444444444444";
const DECOY = "55555555-5555-4555-8555-555555555555";
const NOTICE = "66666666-6666-4666-8666-666666666666";
const FOREIGN_NOTICE = "77777777-7777-4777-8777-777777777777";
const MISSING = "88888888-8888-4888-8888-888888888888";
type Row = Record<string, unknown>;
type Kind = "order" | "sample" | "offer" | "conversation";
type Role = "buyer" | "seller" | "admin";
const tableByKind = { order: "orders", sample: "sample_requests", offer: "offers", conversation: "conversations" } as const;
function dataFor(kind: Kind, id: unknown = TARGET): Record<string, unknown> {
  return kind === "order" ? { orderId: id } : kind === "sample" ? { type: "sample_request_updated", sampleRequestId: id } : kind === "offer" ? { offerId: id } : { conversationId: id };
}

// Evaluate the actual Drizzle predicate, never an assumed owner filter.
// This intentionally accepts only the small equality/AND/OR SQL subset used here.
function predicate(where: SQL, row: Row) {
  const query = dialect.sqlToQuery(where);
  const tokens = query.sql.match(/"[^"]+"\."[^"]+"|\$\d+|\(|\)|=|\band\b|\bor\b/gi) ?? [];
  expect(tokens.join("")).toBe(query.sql.replace(/\s+/g, ""));
  let pos = 0;
  function atom(): boolean {
    if (tokens[pos] === "(") { pos++; const answer = or(); expect(tokens[pos++]).toBe(")"); return answer; }
    const field = tokens[pos++].match(/^"[^"]+"\."([^"]+)"$/)?.[1]; expect(field).toBeTruthy();
    expect(tokens[pos++]).toBe("="); const param = tokens[pos++]; expect(param).toMatch(/^\$\d+$/);
    return row[field!.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] === query.params[Number(param.slice(1)) - 1];
  }
  function and(): boolean { let answer = atom(); while (tokens[pos]?.toLowerCase() === "and") { pos++; const right = atom(); answer = answer && right; } return answer; }
  function or(): boolean { let answer = and(); while (tokens[pos]?.toLowerCase() === "or") { pos++; const right = and(); answer = answer || right; } return answer; }
  const answer = or(); expect(pos).toBe(tokens.length); return answer;
}

function fixture(options: { kind?: Kind; side?: "buyer" | "seller" | "neither"; role?: Role; type?: Notification["type"]; data?: Record<string, unknown>; missingTarget?: boolean; aal?: "aal1" | "aal2"; assuranceError?: boolean; active?: boolean; authenticated?: boolean; lookupError?: boolean } = {}) {
  const kind = options.kind ?? "order", side = options.side ?? "buyer";
  const notification: Notification = { id: NOTICE, userId: OWNER, type: options.type ?? "system", title: "Synthetic notice", message: "Synthetic", data: options.data ?? dataFor(kind), read: false, createdAt: new Date("2026-10-01T00:00:00Z") };
  const transaction = { id: TARGET, buyerId: side === "buyer" ? OWNER : OTHER, sellerId: side === "seller" ? OWNER : STRANGER };
  const rows: Record<string, Row[]> = {
    notifications: [notification, { ...notification, id: FOREIGN_NOTICE, userId: OTHER }, { ...notification, id: DECOY }],
    orders: [], sample_requests: [], offers: [], conversations: [],
  };
  rows[tableByKind[kind]] = [...(options.missingTarget ? [] : [transaction]), { id: DECOY, buyerId: OWNER, sellerId: OTHER }];
  const lookups: Array<{ table: string; where: SQL }> = [];
  const mutation = vi.fn(() => { throw new Error("Notification destination is read-only"); });
  function selectRows(table: string, where: SQL) {
    expect(where).toBeDefined(); lookups.push({ table, where });
    if (options.lookupError) throw new Error("Synthetic lookup outage");
    if (table === "notifications") {
      // A missing id or ownership predicate fails even if fixture filtering would hide it.
      const { params } = dialect.sqlToQuery(where); const requested = params.find(value => [NOTICE, FOREIGN_NOTICE, MISSING].includes(String(value)));
      expect(requested).toBeDefined();
      expect(predicate(where, { id: requested, userId: OWNER })).toBe(true);
      expect(predicate(where, { id: DECOY, userId: OWNER })).toBe(false);
      expect(predicate(where, { id: requested, userId: OTHER })).toBe(false);
    }
    return rows[table].filter(row => predicate(where, row));
  }
  const query = Object.fromEntries(Object.entries({ notifications: "notifications", orders: "orders", sampleRequests: "sample_requests", offers: "offers", conversations: "conversations" }).map(([key, table]) => [key, { findFirst: vi.fn(async ({ where }: { where: SQL }) => selectRows(table, where)[0]) }]));
  const db = { query, select: vi.fn(() => ({ from: (table: Parameters<typeof getTableName>[0]) => ({ where: (where: SQL) => { const selected = selectRows(getTableName(table), where); return Object.assign(Promise.resolve(selected), { limit: async (n: number) => selected.slice(0, n) }); } }) })), insert: mutation, update: mutation, delete: mutation, transaction: mutation };
  const assurance = vi.fn(async () => { if (options.assuranceError) throw new Error("Assurance unavailable"); return { currentLevel: options.aal ?? "aal1", nextLevel: "aal2", lastFactorVerificationAt: null, recentVerificationSatisfied: false }; });
  const caller = createCaller({ db, authUser: options.authenticated === false ? null : { id: "synthetic-auth" }, user: options.authenticated === false ? null : { id: OWNER, role: options.role ?? "seller", active: options.active ?? true, verificationStatus: "verified" }, getAuthAssurance: assurance, supabase: {}, clientIp: "127.0.0.1" } as unknown as Awaited<ReturnType<typeof createTRPCContext>>);
  // Stable preimplementation boundary: absence fails at runtime, not test compilation.
  const destination = caller.notification as unknown as { getDestination(input: { id: string }): Promise<{ ownerId: string; href: string }> };
  return { notification, lookups, mutation, assurance, invoke: async (id = NOTICE) => destination.getDestination({ id }) };
}
beforeEach(() => { vi.clearAllMocks(); });

describe("owned notification destination resolves the persisted transaction participant", () => {
  it.each(["order", "sample", "offer", "conversation"] as const)("routes a seller's %s purchase at AAL1 without trusting seller hints", async kind => {
    const f = fixture({ kind, data: { ...dataFor(kind), recipientSide: "seller", workspace: "seller", href: "/admin/orders" } });
    const href = kind === "order" ? `/buyer/orders/${TARGET}` : kind === "sample" ? "/buyer/samples" : kind === "offer" ? `/offers/${TARGET}?workspace=buyer` : `/messages/${TARGET}?workspace=buyer`;
    await expect(f.invoke()).resolves.toEqual({ ownerId: OWNER, href });
    expect(f.lookups.map(row => row.table)).toEqual(["notifications", tableByKind[kind]]);
    expect(f.assurance).not.toHaveBeenCalled(); expect(f.mutation).not.toHaveBeenCalled(); expect(f.notification.read).toBe(false);
  });
  it.each(["order", "sample", "offer", "conversation"] as const)("routes persisted %s seller side even when the account role says buyer", async kind => {
    const f = fixture({ kind, side: "seller", role: "buyer", data: { ...dataFor(kind), recipientSide: "buyer" } });
    const href = kind === "order" ? `/seller/orders/${TARGET}` : kind === "sample" ? "/seller/samples" : kind === "offer" ? `/offers/${TARGET}?workspace=seller` : `/messages/${TARGET}?workspace=seller`;
    await expect(f.invoke()).resolves.toEqual({ ownerId: OWNER, href }); expect(f.mutation).not.toHaveBeenCalled();
  });
  it.each(["order", "sample", "offer", "conversation"] as const)("denies a nonparticipant's %s despite a forged recipientSide", async kind => {
    const f = fixture({ kind, side: "neither", data: { ...dataFor(kind), recipientSide: "buyer" } });
    await expect(f.invoke()).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(f.lookups).toHaveLength(2); expect(f.mutation).not.toHaveBeenCalled();
  });
  it.each(["order", "sample", "offer", "conversation"] as const)("denies a deleted %s rather than choosing an unrelated owned transaction", async kind => {
    const f = fixture({ kind, missingTarget: true }); await expect(f.invoke()).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(f.lookups).toHaveLength(2);
  });
  it.each(["order", "sample", "offer", "conversation"] as const)("rejects malformed %s target IDs before transaction SQL", async kind => {
    for (const id of [null, "bad-id", "../orders", {}, 123]) {
      const f = fixture({ kind, data: dataFor(kind, id) }); await expect(f.invoke()).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(f.lookups.map(row => row.table)).toEqual(["notifications"]);
    }
  });
  it("scopes notification ownership before any target lookup", async () => {
    for (const id of [FOREIGN_NOTICE, MISSING]) {
      const f = fixture(); await expect(f.invoke(id)).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(f.lookups.map(row => row.table)).toEqual(["notifications"]); expect(f.mutation).not.toHaveBeenCalled();
    }
  });
  it("rejects a legacy sample notification whose target ID is missing", async () => {
    const f = fixture({ kind: "sample", data: { type: "sample_request_created" } }); await expect(f.invoke()).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(f.lookups.map(row => row.table)).toEqual(["notifications"]);
  });
  it.each(["new_offer", "system"] as const)("resolves persisted offer participants for %s notifications", async type => {
    const f = fixture({ kind: "offer", type }); await expect(f.invoke()).resolves.toEqual({ ownerId: OWNER, href: `/offers/${TARGET}?workspace=buyer` }); expect(f.lookups.map(row => row.table)).toEqual(["notifications", "offers"]);
  });
  it("returns the same generic unavailable error for absent, foreign, deleted and nonparticipant targets", async () => {
    const scenarios = [{ f: fixture(), id: MISSING }, { f: fixture(), id: FOREIGN_NOTICE }, { f: fixture({ missingTarget: true }), id: NOTICE }, { f: fixture({ side: "neither" }), id: NOTICE }, { f: fixture({ data: { orderId: "bad-id" } }), id: NOTICE }];
    const messages: string[] = [];
    for (const { f, id } of scenarios) { try { await f.invoke(id); expect.fail("Expected NOT_FOUND"); } catch (error) { expect(error).toMatchObject({ code: "NOT_FOUND" }); messages.push((error as Error).message); } }
    expect(new Set(messages).size).toBe(1); for (const id of [OWNER, OTHER, TARGET, NOTICE, MISSING]) expect(messages[0]).not.toContain(id);
  });
  it.each([
    ["sample", { type: "sample_request_updated", sampleRequestId: TARGET, orderId: DECOY, offerId: DECOY, conversationId: DECOY }, "/buyer/samples"],
    ["order", { orderId: TARGET, offerId: DECOY, conversationId: DECOY }, `/buyer/orders/${TARGET}`],
    ["offer", { offerId: TARGET, conversationId: DECOY }, `/offers/${TARGET}?workspace=buyer`],
  ] as const)("uses %s before lower-priority payload references", async (kind, data, href) => {
    const f = fixture({ kind, data }); await expect(f.invoke()).resolves.toEqual({ ownerId: OWNER, href }); expect(f.lookups.map(row => row.table)).toEqual(["notifications", tableByKind[kind]]);
  });
  it("fails closed for a malformed higher-priority reference rather than falling through", async () => {
    const f = fixture({ data: { orderId: "bad-id", offerId: DECOY } }); await expect(f.invoke()).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(f.lookups.map(row => row.table)).toEqual(["notifications"]);
  });
});

describe("destination authentication, assurance and failure behavior", () => {
  it.each([{ authenticated: false, code: "UNAUTHORIZED" }, { active: false, code: "FORBIDDEN" }])("blocks before database reads: %j", async ({ code, ...options }) => {
    const f = fixture(options); await expect(f.invoke()).rejects.toMatchObject({ code }); expect(f.lookups).toEqual([]);
  });
  it("rejects an invalid notification input UUID before database reads", async () => {
    const f = fixture(); await expect(f.invoke("bad-id")).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(f.lookups).toEqual([]);
  });
  it("requires admin AAL2 before any order target read", async () => {
    const f = fixture({ role: "admin", side: "neither" }); await expect(f.invoke()).rejects.toMatchObject({ code: "FORBIDDEN", message: MFA_REQUIRED_MESSAGE }); expect(f.assurance).toHaveBeenCalledOnce(); expect(f.lookups).toEqual([]);
  });
  it("fails closed when admin assurance is unavailable", async () => {
    const f = fixture({ role: "admin", side: "neither", assuranceError: true }); await expect(f.invoke()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" }); expect(f.lookups).toEqual([]);
  });
  it("routes an owned admin order alert through the existing admin order page at AAL2", async () => {
    const f = fixture({ role: "admin", side: "neither", aal: "aal2" }); await expect(f.invoke()).resolves.toEqual({ ownerId: OWNER, href: "/admin/orders" }); expect(f.assurance).toHaveBeenCalledOnce(); expect(f.mutation).not.toHaveBeenCalled();
  });
  it("does not let an AAL2 admin resolve somebody else's notification", async () => {
    const f = fixture({ role: "admin", aal: "aal2" }); await expect(f.invoke(FOREIGN_NOTICE)).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(f.lookups.map(row => row.table)).toEqual(["notifications"]);
  });
  it("does not turn database failure into a successful fallback destination", async () => {
    const f = fixture({ lookupError: true }); await expect(f.invoke()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" }); expect(f.mutation).not.toHaveBeenCalled();
  });
});
