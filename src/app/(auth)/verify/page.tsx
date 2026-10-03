"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Mail, Loader2 } from "lucide-react";

const COOLDOWN_SECONDS = 60;
type Identity = { id: string; email: string };
function identityStatus(
  user: { id: string; email?: string; email_confirmed_at?: string } | null,
) {
  return user
    ? JSON.stringify([
        user.id,
        user.email ?? null,
        user.email_confirmed_at ?? null,
      ])
    : null;
}
type View =
  | { kind: "checking" | "error" | "anonymous" }
  | ({ kind: "pending" | "confirmed" } & Identity);

export default function VerifyPage() {
  const [view, setView] = useState<View>({ kind: "checking" });
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const observedIdentity = useRef<string | null | undefined>(undefined);
  const pendingRequest = useRef<symbol | null>(null);

  const readIdentity = useCallback(async () => {
    const attempt = ++generation.current;
    setView({ kind: "checking" });
    setProblem(null);
    try {
      const client = createClient();
      const sessionResult = await client.auth.getSession();
      if (!active.current || generation.current !== attempt) return;
      if (sessionResult.error) {
        setView({ kind: "error" });
        return;
      }
      const session = sessionResult.data.session;
      observedIdentity.current = identityStatus(session?.user ?? null);
      if (!session) {
        setView({ kind: "anonymous" });
        return;
      }
      const {
        data: { user },
        error,
      } = await client.auth.getUser();
      if (!active.current || generation.current !== attempt) return;
      if (error || !user?.email || user.id !== session.user.id) {
        setView({ kind: "error" });
        return;
      }
      observedIdentity.current = identityStatus(user);
      setView({
        kind: user.email_confirmed_at ? "confirmed" : "pending",
        id: user.id,
        email: user.email,
      });
    } catch {
      if (active.current && generation.current === attempt)
        setView({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    active.current = true;
    void readIdentity();
    const {
      data: { subscription },
    } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      const identity = identityStatus(session?.user ?? null);
      if (identity === observedIdentity.current) return;
      observedIdentity.current = identity;
      generation.current += 1;
      pendingRequest.current = null;
      setIsResending(false);
      setCooldown(0);
      setNotice(null);
      setProblem(null);
      setView({ kind: "checking" });
      // SDK auth callbacks hold its lock; check the new account after it releases.
      setTimeout(() => {
        if (active.current) void readIdentity();
      }, 0);
    });
    return () => {
      active.current = false;
      generation.current += 1;
      subscription.unsubscribe();
    };
  }, [readIdentity]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (view.kind !== "pending" || cooldown > 0 || pendingRequest.current)
      return;
    const identity = view;
    const attempt = generation.current;
    const token = Symbol("verification-request");
    pendingRequest.current = token;
    const isCurrent = () =>
      active.current &&
      generation.current === attempt &&
      pendingRequest.current === token;
    setIsResending(true);
    setProblem(null);
    setNotice(null);
    try {
      const client = createClient();
      const {
        data: { user },
        error: readError,
      } = await client.auth.getUser();
      if (!isCurrent()) return;
      if (
        readError ||
        !user?.email ||
        user.id !== identity.id ||
        user.email !== identity.email
      ) {
        setView({ kind: "error" });
        return;
      }
      if (user.email_confirmed_at) {
        setView({ kind: "confirmed", id: user.id, email: user.email });
        return;
      }
      const { error } = await client.auth.resend({
        type: "signup",
        email: user.email,
      });
      if (!isCurrent()) return;
      if (error) {
        setProblem(
          "We could not confirm this request. Check your inbox before requesting another link, or try again when you are ready.",
        );
        return;
      }
      setNotice(
        "A new verification link has been requested. Check your inbox and spam folder.",
      );
      setCooldown(COOLDOWN_SECONDS);
    } catch {
      if (isCurrent())
        setProblem(
          "We could not confirm this request. Check your inbox before requesting another link, or try again when you are ready.",
        );
    } finally {
      if (isCurrent()) {
        pendingRequest.current = null;
        setIsResending(false);
      }
    }
  };

  const title =
    view.kind === "checking"
      ? "Checking your account"
      : view.kind === "error"
        ? "Account access unavailable"
        : view.kind === "anonymous"
          ? "Sign in to verify your email"
          : view.kind === "confirmed"
            ? "Email verified"
            : "Verify your email";
  return (
    <Card className="w-full max-w-md text-center">
      <CardHeader className="p-[min(1.5rem,24px)]">
        <Mail
          className="mx-auto mb-3 h-8 w-8 text-primary"
          aria-hidden="true"
        />
        <h1 className="text-2xl font-semibold leading-none tracking-tight">
          {title}
        </h1>
        <CardDescription>
          {view.kind === "checking"
            ? "Checking which account needs verification."
            : view.kind === "error"
              ? "We could not check your current account. Retry before requesting another verification link."
              : view.kind === "anonymous"
                ? "Sign in to check whether your account needs email verification."
                : view.kind === "confirmed"
                  ? "This account's email address is verified. You can continue browsing the marketplace."
                  : "Use the verification link requested during sign-up. If you need another link, request one below."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-[min(1.5rem,24px)] pt-0">
        {(view.kind === "pending" || view.kind === "confirmed") && (
          <p className="break-all text-sm font-medium">{view.email}</p>
        )}
        {view.kind === "checking" && (
          <Loader2
            className="mx-auto h-5 w-5 animate-spin"
            aria-label="Checking account"
          />
        )}
        {view.kind === "error" && (
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-11 w-full whitespace-normal"
            onClick={() => void readIdentity()}
          >
            Retry account check
          </Button>
        )}
        {view.kind === "anonymous" && (
          <Button asChild className="h-auto min-h-11 w-full whitespace-normal">
            <Link href="/login">Sign in</Link>
          </Button>
        )}
        {view.kind === "confirmed" && (
          <Button asChild className="h-auto min-h-11 w-full whitespace-normal">
            <Link href="/listings">Browse flooring</Link>
          </Button>
        )}
        {view.kind === "pending" && (
          <>
            {notice && (
              <p role="status" className="text-sm">
                {notice}
              </p>
            )}
            {problem && (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-11 w-full whitespace-normal"
              onClick={() => void handleResend()}
              disabled={isResending || cooldown > 0}
            >
              {isResending && (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {cooldown > 0
                ? `Request again in ${cooldown}s`
                : "Request another verification link"}
            </Button>
          </>
        )}
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm text-muted-foreground">Need help?</p>
          <a
            href="mailto:support@plankmarket.com"
            className="text-sm text-primary hover:underline"
          >
            Contact support
          </a>
        </div>
        <Button
          asChild
          variant="ghost"
          className="h-auto min-h-11 w-full whitespace-normal"
        >
          <Link href="/login">Back to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
