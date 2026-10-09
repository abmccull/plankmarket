import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { MFA_REQUIRED_MESSAGE } from "@/lib/auth/auth-assurance";
import postgres from "postgres";

process.env.SKIP_ENV_VALIDATION = "1";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  fetchDocument: vi.fn(),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}), redis: {} }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() { return {}; }
    async limit(identifier: string) { return mocks.rateLimit(identifier); }
  },
}));
vi.mock("@/server/services/content-moderation", () => ({ checkViolationStatus: vi.fn() }));
vi.mock("@/server/services/priority1", () => ({ priority1: {} }));
vi.mock("@/server/services/shipment-documents", async () => ({
  ...await vi.importActual<typeof import("@/server/services/shipment-documents")>("@/server/services/shipment-documents"),
  fetchPriority1DocumentUrl: mocks.fetchDocument,
}));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { shippingRouter } = await import("@/server/routers/shipping");
const createCaller = createCallerFactory(createTRPCRouter({ shipping: shippingRouter }));
const ORDER_ID = "55555555-5555-4555-8555-555555555555";
const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const STRANGER_ID = "33333333-3333-4333-8333-333333333333";
const dialect = new PgDialect();

const routes = ["getRecovery", "getTracking", "getDocuments"] as const;
type Route = typeof routes[number];
type Role = "buyer" | "seller" | "admin";
function fixture(options: {
  accountRole?: Role;
  side?: "buyer" | "seller";
  status?: "shipped" | "delivered";
  active?: boolean;
  missingOrder?: boolean;
  missingShipment?: boolean;
} = {}) {
  const side = options.side ?? "buyer";
  const order = {
    id: ORDER_ID,
    buyerId: side === "buyer" ? VIEWER_ID : OTHER_ID,
    sellerId: side === "seller" ? VIEWER_ID : OTHER_ID,
    status: options.status ?? "shipped",
    trackingNumber: "PRO-SYNTHETIC",
    paymentStatus: "succeeded",
    escrowStatus: "held",
    transferFailedAt: null,
  };
  const shipment = {
    orderId: ORDER_ID,
    status: options.status === "delivered" ? "delivered" : "in_transit",
    carrierName: "Synthetic Carrier",
    carrierScac: "SYN",
    proNumber: "PRO-SYNTHETIC",
    bolNumber: "BOL-SYNTHETIC",
    priority1ShipmentId: "provider-private-id",
    bolUrl: "https://example.test/private-bol.pdf",
    labelUrl: "https://example.test/private-label.pdf",
    deliveryReceiptUrl: "https://example.test/private-receipt.pdf",
    trackingEvents: [],
    dispatchedAt: new Date("2026-09-28T12:00:00Z"),
    deliveredAt: options.status === "delivered" ? new Date("2026-09-30T12:00:00Z") : null,
    pickupDate: new Date("2026-09-28T12:00:00Z"),
    isDryRun: false,
    lastError: null,
    dispatchAttemptedAt: null,
    cancellationRequestedAt: null,
  };
  const findOrder = vi.fn<(input: { where: SQL; columns?: Record<string, boolean> }) => Promise<typeof order | undefined>>()
    .mockResolvedValue(options.missingOrder ? undefined : order);
  const findShipment = vi.fn().mockResolvedValue(options.missingShipment ? undefined : shipment);
  const assurance = vi.fn().mockRejectedValue(new Error("Ordinary participants must not need MFA for shipping reads"));
  if (options.accountRole === "admin") assurance.mockResolvedValue({ currentLevel: "aal2", recentVerificationSatisfied: true });
  const context = {
    db: { query: { orders: { findFirst: findOrder }, shipments: { findFirst: findShipment } } },
    authUser: { id: `auth-${VIEWER_ID}` },
    user: { id: VIEWER_ID, role: options.accountRole ?? "seller", active: options.active ?? true, verificationStatus: "verified" },
    clientIp: "127.0.0.1",
    supabase: {},
    getAuthAssurance: assurance,
  } as unknown as Parameters<typeof createCaller>[0];
  const caller = createCaller(context);
  const invoke = (route: Route) => route === "getDocuments"
    ? caller.shipping.getDocuments({ orderId: ORDER_ID, documentType: "BillOfLading" })
    : caller.shipping[route]({ orderId: ORDER_ID });
  return { order, shipment, findOrder, findShipment, assurance, caller, invoke, context };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.fetchDocument.mockResolvedValue({ url: "https://example.test/fetched-document.pdf", error: null, permanent: false });
});

