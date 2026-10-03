"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validators/auth";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";
import { getDashboardPath } from "@/lib/auth/roles";
import { isHighAssuranceRoute } from "@/lib/auth/auth-assurance";
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
import { getErrorMessage } from "@/lib/utils";
import { Loader2 } from "lucide-react";

function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [credentialsAccepted, setCredentialsAccepted] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackFailed = searchParams.get("error") === "auth_callback_failed";
  const redirect = sanitizeRedirectPath(searchParams.get("redirect"), null);
  const intendedRole =
    searchParams.get("role") === "seller" ? "seller" : "buyer";
  const registerParams = new URLSearchParams({ role: intendedRole });
  if (redirect) registerParams.set("redirect", redirect);
  const registerHref = `/register?${registerParams.toString()}`;
  const utils = trpc.useUtils();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const generation = useRef(0);
  const active = useRef(false);
  const submitting = useRef(false);
  const acceptedEmail = useRef<string | null>(null);
  useEffect(() => {
    active.current = true;
    const unsubscribe = useAuthStore.subscribe((next, previous) => {
      if (previous.user && next.user?.id !== previous.user.id)
        generation.current += 1;
    });
    return () => {
      active.current = false;
      generation.current += 1;
      unsubscribe();
    };
  }, [redirect, intendedRole]);
  const current = (attempt: number) =>
    active.current && generation.current === attempt;
  const openAccount = async (attempt: number) => {
    await utils.auth.getSession.invalidate();
    if (!current(attempt)) return;
    const session = await utils.auth.getSession.fetch();
    if (!current(attempt)) return;
    const liveUser = useAuthStore.getState().user;
    if (
      session.user &&
      ((liveUser && liveUser.id !== session.user.id) ||
        session.user.email.trim().toLowerCase() !== acceptedEmail.current)
    ) {
      setProblem(
        "Your account changed while sign-in was completing. Use account recovery to continue with the current account.",
      );
      return;
    }
    if (!session.isAuthenticated || !session.user) {
      setProblem(
        "Your sign-in succeeded, but we couldn’t open your marketplace account. Retry account access or use account recovery.",
      );
      return;
    }
    useAuthStore.getState().setUser(session.user);
    const destination = redirect ?? getDashboardPath(session.user.role);
    router.push(
      isHighAssuranceRoute(destination) &&
        session.user.assurance?.currentLevel !== "aal2"
        ? "/mfa?next=" + encodeURIComponent(destination)
        : destination,
    );
    router.refresh();
  };

  const onSubmit = async (data: LoginInput) => {
    if (submitting.current || credentialsAccepted) return;
    submitting.current = true;
    const attempt = ++generation.current;
    acceptedEmail.current = data.email.trim().toLowerCase();
    setIsLoading(true);
    setProblem(null);
    try {
      const { error } = await createClient().auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (!current(attempt)) return;
      if (error) {
        setProblem(getErrorMessage(error));
        return;
      }
      setCredentialsAccepted(true);
      try {
        await openAccount(attempt);
      } catch {
        if (current(attempt))
          setProblem(
            "Your sign-in succeeded, but account access could not be checked. Retry account access; you do not need to sign in again.",
          );
      }
    } catch {
      if (current(attempt))
        setProblem(
          "We couldn’t complete sign-in. Your entered details are still here; try again.",
        );
    } finally {
      submitting.current = false;
      if (active.current) setIsLoading(false);
    }
  };
  const retryAccount = async () => {
    if (submitting.current) return;
    submitting.current = true;
    const attempt = ++generation.current;
    setIsLoading(true);
    setProblem(null);
    try {
      await openAccount(attempt);
    } catch {
      if (current(attempt))
        setProblem(
          "Account access is still unavailable. Retry or use account recovery.",
        );
    } finally {
      submitting.current = false;
      if (active.current) setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <h1 className="text-2xl font-semibold leading-none tracking-tight">
          Welcome Back
        </h1>
        <CardDescription>Sign in to your PlankMarket account</CardDescription>
      </CardHeader>
      <form method="post" onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {callbackFailed && !credentialsAccepted && (
            <div
              role="alert"
              className="space-y-2 rounded-md border border-destructive/30 p-3 text-sm"
            >
              <p>That sign-in link could not be completed.</p>
              <p>
                Sign in below. If you were resetting your password, request a
                new reset link.
              </p>
              <Link
                href="/forgot-password"
                className="font-medium text-primary underline underline-offset-2"
              >
                Request a new reset link
              </Link>
            </div>
          )}
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          {credentialsAccepted && (
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={isLoading}
                onClick={() => void retryAccount()}
              >
                Retry account access
              </Button>
              <Button type="button" asChild variant="outline">
                <Link href="/account-recovery">Account recovery</Link>
              </Button>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              autoComplete="email"
              disabled={isLoading || credentialsAccepted}
              type="email"
              placeholder="you@company.com"
              {...register("email")}
              aria-describedby={errors.email ? "email-error" : undefined}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p
                id="email-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              autoComplete="current-password"
              disabled={isLoading || credentialsAccepted}
              type="password"
              placeholder="Enter your password"
              {...register("password")}
              aria-describedby={errors.password ? "password-error" : undefined}
              aria-invalid={!!errors.password}
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
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || credentialsAccepted}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign In
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Don&apos;t have an account?{" "}
            <Link
              href={registerHref}
              className="text-primary underline underline-offset-4 hover:decoration-2"
            >
              Create one
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p role="status">Loading sign in…</p>}>
      <LoginForm />
    </Suspense>
  );
}
