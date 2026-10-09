"use client";

import type { StripeConnectInstance } from "@stripe/connect-js";

// A Connect instance may outlive the page that created it. Stripe requires
// logout on actual app logout, not on navigation or React effect cleanup.
let authIdentity: string | null = null;
let profileOwner: string | null = null;
let generation = 0;
let cleanup: Promise<void> = Promise.resolve();
const instances = new Set<StripeConnectInstance>();
const logoutRequested = new WeakSet<StripeConnectInstance>();
const listeners = new Set<() => void>();

function enqueueLogout(retired: StripeConnectInstance[]) {
  const pending = retired.filter((instance) => !logoutRequested.has(instance));
  if (!pending.length) return;
  const attempts = pending.map((instance) => {
    logoutRequested.add(instance);
    const attempt = Promise.resolve().then(() => instance.logout());
    void attempt.catch(() => {
      // Do not log provider exceptions or client secrets. A rejected request is
      // not confirmed revocation, and must not block local application logout.
      console.error("Stripe account session cleanup failed.");
    });
    return attempt;
  });
  cleanup = Promise.all([cleanup, ...attempts]).then(() => undefined);
  // Keep failed cleanup observable to the next payment initialization without
  // leaving a detached unhandled rejection after the user has signed out.
  void cleanup.catch(() => undefined);
}

function invalidateLifetime() {
  generation += 1;
  const retired = [...instances];
  instances.clear();
  enqueueLogout(retired);
  for (const listener of listeners) listener();
}

/** Only the application auth boundary supplies these identities. A temporary
 * profile read failure or payment-page unmount must not call this with null. */
export function observeConnectAuthIdentity(identity: string | null) {
  if (authIdentity === identity) return;
  authIdentity = identity;
  profileOwner = null;
  invalidateLifetime();
}

/** Call only after the server profile has passed the existing identity check. */
export function observeConnectProfileOwner(owner: string) {
  if (!authIdentity || profileOwner === owner) return;
  profileOwner = owner;
  invalidateLifetime();
}

export function subscribeConnectLifetime(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const getConnectLifetimeGeneration = () => generation;
export const getServerConnectLifetimeGeneration = () => 0;
export const hasConnectProfileOwner = (owner: string) =>
  authIdentity !== null && profileOwner === owner;

export type ConnectLifetime = {
  isCurrent: () => boolean;
  ready: () => Promise<void>;
  register: (instance: StripeConnectInstance) => boolean;
};

export function captureConnectLifetime(owner: string): ConnectLifetime {
  const capturedGeneration = generation;
  const capturedIdentity = authIdentity;
  const isCurrent = () =>
    capturedIdentity !== null &&
    authIdentity === capturedIdentity &&
    generation === capturedGeneration &&
    profileOwner === owner;
  return {
    isCurrent,
    async ready() {
      // A delayed old-instance logout also invalidates its Stripe user session.
      // Finish that cleanup before starting tools for a replacement account.
      await cleanup;
      if (!isCurrent()) throw new Error("Payment account changed");
    },
    register(instance) {
      if (logoutRequested.has(instance)) return false;
      if (!isCurrent()) {
        enqueueLogout([instance]);
        return false;
      }
      instances.add(instance);
      return true;
    },
  };
}
