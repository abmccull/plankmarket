"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { shouldAutoRedirectFromMfa } from "@/lib/auth/mfa-page-state";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { getDashboardPath } from "@/lib/auth/roles";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

type Account = NonNullable<ReturnType<typeof useAuthStore.getState>["user"]>;
const actionClass =
  "h-auto min-h-11 whitespace-normal px-[min(1rem,16px)] py-2 text-center";
const signOutProblem =
  "We couldn’t sign you out. Your session may still be active; try again.";

export default function MfaPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = sanitizeRedirectPath(params.get("next"), null);
  const intent = params.get("intent");
  const session = trpc.auth.getSession.useQuery(undefined, { retry: false });
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);
  const utils = trpc.useUtils();
  const [retrying, setRetrying] = useState(false);
  const [signOutState, setSignOutState] = useState<"pending" | "error" | null>(
    null,
  );
  const signOutOwner = useRef<Pick<Account, "id" | "email"> | null>(null);
  const signingOut = useRef<{
    generation: number;
    owner: string | undefined;
    ownerEmail: string | undefined;
    allowedClear: number | null;
  } | null>(null);
  const active = useRef(false);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const retryOperation = useRef<object | null>(null);
  const committingRetry = useRef(false);
  const continuationStarted = useRef(false);
  useEffect(() => {
    active.current = true;
    setSignOutState(null);
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      if (
        state.user?.id !== previous.user?.id ||
        state.user?.email !== previous.user?.email
      ) {
        const operation = signingOut.current;
        const ownClear =
          operation &&
          generation.current === operation.generation &&
          !state.user &&
          previous.user?.id === operation.owner &&
          previous.user?.email === operation.ownerEmail;
        generation.current += 1;
        if (ownClear) operation.allowedClear = generation.current;
        else {
          signingOut.current = null;
          signOutOwner.current = null;
          setSignOutState(null);
        }
        if (!committingRetry.current) {
          retryOperation.current = null;
          inFlight.current = false;
          continuationStarted.current = false;
          setRetrying(false);
        }
      }
    });
    return () => {
      active.current = false;
      generation.current += 1;
      retryOperation.current = null;
      signingOut.current = null;
      signOutOwner.current = null;
      inFlight.current = false;
      continuationStarted.current = false;
      unsubscribe();
    };
  }, [next, intent]);
  const account = session.data?.user;
  const matches =
    !!account &&
    user?.id === account.id &&
    user.email.trim().toLowerCase() === account.email.trim().toLowerCase();
  const destination =
    next ?? (account ? getDashboardPath(account.role) : "/login");
  const continueToDestination = useCallback(() => {
    if (continuationStarted.current || signingOut.current || signOutState)
      return;
    continuationStarted.current = true;
    router.replace(destination);
    router.refresh();
  }, [destination, router, signOutState]);

  useEffect(() => {
    if (
      signingOut.current ||
      signOutState ||
      session.isLoading ||
      session.isError ||
      !session.data
    )
      return;
    if (!session.data.isAuthenticated || !session.data.user) {
      const returnParams = new URLSearchParams();
      if (next) returnParams.set("next", next);
      if (intent === "manage") returnParams.set("intent", "manage");
      const returnPath =
        "/mfa" + (returnParams.size ? "?" + returnParams.toString() : "");
      router.replace("/login?redirect=" + encodeURIComponent(returnPath));
      return;
    }
    if (
      matches &&
      shouldAutoRedirectFromMfa({
        currentLevel: session.data.user.assurance?.currentLevel,
        recentVerificationSatisfied:
          session.data.user.assurance?.recentVerificationSatisfied,
        next,
        intent,
      })
    ) {
      continueToDestination();
    }
  }, [
    destination,
    continueToDestination,
    intent,
    matches,
    next,
    router,
    session.data,
    session.isError,
    session.isLoading,
    signOutState,
  ]);

  const retrySession = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const attempt = ++generation.current;
    const operation = {};
    retryOperation.current = operation;
    const current = () =>
      active.current &&
      retryOperation.current === operation &&
      generation.current === attempt;
    setRetrying(true);
    try {
      const supabase = createClient();
      const before = await supabase.auth.getSession();
      if (before.error || !before.data.session || !current()) return;
      // Uncached transport cannot repopulate another actor's query cache.
      const result = await utils.client.auth.getSession.query();
      if (!current()) return;
      const after = await supabase.auth.getSession();
      if (
        !current() ||
        after.error ||
        after.data.session?.user.id !== before.data.session.user.id
      )
        return;
      const expectedEmail = after.data.session.user.email?.trim().toLowerCase();
      if (
        result.isAuthenticated &&
        result.user &&
        expectedEmail &&
        result.user.email.trim().toLowerCase() === expectedEmail
      ) {
        committingRetry.current = true;
        try {
          useAuthStore.getState().setUser(result.user);
          utils.auth.getSession.setData(undefined, result);
        } finally {
          committingRetry.current = false;
        }
      }
    } catch {
      /* The query problem remains visible and can be retried. */
    } finally {
      if (retryOperation.current === operation) {
        retryOperation.current = null;
        inFlight.current = false;
        if (active.current) setRetrying(false);
      }
    }
  };

  const signOut = async (expected: Pick<Account, "id" | "email">) => {
    if (signingOut.current) return;
    const actor = useAuthStore.getState().user;
    const retryingOwnReceipt =
      signOutOwner.current?.id === expected.id &&
      signOutOwner.current.email === expected.email;
    if (
      actor
        ? actor.id !== expected.id || actor.email !== expected.email
        : !retryingOwnReceipt
    )
      return;
    const operation = {
      generation: ++generation.current,
      owner: expected.id,
      ownerEmail: expected.email,
      allowedClear: null as number | null,
    };
    signingOut.current = operation;
    signOutOwner.current = { id: expected.id, email: expected.email };
    setSignOutState("pending");
    const current = () =>
      active.current &&
      signingOut.current === operation &&
      (generation.current === operation.generation ||
        generation.current === operation.allowedClear);
    const matchesActor = () => {
      const live = useAuthStore.getState().user;
      return (
        !live ||
        (live.id === operation.owner && live.email === operation.ownerEmail)
      );
    };
    try {
      const supabase = createClient();
      const before = await supabase.auth.getSession();
      if (!current() || !matchesActor()) return;
      if (before.error) throw before.error;
      if (
        before.data.session &&
        before.data.session.user.email?.trim().toLowerCase() !==
          operation.ownerEmail.trim().toLowerCase()
      ) {
        signingOut.current = null;
        signOutOwner.current = null;
        setSignOutState(null);
        return;
      }
      // An earlier attempt may already have cleared the local session. A retry
      // still gets an explicit SDK outcome; absence of a session is not an error.
      const { error } = await supabase.auth.signOut();
      if (!current() || !matchesActor()) return;
      if (error) throw error;
      useAuthStore.getState().logout();
      router.replace("/login");
      router.refresh();
    } catch {
      if (current() && matchesActor()) setSignOutState("error");
    } finally {
      if (signingOut.current === operation) signingOut.current = null;
    }
  };

  // AuthProvider may clear the child owner before signOut returns its error.
  // Keep this outcome at the route boundary until retry or an account change.
  if (signOutState)
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="px-[min(1.5rem,24px)]">
          <h1 className="text-2xl font-semibold">
            {signOutState === "pending" ? "Signing out" : "Sign-out incomplete"}
          </h1>
        </CardHeader>
        <CardContent className="space-y-4 px-[min(1.5rem,24px)]">
          {signOutState === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              {signOutProblem}
            </p>
          ) : (
            <p role="status" className="text-sm">
              Ending your session…
            </p>
          )}
          <Button
            className={actionClass + " w-full"}
            variant="outline"
            disabled={signOutState === "pending"}
            onClick={() => {
              const owner = signOutOwner.current;
              if (owner) void signOut(owner);
            }}
          >
            <LogOut className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    );

  // A failed read cannot establish which authenticator belongs to this account.
  // Keep an already mounted accepted-code receipt when its cached owner matches.
  if (
    !matches &&
    (session.isError || (!session.isLoading && !authLoading && !!account))
  ) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-2xl font-semibold">Security check unavailable</h1>
          <CardDescription>
            We couldn’t confirm your account access. Retry to continue with your
            authenticator.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className={actionClass + " w-full"}
            disabled={retrying}
            onClick={() => void retrySession()}
          >
            Retry account access
          </Button>
          <Button className={actionClass + " w-full"} asChild variant="outline">
            <Link
              href={
                "/account-recovery?reason=mfa" +
                (next ? "&next=" + encodeURIComponent(next) : "")
              }
            >
              Get help with account access
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (!matches || !account)
    return (
      <Card className="w-full max-w-md">
        <CardContent
          role="status"
          className="flex items-center justify-center gap-2 py-12"
        >
          <Loader2
            className="h-5 w-5 shrink-0 animate-spin"
            aria-hidden="true"
          />
          <span>Checking account access…</span>
        </CardContent>
      </Card>
    );
  return (
    <AuthenticatorTask
      key={account.id + ":" + next + ":" + intent}
      account={account}
      next={next}
      onContinue={continueToDestination}
      onSignOut={() => signOut(account)}
    />
  );
}

