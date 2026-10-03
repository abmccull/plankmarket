"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { isAuthApiError, isAuthWeakPasswordError } from "@supabase/supabase-js";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
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
import { Loader2 } from "lucide-react";

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
type Phase =
  | "checking"
  | "ready"
  | "unavailable"
  | "read-error"
  | "changed"
  | "success"
  | "uncertain";
type Actor = { id: string; email: string };
const actorKey = (user: { id: string; email?: string }) =>
  `${user.id}:${user.email?.trim().toLowerCase() ?? ""}`;
const actionClass =
  "h-auto min-h-11 w-full whitespace-normal px-[min(1rem,16px)] py-2 text-center";

function hasUnusableLink() {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  return (
    url.searchParams.has("code") ||
    fragment.has("access_token") ||
    ["error", "error_code", "error_description"].some(
      (key) => url.searchParams.has(key) || fragment.has(key),
    )
  );
}

export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const phaseRef = useRef<Phase>("checking");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const observedIdentity = useRef<string | null | undefined>(undefined);
  const owner = useRef<Actor | null>(null);
  const operation = useRef<object | null>(null);
  const busyRef = useRef(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  });
  const show = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);
  const clearInputs = useCallback(() => {
    reset({ password: "", confirmPassword: "" });
  }, [reset]);

  const checkAccount = useCallback(async () => {
    if (busyRef.current) return;
    const attempt = ++generation.current;
    const current = () => active.current && generation.current === attempt;
    owner.current = null;
    setEmail(null);
    setProblem(null);
    clearInputs();
    show("checking");
    try {
      const supabase = createClient();
      // The existing SDK processes recovery redirects during initialization.
      // Await its normal session read; never exchange the same code twice.
      const before = await supabase.auth.getSession();
      if (!current()) return;
      if (hasUnusableLink()) {
        show("unavailable");
        return;
      }
      if (before.error) throw before.error;
      if (!before.data.session) {
        show("unavailable");
        return;
      }
      const verified = await supabase.auth.getUser();
      if (!current()) return;
      if (verified.error) throw verified.error;
      const after = await supabase.auth.getSession();
      if (!current()) return;
      if (
        after.error ||
        !after.data.session ||
        !verified.data.user?.email ||
        actorKey(before.data.session.user) !== actorKey(verified.data.user) ||
        actorKey(after.data.session.user) !== actorKey(verified.data.user)
      ) {
        throw new Error("Account access changed");
      }
      owner.current = {
        id: verified.data.user.id,
        email: verified.data.user.email,
      };
      observedIdentity.current = actorKey(verified.data.user);
      setEmail(verified.data.user.email);
      show("ready");
    } catch {
      if (current()) show("read-error");
    }
  }, [clearInputs, show]);

  useEffect(() => {
    active.current = true;
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active.current) return;
      const identity = session ? actorKey(session.user) : null;
      const previous = observedIdentity.current;
      observedIdentity.current = identity;
      if (previous === undefined || previous === identity) return;
      generation.current += 1;
      if (
        owner.current ||
        operation.current ||
        phaseRef.current === "success"
      ) {
        owner.current = null;
        operation.current = null;
        busyRef.current = false;
        setBusy(false);
        setEmail(null);
        setProblem(null);
        clearInputs();
        show("changed");
      } else if (phaseRef.current === "checking") {
        // Schedule outside the SDK callback, which may hold an auth lock.
        queueMicrotask(() => {
          if (active.current) void checkAccount();
        });
      }
    });
    void checkAccount();
    return () => {
      active.current = false;
      generation.current += 1;
      owner.current = null;
      operation.current = null;
      busyRef.current = false;
      subscription.unsubscribe();
    };
  }, [checkAccount, clearInputs, show]);

  const onSubmit = async (input: ResetPasswordInput) => {
    const expected = owner.current;
    if (busyRef.current || phaseRef.current !== "ready" || !expected) return;
    const attempt = ++generation.current;
    const token = {};
    operation.current = token;
    busyRef.current = true;
    setBusy(true);
    setProblem(null);
    const current = () =>
      active.current &&
      generation.current === attempt &&
      operation.current === token;
    let sent = false;
    try {
      if (hasUnusableLink()) {
        owner.current = null;
        clearInputs();
        show("unavailable");
        return;
      }
      const supabase = createClient();
      const before = await supabase.auth.getSession();
      if (!current()) return;
      if (before.error) throw before.error;
      const verified = await supabase.auth.getUser();
      if (!current()) return;
      if (verified.error) throw verified.error;
      const after = await supabase.auth.getSession();
      if (!current()) return;
      if (after.error) throw after.error;
      if (
        !before.data.session ||
        !after.data.session ||
        !verified.data.user ||
        actorKey(before.data.session.user) !== actorKey(expected) ||
        actorKey(after.data.session.user) !== actorKey(expected) ||
        actorKey(verified.data.user) !== actorKey(expected)
      ) {
        owner.current = null;
        clearInputs();
        show("changed");
        return;
      }
      sent = true;
      const result = await supabase.auth.updateUser({
        password: input.password,
      });
      if (!current()) return;
      if (result.error) throw result.error;
      if (
        !result.data.user ||
        actorKey(result.data.user) !== actorKey(expected)
      ) {
        clearInputs();
        show("uncertain");
        return;
      }
      clearInputs();
      show("success");
    } catch (error) {
      if (!current()) return;
      if (!sent) {
        owner.current = null;
        clearInputs();
        show("read-error");
      } else if (
        (isAuthApiError(error) || isAuthWeakPasswordError(error)) &&
        Number.isInteger(error.status) &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408
      ) {
        setProblem(
          "We couldn’t update your password. Check the requirements and try again.",
        );
      } else {
        clearInputs();
        show("uncertain");
      }
    } finally {
      if (operation.current === token) {
        operation.current = null;
        busyRef.current = false;
        if (active.current) setBusy(false);
      }
    }
  };

  const title =
    phase === "ready"
      ? "Create new password"
      : phase === "unavailable"
        ? "Reset link unavailable"
        : phase === "read-error"
          ? "Account access unavailable"
          : phase === "changed"
            ? "Account changed"
            : phase === "success"
              ? "Password updated"
              : phase === "uncertain"
                ? "Password change not confirmed"
                : "Checking account access";
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="px-[min(1.5rem,24px)] text-center">
        <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
        {phase === "ready" && (
          <CardDescription>
            Use 8–72 characters and a password you do not use elsewhere.
          </CardDescription>
        )}
      </CardHeader>
      {phase === "ready" ? (
        <form method="post" onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4 px-[min(1.5rem,24px)]">
            <p className="break-words text-sm text-muted-foreground">
              Updating password for {email}
            </p>
            {problem && (
              <p
                id="reset-problem"
                role="alert"
                className="text-sm text-destructive"
              >
                {problem}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                disabled={busy}
                aria-invalid={!!errors.password}
                aria-describedby={
                  [
                    errors.password && "password-error",
                    problem && "reset-problem",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                {...register("password")}
              />
              {errors.password && (
                <p
                  id="password-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.password.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                disabled={busy}
                aria-invalid={!!errors.confirmPassword}
                aria-describedby={
                  errors.confirmPassword ? "confirmPassword-error" : undefined
                }
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p
                  id="confirmPassword-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>
            <Button type="submit" className={actionClass} disabled={busy}>
              {busy && (
                <Loader2
                  className="mr-2 h-4 w-4 shrink-0 animate-spin"
                  aria-hidden="true"
                />
              )}
              Update password
            </Button>
          </CardContent>
        </form>
      ) : (
        <CardContent className="space-y-4 px-[min(1.5rem,24px)] text-sm">
          {phase === "checking" && (
            <p role="status" className="flex items-center justify-center gap-2">
              <Loader2
                className="h-4 w-4 shrink-0 animate-spin"
                aria-hidden="true"
              />
              Checking your account…
            </p>
          )}
          {phase === "unavailable" && (
            <p>
              This reset link is missing, expired or no longer usable. Request a
              new link and open the most recent email.
            </p>
          )}
          {phase === "read-error" && (
            <>
              <p role="alert">
                We couldn’t confirm which account is open. Retry before changing
                your password.
              </p>
              <Button
                className={actionClass}
                onClick={() => void checkAccount()}
              >
                Retry account check
              </Button>
            </>
          )}
          {phase === "changed" && (
            <>
              <p>
                Your account changed while this page was open. Your password
                fields have been cleared. Check the current account before
                continuing.
              </p>
              <Button
                className={actionClass}
                onClick={() => void checkAccount()}
              >
                Check this account
              </Button>
            </>
          )}
          {phase === "success" && (
            <>
              <p role="status">Your new password is ready to use.</p>
              <Button asChild className={actionClass}>
                <Link href="/settings">Continue to your account</Link>
              </Button>
            </>
          )}
          {phase === "uncertain" && (
            <>
              <p role="alert">
                We couldn’t confirm the password change. Try signing in with
                your new password, or request a new reset link.
              </p>
              <Button asChild className={actionClass}>
                <Link href="/login">Try signing in</Link>
              </Button>
            </>
          )}
        </CardContent>
      )}
      {phase !== "success" && (
        <CardFooter className="px-[min(1.5rem,24px)]">
          <Button asChild variant="ghost" className={actionClass}>
            <Link href="/forgot-password">Request a new reset link</Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
