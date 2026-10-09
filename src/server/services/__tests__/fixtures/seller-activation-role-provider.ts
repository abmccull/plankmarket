// Candidate target: src/server/services/__tests__/fixtures/seller-activation-role-provider.ts
// In-memory external identity boundary only. SQL and service remain real.
import assert from "node:assert/strict";

type Patch = { role: "buyer" | "seller" | "admin"; plankmarket_seller_activation: string | null; plankmarket_role_write: string };
type Call = { kind: "read"; authId: string } | { kind: "patch"; authId: string; patch: Patch };
type Identity = { id: string; appMetadata: Record<string, unknown> };
type Hook = (call: Call) => Promise<void>;
const clone = <T>(value: T): T => structuredClone(value);

export function createRoleProvider(authId: string) {
  let metadata: Record<string, unknown> = { role: "buyer", fixtureUnrelated: { keep: "unchanged" }, unrelatedFlatFlag: true };
  let pendingPatch: Patch | null = null;
  const adapter = {
    calls: [] as Call[],
    appliedPatches: 0,
    returnedId: authId,
    beforeRead: undefined as Hook | undefined,
    beforePatch: undefined as Hook | undefined,
    afterPatch: undefined as Hook | undefined,
    current(): Identity { return clone({ id: authId, appMetadata: metadata }); },
    setMetadata(value: Record<string, unknown>) { metadata = clone(value); },
    // Called only by beforePatch after this exact request has been issued. A
    // local timeout may return while this saved remote request remains in flight.
    deferRemotePatch(patch: Patch) {
      assert.equal(pendingPatch, null, "Only one unresolved remote request may be held");
      const issued = adapter.calls.at(-1);
      assert(issued?.kind === "patch", "Cannot defer a request that was not issued");
      assert.deepEqual(issued.patch, patch);
      pendingPatch = clone(patch);
    },
    pendingRemotePatch() { return pendingPatch ? clone(pendingPatch) : null; },
    settlePendingPatch() {
      assert(pendingPatch, "No issued remote request is awaiting application");
      metadata = { ...metadata, ...clone(pendingPatch) };
      adapter.appliedPatches += 1;
      pendingPatch = null;
    },
    async readUser(requestedId: string): Promise<Identity> {
      assert.equal(requestedId, authId, "Service attempted another external identity");
      const call: Call = { kind: "read", authId: requestedId };
      adapter.calls.push(call);
      await adapter.beforeRead?.(call);
      return clone({ id: adapter.returnedId, appMetadata: metadata });
    },
    async patchRole(requestedId: string, patch: Patch): Promise<void> {
      assert.equal(requestedId, authId, "Service attempted another external identity");
      assert.deepEqual(Object.keys(patch).sort(), ["plankmarket_role_write", "plankmarket_seller_activation", "role"], "Only the agreed three flat authority fields may leave the service");
      assert.match(patch.plankmarket_role_write, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, "Every write requires an exact UUID receipt marker");
      const call: Call = { kind: "patch", authId: requestedId, patch: clone(patch) };
      adapter.calls.push(call);
      await adapter.beforePatch?.(call);
      metadata = { ...metadata, ...clone(patch) };
      adapter.appliedPatches += 1;
      await adapter.afterPatch?.(call);
    },
  };
  return adapter;
}

export function barrier() {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  return { entered, released, enter, release };
}

export async function within<T>(promise: Promise<T>, milliseconds = 4000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Bounded activation interleaving did not reach its expected barrier")), milliseconds); })]);
  } finally { if (timer) clearTimeout(timer); }
}
