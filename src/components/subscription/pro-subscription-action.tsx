"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { inferRouterOutputs } from "@trpc/server";
import { TRPCClientError } from "@trpc/client";
import type { AppRouter } from "@/server/routers/_app";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BillingInterval } from "@/lib/pro-pricing";
import { isPro } from "@/lib/pro";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";

type BillingStatus = inferRouterOutputs<AppRouter>["subscription"]["getStatus"];
type StatusPhase = "checking" | "ready" | "error" | "stale" | "signed-out";
type Snapshot = {
  data: BillingStatus | null;
  phase: StatusPhase;
  checkedAt: number | null;
  hadProAccess: boolean | null;
};
const control = "h-auto min-h-11 whitespace-normal px-4 py-2 text-center";
const MAX_STATUS_AGE_MS = 5 * 60 * 1000;

function validStatus(value: BillingStatus) {
  return (
    ["free", "active", "trialing", "past_due", "cancelled"].includes(
      value.proStatus,
    ) &&
    typeof value.hasBillingAccount === "boolean" &&
    Number.isFinite(value.availableCredit) &&
    [value.proStartedAt, value.proExpiresAt].every(
      (date) => date === null || !Number.isNaN(new Date(date).getTime()),
    )
  );
}

/** Owner-scoped, uncached reads cannot populate the shared query cache after a
 * departed request. Both status presentation and session creation use this lease. */