function AuthenticatorTask({
  account,
  next,
  onContinue,
  onSignOut,
}: {
  account: Account;
  next: string | null;
  onContinue: () => void;
  onSignOut: () => Promise<void>;
}) {
  const utils = trpc.useUtils();
  const active = useRef(false);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [factorState, setFactorState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [hasAuthenticator, setHasAuthenticator] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [friendlyName, setFriendlyName] = useState("Primary authenticator");
  const [problem, setProblem] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const current = useCallback(
    (attempt: number) =>
      active.current &&
      generation.current === attempt &&
      useAuthStore.getState().user?.id === account.id,
    [account.id],
  );
  useEffect(() => {
    active.current = true;
    const unsubscribe = useAuthStore.subscribe((state) => {
      if (state.user?.id !== account.id) generation.current += 1;
    });
    return () => {
      active.current = false;
      generation.current += 1;
      unsubscribe();
    };
  }, [account.id]);
  const loadFactors = useCallback(async () => {
    if (busyRef.current) return;
    const attempt = ++generation.current;
    setFactorState("loading");
    try {
      const { data, error } = await createClient().auth.mfa.listFactors();
      if (!current(attempt)) return;
      if (error) throw error;
      setHasAuthenticator(data.totp.length > 0);
      setFactorId(data.totp[0]?.id ?? null);
      setFactorState("ready");
    } catch {
      if (current(attempt)) setFactorState("error");
    }
  }, [current]);
  useEffect(() => {
    void loadFactors();
  }, [loadFactors]);

  const begin = () => {
    if (busyRef.current || useAuthStore.getState().user?.id !== account.id)
      return null;
    busyRef.current = true;
    setBusy(true);
    setProblem(null);
    return ++generation.current;
  };
  const finish = (attempt: number) => {
    if (current(attempt)) {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const confirmActor = async (attempt: number) => {
    const { data, error } = await createClient().auth.getSession();
    return (
      current(attempt) &&
      !error &&
      data.session?.user.email?.trim().toLowerCase() ===
        account.email.trim().toLowerCase()
    );
  };
  const openAccount = async (attempt: number) => {
    const refreshed = await utils.client.auth.getSession.query();
    if (!current(attempt) || !(await confirmActor(attempt))) return;
    if (
      !refreshed.isAuthenticated ||
      !refreshed.user ||
      refreshed.user.id !== account.id ||
      refreshed.user.email.trim().toLowerCase() !==
        account.email.trim().toLowerCase() ||
      refreshed.user.assurance?.currentLevel !== "aal2" ||
      !refreshed.user.assurance.recentVerificationSatisfied
    ) {
      setProblem(
        "We couldn’t confirm your secured session yet. Retry account access without entering another code.",
      );
      return;
    }
    useAuthStore.getState().setUser(refreshed.user);
    utils.auth.getSession.setData(undefined, refreshed);
    void utils.invalidate().catch(() => {
      /* Destination queries have their own recovery. */
    });
    onContinue();
  };
  const startSetup = async () => {
    const attempt = begin();
    if (attempt === null) return;
    try {
      if (!(await confirmActor(attempt))) return;
      const supabase = createClient();
      const { data: factors, error: factorError } =
        await supabase.auth.mfa.listFactors();
      if (!current(attempt)) return;
      if (factorError) throw factorError;
      if (factors.totp.length > 0) {
        setHasAuthenticator(true);
        setFactorId(factors.totp[0].id);
        return;
      }
      for (const factor of factors.all.filter(
        (item) => item.factor_type === "totp" && item.status !== "verified",
      )) {
        if (!(await confirmActor(attempt))) return;
        const { error } = await supabase.auth.mfa.unenroll({
          factorId: factor.id,
        });
        if (!current(attempt)) return;
        if (error) throw error;
      }
      if (!(await confirmActor(attempt))) return;
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: friendlyName.trim() || "Primary authenticator",
        issuer: "PlankMarket",
      });
      if (!current(attempt)) return;
      if (error) throw error;
      setFactorId(data.id);
      // Current Supabase SDK returns a complete SVG data URI. Older raw SVG
      // payloads remain displayable without wrapping a data URI a second time.
      setQrCode(
        data.totp.qr_code.startsWith("data:image/svg+xml;")
          ? data.totp.qr_code
          : `data:image/svg+xml;utf8,${encodeURIComponent(data.totp.qr_code)}`,
      );
      setSecret(data.totp.secret);
      setCode("");
    } catch {
      if (current(attempt))
        setProblem(
          "We couldn’t start authenticator setup. Your existing security settings have not been confirmed; try again.",
        );
    } finally {
      finish(attempt);
    }
  };
  const verify = async () => {
    if (!factorId || !/^\d{6}$/.test(code) || accepted) return;
    const attempt = begin();
    if (attempt === null) return;
    try {
      if (!(await confirmActor(attempt))) return;
      const supabase = createClient();
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (!current(attempt)) return;
      if (challenge.error) throw challenge.error;
      if (!(await confirmActor(attempt))) return;
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code,
      });
      if (!current(attempt)) return;
      if (error) throw error;
      setAccepted(true);
      setCode("");
      setSecret(null);
      setQrCode(null);
      try {
        await openAccount(attempt);
      } catch {
        if (current(attempt))
          setProblem(
            "We couldn’t confirm your secured session yet. Retry account access without entering another code.",
          );
      }
    } catch {
      if (current(attempt))
        setProblem(
          "We couldn’t confirm this code. Check your authenticator app and try its current 6-digit code.",
        );
    } finally {
      finish(attempt);
    }
  };
  const retryAccount = async () => {
    const attempt = begin();
    if (attempt === null) return;
    try {
      await openAccount(attempt);
    } catch {
      if (current(attempt))
        setProblem(
          "We couldn’t confirm your secured session yet. Retry account access without entering another code.",
        );
    } finally {
      finish(attempt);
    }
  };
  const recoveryParams = new URLSearchParams({ reason: "mfa" });
  if (next) recoveryParams.set("next", next);
  const lastCheck = account.assurance?.lastFactorVerificationAt;
  const lastCheckDate = lastCheck ? new Date(lastCheck) : null;
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="px-[min(1.5rem,24px)] text-center">
        <ShieldCheck
          className="mx-auto mb-2 h-8 w-8 text-primary"
          aria-hidden="true"
        />
        <h1 className="text-2xl font-semibold leading-tight">
          {hasAuthenticator || accepted
            ? "Confirm it’s you"
            : "Protect your account"}
        </h1>
        <CardDescription>
          {hasAuthenticator
            ? "Enter the 6-digit code from your authenticator app to continue."
            : "An authenticator app adds a security check before you manage payments or other sensitive account actions."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-[min(1.5rem,24px)]">
        {accepted && (
          <p role="status" className="text-sm font-medium">
            Your authenticator code was accepted.
          </p>
        )}
        {problem && (
          <p id="mfa-problem" role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        {accepted ? (
          <Button
            className={actionClass + " w-full"}
            onClick={() => void retryAccount()}
            disabled={busy}
          >
            Retry account access
          </Button>
        ) : factorState === "loading" ? (
          <p role="status" className="flex items-center gap-2 text-sm">
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin"
              aria-hidden="true"
            />
            Loading your authenticator…
          </p>
        ) : factorState === "error" ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm">
              We couldn’t load your authenticator. Try again to continue.
            </p>
            <Button
              className={actionClass + " w-full"}
              onClick={() => void loadFactors()}
            >
              Retry authenticator
            </Button>
          </div>
        ) : (
          <>
            {!hasAuthenticator && !qrCode && (
              <div className="space-y-3">
                <ol className="list-decimal space-y-2 pl-5 text-sm">
                  <li>Open an authenticator app on your phone.</li>
                  <li>Scan the setup code shown here.</li>
                  <li>Enter the app’s 6-digit code to finish.</li>
                </ol>
                <div className="space-y-1">
                  <Label htmlFor="factor-name">Authenticator name</Label>
                  <Input
                    id="factor-name"
                    value={friendlyName}
                    disabled={busy}
                    maxLength={100}
                    onChange={(event) => setFriendlyName(event.target.value)}
                  />
                </div>
                <Button
                  className={actionClass + " w-full"}
                  disabled={busy}
                  onClick={() => void startSetup()}
                >
                  {busy && (
                    <Loader2
                      className="mr-2 h-4 w-4 shrink-0 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  Start authenticator setup
                </Button>
              </div>
            )}
            {qrCode && (
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  Scan with your authenticator app
                </p>
                <div data-private-mfa className="space-y-3">
                  <div className="flex justify-center">
                    {/* Supabase supplies an SVG enrollment QR. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt="Authenticator setup QR code"
                      className="h-auto w-48 max-w-full border bg-white p-2"
                      src={qrCode}
                    />
                  </div>
                  <details className="text-sm">
                    <summary className="cursor-pointer py-2">
                      Can’t scan? Enter the setup key
                    </summary>
                    <p className="break-all rounded-md bg-muted p-3 font-mono text-xs">
                      {secret}
                    </p>
                  </details>
                </div>
              </div>
            )}
            {(hasAuthenticator || qrCode) && (
              <form
                method="post"
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void verify();
                }}
              >
                <div className="space-y-1">
                  <Label htmlFor="mfa-code">Authenticator code</Label>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={code}
                    disabled={busy}
                    aria-invalid={!!problem}
                    aria-describedby={problem ? "mfa-problem" : undefined}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                </div>
                <Button
                  type="submit"
                  className={actionClass + " w-full"}
                  disabled={busy || code.length !== 6}
                >
                  {busy && (
                    <Loader2
                      className="mr-2 h-4 w-4 shrink-0 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {hasAuthenticator ? "Verify and continue" : "Finish setup"}
                </Button>
              </form>
            )}
          </>
        )}
        {lastCheckDate && !Number.isNaN(lastCheckDate.getTime()) && (
          <p className="text-xs text-muted-foreground">
            Last confirmed: {lastCheckDate.toLocaleString()}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2 px-[min(1.5rem,24px)]">
        <Button
          className={actionClass}
          variant="outline"
          disabled={busy}
          onClick={() => void onSignOut()}
        >
          <LogOut className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
          Sign out
        </Button>
        <Link
          href={"/account-recovery?" + recoveryParams.toString()}
          className="py-2 text-center text-sm underline underline-offset-4"
        >
          Can’t use your authenticator?
        </Link>
      </CardFooter>
    </Card>
  );
}
