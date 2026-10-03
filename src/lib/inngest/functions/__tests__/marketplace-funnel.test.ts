import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ handlers: {} as Record<string, (args: { event: { data: Record<string, string> }; step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => Promise<unknown>>, listing: vi.fn(), order: vi.fn(), preference: vi.fn(), audit: vi.fn(), user: vi.fn(), capture: vi.fn(), flush: vi.fn(), provider: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/inngest/client", () => ({ inngest: { createFunction: (options: { id: string }, trigger: unknown, handler: typeof mocks.handlers[string]) => { mocks.handlers[options.id] = handler; return { id: options.id, trigger }; } } }));
vi.mock("@/server/db", () => ({ db: { query: { listings: { findFirst: mocks.listing }, orders: { findFirst: mocks.order }, userPreferences: { findFirst: mocks.preference }, auditEvents: { findFirst: mocks.audit }, users: { findFirst: mocks.user } } } }));
vi.mock("@/lib/analytics/posthog-server", () => ({ getPostHogServer: mocks.provider }));
await import("../marketplace-funnel");
const time = new Date("2026-10-03T12:00:00Z");
const run = (id: string, data: Record<string,string>) => mocks.handlers[id]({ event: { data }, step: { run: async (_name, fn) => fn() } });
describe("durable marketplace funnel observers", () => {
  beforeEach(() => {
    for (const fn of [mocks.listing,mocks.order,mocks.preference,mocks.audit,mocks.user,mocks.capture,mocks.flush,mocks.provider]) fn.mockReset();
    mocks.provider.mockReturnValue({ captureAcknowledged: mocks.capture });
    mocks.flush.mockResolvedValue(undefined);
    mocks.preference.mockResolvedValue({ userId: "actor", analyticsTrackingEnabled: true });
    mocks.user.mockResolvedValue({ id: "actor", active: true });
    mocks.audit.mockResolvedValue({ entityId: "lot", actorId: "actor", action: "listing.published", createdAt: time });
    mocks.listing.mockResolvedValue({ id: "lot", sellerId: "actor", status: "active", publishedAt: time, createdAt: new Date(time.getTime()-60000), materialType: "engineered", condition: "closeout", askPricePerSqFt: 2, totalSqFt: 960 });
    mocks.order.mockResolvedValue({ id: "order", buyerId: "actor", listingId: "lot", sellerId: "seller", stripePaymentIntentId: "pi_synthetic", paymentStatus: "succeeded", confirmedAt: time, totalPrice: 2400, quantitySqFt: 960 });
  });
  it.each([true,false,null])("publication obeys current consent %s", async consent => {
    mocks.preference.mockResolvedValue({ userId: "actor", analyticsTrackingEnabled: consent });
    await run("analytics-listing-published",{ listingId: "lot", sellerId: "actor" });
    expect(mocks.capture).toHaveBeenCalledTimes(consent === true ? 1 : 0);
  });
  it("requires durable publication evidence", async () => {
    mocks.audit.mockResolvedValue(undefined);
    await run("analytics-listing-published",{ listingId: "lot", sellerId: "actor" });
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it("uses stable payment UUID, time and actor for retries without private properties", async () => {
    await run("analytics-payment-completed", { orderId: "order" });
    await run("analytics-payment-completed", { orderId: "order" });
    const first=mocks.capture.mock.calls[0][0]; expect(mocks.capture.mock.calls[1][0]).toEqual(first);
    expect(first).toMatchObject({ distinctId: "actor", event: "payment_completed", timestamp: time });
    expect(first.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(JSON.stringify(first.properties)).not.toContain("pi_synthetic");
    expect(mocks.flush).not.toHaveBeenCalled();
  });
  it.each(["pending","failed","reconciliation_required"])("does not count %s payment", async paymentStatus => {
    const order=await mocks.order(); mocks.order.mockResolvedValue({ ...order,paymentStatus });
    await run("analytics-payment-completed", { orderId: "order" }); expect(mocks.capture).not.toHaveBeenCalled();
  });
  it("does not count late refunded payment with no confirmed order", async () => {
    const order=await mocks.order(); mocks.order.mockResolvedValue({ ...order,paymentStatus:"refunded",confirmedAt:null });
    await run("analytics-payment-completed", { orderId: "order" }); expect(mocks.capture).not.toHaveBeenCalled();
  });
  it("lets the isolated observer retry transport failure", async () => {
    mocks.capture.mockRejectedValue(new Error("Synthetic telemetry failure"));
    await expect(run("analytics-payment-completed",{orderId:"order"})).rejects.toThrow("Synthetic telemetry failure");
  });
});