export function useBillingStatus() {
  const utils = trpc.useUtils();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const route = pathname + (search ? "?" + search : "");
  const [snapshot, setSnapshot] = useState<Snapshot>({
    data: null,
    phase: "checking",
    checkedAt: null,
    hadProAccess: null,
  });
  const [lifetime, setLifetime] = useState(0);
  const active = useRef(false);
  const generation = useRef(0);
  const readSequence = useRef(0);

  const capture = useCallback(() => {
    const owner = useAuthStore.getState().user;
    const attempt = generation.current;
    const current = () => {
      const live = useAuthStore.getState().user;
      return (
        active.current &&
        generation.current === attempt &&
        !!owner &&
        live?.id === owner.id &&
        live.email === owner.email &&
        window.location.pathname === pathname &&
        new URLSearchParams(window.location.search).toString() === search
      );
    };
    return { owner, current };
  }, [pathname, search]);

  const refresh = useCallback(async (): Promise<BillingStatus | null> => {
    const lease = capture();
    const sequence = ++readSequence.current;
    if (!lease.owner) {
      if (active.current)
        setSnapshot({
          data: null,
          checkedAt: null,
          hadProAccess: null,
          phase: useAuthStore.getState().isLoading ? "checking" : "signed-out",
        });
      return null;
    }
    if (!lease.current()) return null;
    setSnapshot((previous) => ({ ...previous, phase: "checking" }));
    const current = () => lease.current() && readSequence.current === sequence;
    try {
      const supabase = createClient();
      const before = await supabase.auth.getSession();
      if (!current()) return null;
      if (
        before.error ||
        !before.data.session ||
        before.data.session.user.email?.trim().toLowerCase() !==
          lease.owner.email.trim().toLowerCase()
      )
        throw new Error("Account access could not be confirmed");
      const result = await utils.client.subscription.getStatus.query();
      if (!current()) return null;
      const after = await supabase.auth.getSession();
      if (!current()) return null;
      if (
        after.error ||
        !after.data.session ||
        after.data.session.user.id !== before.data.session.user.id ||
        after.data.session.user.email?.trim().toLowerCase() !==
          lease.owner.email.trim().toLowerCase() ||
        !validStatus(result)
      )
        throw new Error("Subscription status could not be confirmed");
      setSnapshot({
        data: result,
        phase: "ready",
        checkedAt: Date.now(),
        hadProAccess: isPro(result),
      });
      return result;
    } catch {
      if (current())
        setSnapshot((previous) => ({ ...previous, phase: "error" }));
      return null;
    }
  }, [capture, utils]);

  useEffect(() => {
    active.current = true;
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      if (
        state.user?.id !== previous.user?.id ||
        state.user?.email !== previous.user?.email
      ) {
        generation.current += 1;
        readSequence.current += 1;
        setLifetime(generation.current);
        setSnapshot({
          data: null,
          phase: "checking",
          checkedAt: null,
          hadProAccess: null,
        });
        void refresh();
      } else if (!state.user && state.isLoading !== previous.isLoading) {
        setSnapshot({
          data: null,
          checkedAt: null,
          hadProAccess: null,
          phase: state.isLoading ? "checking" : "signed-out",
        });
      }
    });
    void refresh();
    return () => {
      active.current = false;
      generation.current += 1;
      readSequence.current += 1;
      unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    if (
      snapshot.phase !== "ready" ||
      !snapshot.data ||
      snapshot.checkedAt === null
    )
      return;
    let deadline = snapshot.checkedAt + MAX_STATUS_AGE_MS;
    const expiresAt = snapshot.data.proExpiresAt
      ? new Date(snapshot.data.proExpiresAt).getTime()
      : null;
    if (
      snapshot.data.proStatus === "cancelled" &&
      expiresAt &&
      expiresAt > Date.now()
    )
      deadline = Math.min(deadline, expiresAt);
    const timer = setTimeout(
      () =>
        setSnapshot((previous) =>
          previous === snapshot ? { ...previous, phase: "stale" } : previous,
        ),
      Math.max(0, deadline - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [snapshot]);

  return {
    ...snapshot,
    refresh,
    capture,
    route,
    lifetimeKey: route + ":" + lifetime,
  };
}

type BillingController = ReturnType<typeof useBillingStatus>;

export function BillingStatusFeedback({
  billing,
  showRefreshReady = false,
}: {
  billing: BillingController;
  showRefreshReady?: boolean;
}) {
  if (billing.phase === "signed-out")
    return (
      <div className="space-y-3">
        <p>Sign in to check your subscription and billing.</p>
        <Button asChild className={control}>
          <Link href={"/login?redirect=" + encodeURIComponent(billing.route)}>
            Sign in
          </Link>
        </Button>
      </div>
    );
  return (
    <div className="space-y-3">
      {billing.phase === "checking" && (
        <p role="status" className="text-sm">
          Checking subscription status…
        </p>
      )}
      {(billing.phase === "error" || billing.phase === "stale") && (
        <div role="alert" className="space-y-1">
          <h2 className="text-lg font-semibold">
            Subscription status unavailable
          </h2>
          <p className="text-sm text-muted-foreground">
            {billing.data
              ? "The details below are from the last successful check. Refresh before opening billing or starting a purchase."
              : "We couldn’t confirm your plan. Refresh before opening billing or starting a purchase."}
          </p>
        </div>
      )}
      {(showRefreshReady ||
        billing.phase === "error" ||
        billing.phase === "stale") && (
        <Button
          variant="outline"
          className={control}
          disabled={billing.phase === "checking"}
          onClick={() => void billing.refresh()}
        >
          Refresh subscription status
        </Button>
      )}
    </div>
  );
}

function providerDestination(value: unknown, kind: "checkout" | "portal") {
  if (typeof value !== "string" || !value)
    throw new Error("Missing billing destination");
  const url = new URL(value);
  const host =
    kind === "checkout" ? "checkout.stripe.com" : "billing.stripe.com";
  const pathAllowed =
    kind === "checkout"
      ? /^\/(?:c\/)?pay\/[^/]+/.test(url.pathname)
      : /^\/p\/session\/[^/]+/.test(url.pathname);
  if (
    url.protocol !== "https:" ||
    url.hostname !== host ||
    url.port ||
    url.username ||
    url.password ||
    !pathAllowed
  )
    throw new Error("Invalid billing destination");
  return url.href;
}

interface ProSubscriptionActionProps {
  interval?: BillingInterval;
  mode: "manage" | "subscribe";
}

export function BillingActionControls({
  billing,
  interval = "annual",
  mode,
}: ProSubscriptionActionProps & { billing: BillingController }) {
  return (
    <OwnedBillingActions
      key={billing.lifetimeKey + ":" + mode + ":" + interval}
      billing={billing}
      interval={interval}
      mode={mode}
    />
  );
}

function OwnedBillingActions({
  billing,
  interval,
  mode,
}: {
  billing: BillingController;
  interval: BillingInterval;
  mode: "manage" | "subscribe";
}) {
  const utils = trpc.useUtils();
  const active = useRef(false);
  const operation = useRef<object | null>(null);
  const [pending, setPending] = useState<
    "checkout" | "portal" | "review" | null
  >(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState<
    "needs-review" | "reviewed" | null
  >(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      operation.current = null;
    };
  }, []);

  const act = async (kind: "checkout" | "portal") => {
    if (
      operation.current ||
      billing.phase !== "ready" ||
      (kind === "checkout" && uncertain === "needs-review")
    )
      return;
    const lease = billing.capture();
    if (!lease.current()) return;
    const attempt = {};
    operation.current = attempt;
    setPending(kind);
    setProblem(null);
    const current = () =>
      active.current && operation.current === attempt && lease.current();
    let sent = false;
    let navigating = false;
    try {
      const fresh = await billing.refresh();
      if (!current() || !fresh) return;
      if (
        (kind === "checkout" && isPro(fresh)) ||
        (kind === "portal" && !fresh.hasBillingAccount)
      ) {
        setProblem(
          "Your subscription status changed. Review it before choosing another action.",
        );
        return;
      }
      sent = true;
      const result =
        kind === "checkout"
          ? await utils.client.subscription.createCheckout.mutate({ interval })
          : await utils.client.subscription.createPortalSession.mutate();
      if (!current()) return;
      const destination = providerDestination(result.url, kind);
      window.location.assign(destination);
      navigating = true;
    } catch (error) {
      if (!current()) return;
      if (kind === "checkout" && sent) {
        if (
          error instanceof TRPCClientError &&
          (error.data?.code === "CONFLICT" ||
            error.data?.code === "BAD_REQUEST") &&
          error.message.trim()
        ) {
          // This request was deliberately blocked. An earlier unknown outcome
          // remains unknown, so keep any existing review receipt.
          setProblem(error.message);
        } else setUncertain("needs-review");
      } else
        setProblem(
          kind === "portal"
            ? "We couldn’t open billing. Try again."
            : "We couldn’t check your subscription. Refresh its status before continuing.",
        );
    } finally {
      if (operation.current === attempt && !navigating) {
        operation.current = null;
        if (active.current && lease.current()) setPending(null);
      }
    }
  };

  const review = async () => {
    if (operation.current) return;
    const lease = billing.capture();
    if (!lease.current()) return;
    const attempt = {};
    operation.current = attempt;
    setPending("review");
    try {
      const result = await billing.refresh();
      if (
        active.current &&
        operation.current === attempt &&
        lease.current() &&
        result
      )
        setUncertain("reviewed");
    } finally {
      if (operation.current === attempt) {
        operation.current = null;
        if (active.current && lease.current()) setPending(null);
      }
    }
  };

  const data = billing.data;
  const currentStatus = billing.phase === "ready";
  const proAccess = data ? isPro(data) : false;
  if (!data) return null;
  return (
    <div className="space-y-3">
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {uncertain && (
        <div role="alert" className="space-y-3 text-sm">
          <p>
            {uncertain === "needs-review"
              ? "The checkout outcome is not confirmed. Check your subscription status before another attempt."
              : "Your current status does not confirm whether the earlier checkout was completed or cancelled."}
          </p>
          <p>
            If you already paid, allow time for confirmation or{" "}
            <Link href="/contact" className="underline underline-offset-4">
              contact support
            </Link>{" "}
            before starting another checkout.
          </p>
          <Button
            variant="outline"
            className={control}
            disabled={!!pending}
            onClick={() => void review()}
          >
            Check subscription status
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {data.hasBillingAccount && (
          <Button
            variant="outline"
            className={control}
            onClick={() => void act("portal")}
            disabled={!!pending || !currentStatus}
          >
            {pending === "portal" ? (
              <>
                <Loader2
                  className="mr-2 h-4 w-4 shrink-0 animate-spin"
                  aria-hidden="true"
                />
                Opening billing…
              </>
            ) : (
              <>
                <CreditCard
                  className="mr-2 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                Manage billing
                <ExternalLink
                  className="ml-1 h-3 w-3 shrink-0"
                  aria-hidden="true"
                />
              </>
            )}
          </Button>
        )}
        {mode === "subscribe" && !proAccess && (
          <Button
            variant="gold"
            size="lg"
            className={control + " w-full"}
            disabled={
              !!pending || !currentStatus || uncertain === "needs-review"
            }
            onClick={() => void act("checkout")}
          >
            {pending === "checkout" ? (
              <>
                <Loader2
                  className="mr-2 h-4 w-4 shrink-0 animate-spin"
                  aria-hidden="true"
                />
                Opening checkout…
              </>
            ) : uncertain === "reviewed" ? (
              "Try checkout again"
            ) : (
              `Subscribe${interval === "annual" ? " & Save $99" : ""}`
            )}
          </Button>
        )}
      </div>
      {currentStatus && proAccess && !data.hasBillingAccount && (
        <p className="text-sm text-muted-foreground">
          Your Pro access is active, but no billing account is recorded.{" "}
          <Link href="/contact" className="underline underline-offset-4">
            Contact support
          </Link>{" "}
          for billing help.
        </p>
      )}
      {currentStatus &&
        mode === "subscribe" &&
        !proAccess &&
        data.hasBillingAccount && (
          <p className="text-sm text-muted-foreground">
            You have an existing billing account. Review it before starting
            another subscription.
          </p>
        )}
    </div>
  );
}

function ProSubscriptionActionContent(props: ProSubscriptionActionProps) {
  const billing = useBillingStatus();
  return (
    <div className="space-y-3">
      <BillingStatusFeedback billing={billing} />
      <BillingActionControls billing={billing} {...props} />
    </div>
  );
}

export function ProSubscriptionAction(props: ProSubscriptionActionProps) {
  return (
    <Suspense fallback={<p role="status">Checking subscription status…</p>}>
      <ProSubscriptionActionContent {...props} />
    </Suspense>
  );
}
