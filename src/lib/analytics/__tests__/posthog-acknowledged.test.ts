import { describe, expect, it, vi } from "vitest";
import { AcknowledgedPostHog } from "../posthog-acknowledged";
const message = { distinctId: "synthetic-actor", event: "payment_completed", uuid: "11111111-1111-5111-8111-111111111111", timestamp: new Date("2026-10-03T12:00:00Z"), properties: { amount: 2400 } };
describe("installed SDK acknowledged transport", () => {
  it.each([400,503])("propagates HTTP %s with injected local transport", async status => {
    const transport=vi.fn(async () => ({ status, text: async () => "synthetic rejection", json: async () => ({ status: 0 }) }));
    const client=new AcknowledgedPostHog("local-synthetic-key", { host: "http://127.0.0.1:3102", fetch: transport, fetchRetryCount: 0, flushInterval: 0, disableCompression: true });
    try { await expect(client.captureAcknowledged(message)).rejects.toThrow(); expect(transport).toHaveBeenCalled(); }
    finally { await client.shutdown().catch(() => {}); }
  });
  it("propagates network failure without external requests", async () => {
    const transport=vi.fn(async () => { throw new Error("synthetic network failure"); });
    const client=new AcknowledgedPostHog("local-synthetic-key", { host: "http://127.0.0.1:3102", fetch: transport, fetchRetryCount: 0, flushInterval: 0, disableCompression: true });
    try { await expect(client.captureAcknowledged(message)).rejects.toThrow(); }
    finally { await client.shutdown().catch(() => {}); }
  });
  it("awaits successful request and retains retry UUID and timestamp", async () => {
    const transport=vi.fn(async (url: string, options: unknown) => { void url; void options; return { status: 200, text: async () => "ok", json: async () => ({ status: 1 }) }; });
    const client=new AcknowledgedPostHog("local-synthetic-key", { host: "http://127.0.0.1:3102", fetch: transport, fetchRetryCount: 0, flushInterval: 0, disableCompression: true });
    try {
      await client.captureAcknowledged(message); await client.captureAcknowledged(message);
      expect(transport).toHaveBeenCalledTimes(2);
      const body = JSON.stringify(transport.mock.calls.map(call => call[1]));
      expect(body).toContain(message.uuid); expect(body).toContain(message.timestamp.toISOString());
    } finally { await client.shutdown(); }
  });
});