describe("shipping participants and freight privacy", () => {
  it.each(routes)("%s queries the requested order and either persisted participant", async (route) => {
    const f = fixture({ accountRole: "seller", status: "delivered" });
    await f.invoke(route);
    const { sql, params } = dialect.sqlToQuery(f.findOrder.mock.calls[0][0].where);
    expect(sql).toBe('(\"orders\".\"id\" = $1 and (\"orders\".\"buyer_id\" = $2 or \"orders\".\"seller_id\" = $3))');
    expect(params).toEqual([ORDER_ID, VIEWER_ID, VIEWER_ID]);
    expect(f.findOrder.mock.calls[0][0].columns).toMatchObject({ buyerId: true, sellerId: true });
    expect(f.assurance).not.toHaveBeenCalled();
  });

  it.each(["buyer", "seller"] as const)("masks documents for a purchasing %s account before delivery", async (accountRole) => {
    const f = fixture({ accountRole });
    await expect(f.caller.shipping.getTracking({ orderId: ORDER_ID })).resolves.toMatchObject({
      status: "in_transit", proNumber: "PRO-SYNTHETIC", priority1ShipmentId: null,
      bolUrl: null, labelUrl: null, deliveryReceiptUrl: null,
    });
    expect(f.assurance).not.toHaveBeenCalled();
  });

  it.each(["BillOfLading", "DeliveryReceipt", "PalletLabel"] as const)("blocks a purchasing seller's %s before provider lookup", async (documentType) => {
    const f = fixture();
    await expect(f.caller.shipping.getDocuments({ orderId: ORDER_ID, documentType })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
    expect(f.assurance).not.toHaveBeenCalled();
  });

  it.each(["buyer", "seller"] as const)("releases buyer documents at delivery for a %s account", async (accountRole) => {
    const f = fixture({ accountRole, status: "delivered" });
    await expect(f.invoke("getTracking")).resolves.toMatchObject({
      bolUrl: f.shipment.bolUrl, labelUrl: f.shipment.labelUrl,
      deliveryReceiptUrl: f.shipment.deliveryReceiptUrl, priority1ShipmentId: null,
    });
    await expect(f.invoke("getDocuments")).resolves.toEqual({ imageUrl: "https://example.test/fetched-document.pdf" });
    expect(mocks.fetchDocument).toHaveBeenCalledWith("BillOfLading", [{ proNumber: "PRO-SYNTHETIC" }]);
  });

  it.each(["buyer", "seller"] as const)("preserves the transaction seller's documents with account role %s", async (accountRole) => {
    const f = fixture({ accountRole, side: "seller" });
    await expect(f.invoke("getTracking")).resolves.toMatchObject({
      bolUrl: f.shipment.bolUrl, labelUrl: f.shipment.labelUrl,
      deliveryReceiptUrl: f.shipment.deliveryReceiptUrl, priority1ShipmentId: null,
    });
    await expect(f.invoke("getDocuments")).resolves.toEqual({ imageUrl: "https://example.test/fetched-document.pdf" });
    expect(f.assurance).not.toHaveBeenCalled();
  });

  it.each(routes)("%s stops missing/unowned orders before shipment and provider calls", async (route) => {
    const f = fixture({ missingOrder: true });
    await expect(f.invoke(route)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(f.findShipment).not.toHaveBeenCalled();
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
  });

  it.each(routes)("%s defensively rejects a returned row with neither participant", async (route) => {
    const f = fixture();
    f.order.buyerId = OTHER_ID;
    f.order.sellerId = STRANGER_ID;
    await expect(f.invoke(route)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(f.findShipment).not.toHaveBeenCalled();
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
  });

  it.each(routes)("%s rejects suspended accounts before reads", async (route) => {
    const f = fixture({ active: false });
    await expect(f.invoke(route)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.findOrder).not.toHaveBeenCalled();
    expect(f.findShipment).not.toHaveBeenCalled();
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
  });

  it("preserves tracking null and missing-shipment document errors", async () => {
    const f = fixture({ side: "seller", missingShipment: true });
    await expect(f.invoke("getTracking")).resolves.toBeNull();
    await expect(f.invoke("getDocuments")).rejects.toMatchObject({ code: "NOT_FOUND", message: "Shipment not found" });
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
  });

  it("keeps recovery usable on a purchase without exposing admin actions", async () => {
    const f = fixture({ missingShipment: true });
    await expect(f.invoke("getRecovery")).resolves.toMatchObject({ code: "awaiting_booking", action: { label: "Contact support", href: "/contact" } });
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
  });

  it("rejects document retrieval with no provider identifier", async () => {
    const f = fixture({ side: "seller" });
    f.order.trackingNumber = "";
    f.shipment.proNumber = "";
    f.shipment.bolNumber = "";
    await expect(f.invoke("getDocuments")).rejects.toMatchObject({ code: "NOT_FOUND", message: "Shipment does not have a PRO or BOL identifier" });
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
  });

  it("keeps strict document lookup closed during limiter failure", async () => {
    const f = fixture({ side: "seller" });
    mocks.rateLimit.mockRejectedValue(new Error("Synthetic Redis outage"));
    await expect(f.invoke("getDocuments")).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(f.findOrder).not.toHaveBeenCalled();
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
  });
});

// Explicit local integration opt-in; never consumes DATABASE_URL or provider
// credentials. Only connection-local temporary rows are created and removed.
describe.skipIf(process.env.SHIPPING_PARTICIPATION_DB_PROOF !== "1")("shipping SQL on disposable loopback PostgreSQL", () => {
  let connection: ReturnType<typeof postgres>;
  beforeAll(async () => {
    connection = postgres("postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929", { max: 1, connect_timeout: 3 });
    const [identity] = await connection`select current_database() as name, host(inet_server_addr()) as address`;
    expect(identity.name).toBe("plankmarket_bootstrap_design_20260929");
    expect(identity.address).toBe("127.0.0.1");
    await connection`create temporary table orders (id uuid primary key, buyer_id uuid not null, seller_id uuid not null)`;
  });
  afterAll(async () => { if (connection) await connection.end({ timeout: 2 }); });

  for (const route of routes) {
    it.each(["buyer", "seller", "unrelated"] as const)(`${route} executes the %s predicate with other owned rows present`, async (side) => {
      const f = fixture({ accountRole: "seller", side: side === "seller" ? "seller" : "buyer", status: "delivered" });
      if (side === "unrelated") { f.order.buyerId = OTHER_ID; f.order.sellerId = STRANGER_ID; }
      await connection`truncate pg_temp.orders`;
      await connection`insert into pg_temp.orders (id, buyer_id, seller_id) values (${ORDER_ID}, ${f.order.buyerId}, ${f.order.sellerId}), ('66666666-6666-4666-8666-666666666666', ${OTHER_ID}, ${VIEWER_ID})`;
      f.findOrder.mockImplementation(async ({ where }) => {
        const query = dialect.sqlToQuery(where);
        const rows = await connection.unsafe(`select id from pg_temp.orders as orders where ${query.sql}`, query.params as string[]);
        expect(rows.length).toBeLessThanOrEqual(1);
        if (rows.length) expect(rows[0].id).toBe(ORDER_ID);
        return rows.length ? f.order : undefined;
      });
      if (side === "unrelated") {
        await expect(f.invoke(route)).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(f.findShipment).not.toHaveBeenCalled();
        expect(mocks.fetchDocument).not.toHaveBeenCalled();
      } else {
        await expect(f.invoke(route)).resolves.toBeDefined();
      }
    });
  }
});

describe("shared shipping admin assurance", () => {
  for (const route of routes) {
    it.each(["aal1", null])(`${route} denies admin proof at %s before reads`, async (level) => {
      const f = fixture({ accountRole: "admin" });
      f.assurance.mockResolvedValue({ currentLevel: level, recentVerificationSatisfied: false });
      await expect(f.invoke(route)).rejects.toMatchObject({ code: "FORBIDDEN", message: MFA_REQUIRED_MESSAGE });
      expect(f.findOrder).not.toHaveBeenCalled();
      expect(f.findShipment).not.toHaveBeenCalled();
      expect(mocks.fetchDocument).not.toHaveBeenCalled();
    });
    it(`${route} fails closed when admin assurance is unavailable`, async () => {
      const f = fixture({ accountRole: "admin" });
      f.assurance.mockRejectedValue(new Error("Synthetic assurance outage"));
      await expect(f.invoke(route)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
      expect(f.findOrder).not.toHaveBeenCalled();
      expect(mocks.fetchDocument).not.toHaveBeenCalled();
    });
    it(`${route} preserves AAL2 admin access to an unrelated order`, async () => {
      const f = fixture({ accountRole: "admin" });
      f.order.buyerId = OTHER_ID;
      f.order.sellerId = STRANGER_ID;
      await expect(f.invoke(route)).resolves.toBeDefined();
      expect(f.assurance).toHaveBeenCalledTimes(1);
      const compiled = dialect.sqlToQuery(f.findOrder.mock.calls[0][0].where);
      expect(compiled.params).toEqual([ORDER_ID]);
      if (route === "getTracking") {
        await expect(f.invoke(route)).resolves.toMatchObject({ priority1ShipmentId: "provider-private-id", bolUrl: f.shipment.bolUrl });
      }
    });
  }
});
