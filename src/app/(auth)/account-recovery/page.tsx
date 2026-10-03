"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { getDashboardPath } from "@/lib/auth/roles";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";

export default function AccountRecoveryPage() {
  const router = useRouter();
  const resumeSetup = trpc.auth.resumeAccountSetup.useMutation();
  const params = useSearchParams();
  const isMfaRecovery = params.get("reason") === "mfa";
  const next = sanitizeRedirectPath(params.get("next"), null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const active = useRef(false);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const signingOut = useRef<{
    generation: number;
    owner: string | undefined;
    ownerEmail: string | undefined;
    allowedClear: number | null;
  } | null>(null);
  useEffect(() => {
    active.current = true;
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      if (
        state.user?.id === previous.user?.id &&
        state.user?.email === previous.user?.email
      )
        return;
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
        inFlight.current = false;
        setBusy(false);
        setProblem(null);
      }
    });
    return () => {
      active.current = false;
      generation.current += 1;
      signingOut.current = null;
      unsubscribe();
    };
  }, []);
  const signOut = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    const actor = useAuthStore.getState().user;
    const operation = {
      generation: ++generation.current,
      owner: actor?.id,
      ownerEmail: actor?.email,
      allowedClear: null as number | null,
    };
    signingOut.current = operation;
    const current = () =>
      active.current &&
      signingOut.current === operation &&
      (generation.current === operation.generation ||
        generation.current === operation.allowedClear);
    try {
      const { error } = await createClient().auth.signOut();
      const live = useAuthStore.getState().user;
      if (
        !current() ||
        (live &&
          (live.id !== operation.owner || live.email !== operation.ownerEmail))
      )
        return;
      if (error) throw error;
      useAuthStore.getState().logout();
      router.replace("/login");
      router.refresh();
    } catch {
      const live = useAuthStore.getState().user;
      if (
        current() &&
        (!live ||
          (live.id === operation.owner && live.email === operation.ownerEmail))
      )
        setProblem(
          "We couldn’t sign you out. Your session may still be active; try again.",
        );
    } finally {
      if (signingOut.current === operation) {
        signingOut.current = null;
        inFlight.current = false;
        if (active.current) setBusy(false);
      }
    }
  };
  const resume = async () => {
    if (inFlight.current || isMfaRecovery) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    const operation = ++generation.current;
    const current = () => active.current && generation.current === operation;
    try {
      const client = createClient();
      const initial = await client.auth.getUser();
      if (!current()) return;
      if (initial.error || !initial.data.user) throw new Error("Sign in to the account you want to finish setting up.");
      const actor = initial.data.user.id;
      const result = await resumeSetup.mutateAsync();
      if (!current()) return;
      const refreshed = await client.auth.refreshSession();
      if (!current()) return;
      if (refreshed.error || refreshed.data.user?.id !== actor) throw new Error("Your account session changed. Sign in again before continuing.");
      router.replace(next ?? getDashboardPath(result.role));
      router.refresh();
    } catch (error) {
      if (current()) setProblem(error instanceof Error ? error.message : "Your account update is still being confirmed. Retry confirmation, or contact support.");
    } finally {
      if (current()) { inFlight.current = false; setBusy(false); }
    }
  };
  const actionClass =
    "h-auto min-h-11 w-full whitespace-normal px-[min(1rem,16px)] py-2 text-center";
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="px-[min(1.5rem,24px)] text-center">
        <ShieldAlert
          className="mx-auto mb-2 h-8 w-8 text-amber-700"
          aria-hidden="true"
        />
        <h1 className="text-2xl font-semibold leading-tight">
          {isMfaRecovery
            ? "Recover authenticator access"
            : "Complete your account setup"}
        </h1>
        <CardDescription>
          {isMfaRecovery
            ? "If you no longer have your authenticator, contact support from the email address used for this account. We’ll review the steps needed to restore access."
            : "Your sign-in works, but account setup is incomplete. Retry confirmation to finish a pending setup. If it stays unresolved, contact support from your account email."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-[min(1.5rem,24px)] text-sm">
        <p className="text-muted-foreground">
          {isMfaRecovery
            ? "For your security, this page cannot remove an authenticator or skip the security check. Never send your password, authenticator code or setup key to support."
            : "Include what happened when you registered and whether you planned to buy or sell. Never send your password or verification codes."}
        </p>
        {problem && (
          <p role="alert" className="text-destructive">
            {problem}
          </p>
        )}
        {!isMfaRecovery && (
          <Button className={actionClass} disabled={busy} onClick={() => void resume()}>
            {busy ? "Confirming account…" : "Retry account setup"}
          </Button>
        )}
        <Button className={actionClass} asChild variant="outline">
          <Link href="mailto:support@plankmarket.com">Email support</Link>
        </Button>
        {isMfaRecovery && (
          <Button className={actionClass} asChild variant="outline">
            <Link
              href={next ? "/mfa?next=" + encodeURIComponent(next) : "/mfa"}
            >
              Try authenticator again
            </Link>
          </Button>
        )}
      </CardContent>
      <CardFooter className="px-[min(1.5rem,24px)]">
        <Button
          className={actionClass}
          variant="ghost"
          disabled={busy}
          onClick={() => void signOut()}
        >
          {busy ? (
            <Loader2
              className="mr-2 h-4 w-4 shrink-0 animate-spin"
              aria-hidden="true"
            />
          ) : (
            <LogOut className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          Sign out
        </Button>
      </CardFooter>
    </Card>
  );
}
