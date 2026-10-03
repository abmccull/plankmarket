"use client";

import Link from "next/link";
import Script from "next/script";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ConnectComponentsProvider } from "@stripe/react-connect-js";
import { loadConnectAndInitialize } from "@stripe/connect-js/pure";
import type { StripeConnectInstance } from "@stripe/connect-js";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import {
  captureConnectLifetime,
  getConnectLifetimeGeneration,
  getServerConnectLifetimeGeneration,
  hasConnectProfileOwner,
  subscribeConnectLifetime,
  type ConnectLifetime,
} from "@/lib/stripe/connect-session-lifetime";

type LoadCallbacks = { onLoadError: () => void; onLoaderStart: () => void };
const LOAD_TIMEOUT_MS = 20_000;
const SCRIPT_URL = "https://connect-js.stripe.com/v1.0/connect.js";

export function StripeConnectProvider({
  children,
}: {
  children: (callbacks: LoadCallbacks) => React.ReactNode;
}) {
  const owner = useAuthStore((state) => state.user?.id);
  const generation = useSyncExternalStore(
    subscribeConnectLifetime,
    getConnectLifetimeGeneration,
    getServerConnectLifetimeGeneration,
  );
  return owner && hasConnectProfileOwner(owner) ? (
    <AccountTools key={`${owner}:${generation}`} owner={owner}>
      {children}
    </AccountTools>
  ) : (
    <p role="status">Checking account access…</p>
  );
}

function AccountTools({
  owner,
  children,
}: {
  owner: string;
  children: (callbacks: LoadCallbacks) => React.ReactNode;
}) {
  const utils = trpc.useUtils();
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const [instance, setInstance] = useState<StripeConnectInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(false);
  const lifetime = useRef<ConnectLifetime | null>(null);
  const failedRef = useRef(false);
  const started = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useCallback(
    () =>
      active.current &&
      !failedRef.current &&
      (!lifetime.current || lifetime.current.isCurrent()) &&
      useAuthStore.getState().user?.id === owner,
    [owner],
  );
  const fail = useCallback(() => {
    if (
      !active.current ||
      useAuthStore.getState().user?.id !== owner ||
      (lifetime.current && !lifetime.current.isCurrent())
    )
      return;
    failedRef.current = true;
    setFailed(true);
    setInstance(null);
    if (timeout.current) clearTimeout(timeout.current);
  }, [owner]);
  useEffect(() => {
    active.current = true;
    if (key) timeout.current = setTimeout(fail, LOAD_TIMEOUT_MS);
    return () => {
      active.current = false;
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, [fail, key]);

  const initialize = useCallback(async () => {
    if (!key || !current() || started.current) return;
    started.current = true;
    try {
      const accountLifetime = captureConnectLifetime(owner);
      lifetime.current = accountLifetime;
      await accountLifetime.ready();
      if (!current()) return;
      // The script must load before a session is requested. No session request
      // is made by a failed/missing SDK. Late actors cannot mount returned tools.
      const first = await utils.client.payment.createAccountSession.mutate();
      if (!current()) return;
      if (!first.clientSecret) throw new Error("Account session unavailable");
      let initialSecret: string | null = first.clientSecret;
      const nextInstance = loadConnectAndInitialize({
        publishableKey: key,
        fetchClientSecret: async () => {
          if (!current()) throw new Error("Payment account changed");
          if (initialSecret) {
            const value = initialSecret;
            initialSecret = null;
            return value;
          }
          try {
            const result =
              await utils.client.payment.createAccountSession.mutate();
            if (!current() || !result.clientSecret)
              throw new Error("Account session unavailable");
            return result.clientSecret;
          } catch (error) {
            fail();
            throw error;
          }
        },
        appearance: {
          variables: { colorPrimary: "#16a34a", fontFamily: "inherit" },
        },
      });
      // Retain this instance beyond page unmount; actual auth termination owns
      // its logout. A stale registration is invalidated without mounting tools.
      if (accountLifetime.register(nextInstance) && current())
        setInstance(nextInstance);
    } catch {
      fail();
    }
  }, [current, fail, key, owner, utils]);
  useEffect(() => {
    if (scriptReady) void initialize();
  }, [initialize, scriptReady]);
  const loaderStarted = () => {
    if (!current()) return;
    setReady(true);
    if (timeout.current) clearTimeout(timeout.current);
  };
  if (!key || failed)
    return (
      <section role="alert" className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Payment tools unavailable</h2>
        <p className="text-sm text-muted-foreground">
          We couldn’t open Stripe’s account tools. Your marketplace orders are
          still available. Reload to try again, or contact support if this
          continues.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            className="h-auto min-h-11 whitespace-normal py-2"
            onClick={() => window.location.reload()}
          >
            Reload payment tools
          </Button>
          <Button
            className="h-auto min-h-11 whitespace-normal py-2"
            asChild
            variant="outline"
          >
            <Link href="/mfa?next=%2Fseller%2Fpayments">
              Confirm account access
            </Link>
          </Button>
          <Button
            className="h-auto min-h-11 whitespace-normal py-2"
            asChild
            variant="ghost"
          >
            <Link href="mailto:support@plankmarket.com">Contact support</Link>
          </Button>
        </div>
      </section>
    );
  return (
    <>
      <Script
        id="stripe-connect-tools"
        src={SCRIPT_URL}
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={fail}
      />
      {!ready && (
        <p role="status" className="flex items-center gap-2 py-4 text-sm">
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin"
            aria-hidden="true"
          />
          Loading payment tools…
        </p>
      )}
      {instance && (
        <ConnectComponentsProvider connectInstance={instance}>
          {children({ onLoadError: fail, onLoaderStart: loaderStarted })}
        </ConnectComponentsProvider>
      )}
    </>
  );
}
