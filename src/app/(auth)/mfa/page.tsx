"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogOut, ShieldCheck, ShieldEllipsis } from "lucide-react";
import { toast } from "sonner";
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
  CardTitle,
} from "@/components/ui/card";

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Not verified in this session";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not verified in this session";
  }

  return date.toLocaleString();
}

export default function MfaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeRedirectPath(searchParams.get("next"), null);
  const intent = searchParams.get("intent");
  const message = searchParams.get("message");
  const { logout } = useAuthStore();
  const utils = trpc.useUtils();
  const [isReady, setIsReady] = useState(false);
  const [isLoadingFactors, setIsLoadingFactors] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isStartingSetup, setIsStartingSetup] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [friendlyName, setFriendlyName] = useState("Primary authenticator");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [hasVerifiedTotp, setHasVerifiedTotp] = useState(false);
  const { data: sessionData, isLoading: sessionLoading } =
    trpc.auth.getSession.useQuery(undefined, {
      retry: false,
    });

  const dashboardPath = sessionData?.user
    ? getDashboardPath(sessionData.user.role)
    : "/login";
  const destination = next ?? dashboardPath;

  useEffect(() => {
    if (sessionLoading || !sessionData) {
      return;
    }

    if (!sessionData.isAuthenticated || !sessionData.user) {
      const redirectParam = next ? `?redirect=${encodeURIComponent(`/mfa?next=${next}`)}` : "";
      router.replace(`/login${redirectParam}`);
      return;
    }

    useAuthStore.getState().setUser(sessionData.user);

    if (
      shouldAutoRedirectFromMfa({
        currentLevel: sessionData.user.assurance?.currentLevel,
        recentVerificationSatisfied:
          sessionData.user.assurance?.recentVerificationSatisfied,
        next,
        intent,
      })
    ) {
      router.replace(destination);
      router.refresh();
      return;
    }

    setHasVerifiedTotp(sessionData.user.assurance?.hasVerifiedTotp ?? false);
    setIsReady(true);
  }, [destination, intent, next, router, sessionData, sessionLoading]);

  useEffect(() => {
    if (!isReady || !sessionData?.user) {
      return;
    }

    let isCancelled = false;

    const loadFactors = async () => {
      setIsLoadingFactors(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) {
          throw error;
        }

        if (isCancelled) {
          return;
        }

        setHasVerifiedTotp(data.totp.length > 0);
        setFactorId(data.totp[0]?.id ?? null);
      } catch {
        if (!isCancelled) {
          toast.error("We could not load your authenticator factors.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingFactors(false);
        }
      }
    };

    loadFactors();

    return () => {
      isCancelled = true;
    };
  }, [isReady, sessionData?.user]);

  const handleStartSetup = async () => {
    setIsStartingSetup(true);
    try {
      const supabase = createClient();
      const { data: factors, error: factorError } =
        await supabase.auth.mfa.listFactors();
      if (factorError) {
        throw factorError;
      }

      const pendingTotpFactors = factors.all.filter(
        (factor) =>
          factor.factor_type === "totp" && factor.status !== "verified",
      );

      for (const factor of pendingTotpFactors) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: friendlyName.trim() || "Primary authenticator",
        issuer: "PlankMarket",
      });

      if (error) {
        throw error;
      }

      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setCode("");
      toast.success("Authenticator setup is ready.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We could not start MFA setup.",
      );
    } finally {
      setIsStartingSetup(false);
    }
  };

  const handleVerify = async () => {
    if (!factorId || code.trim().length < 6) {
      toast.error("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setIsVerifying(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });

      if (error) {
        throw error;
      }

      await utils.invalidate();
      const refreshedSession = await utils.auth.getSession.fetch();
      if (refreshedSession.isAuthenticated && refreshedSession.user) {
        useAuthStore.getState().setUser(refreshedSession.user);
      }

      toast.success("Security check complete.");
      router.replace(destination);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We could not verify that authenticator code.",
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      logout();
      router.replace("/login");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  };

  if (!isReady || sessionLoading) {
    return (
      <Card className="w-full max-w-lg">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const assurance = sessionData?.user?.assurance;
  const role = sessionData?.user?.role ?? "buyer";
  const requiresMfaForRole = role === "admin";

  return (
    <div className="w-full max-w-lg space-y-4">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            {hasVerifiedTotp ? (
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            ) : (
              <ShieldEllipsis className="h-5 w-5" aria-hidden="true" />
            )}
          </div>
          <CardTitle>Secure your session</CardTitle>
          <CardDescription>
            {hasVerifiedTotp
              ? "Enter the current code from your authenticator app to continue."
              : "Set up a TOTP authenticator before accessing admin or seller financial controls."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {message}
            </div>
          ) : null}

          <div className="grid gap-2 rounded-md border px-3 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Current assurance</span>
              <span className="font-medium uppercase">
                {assurance?.currentLevel ?? "aal1"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Last factor check</span>
              <span className="text-right">
                {formatTimestamp(assurance?.lastFactorVerificationAt)}
              </span>
            </div>
          </div>

          {isLoadingFactors ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : hasVerifiedTotp ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="mfa-code">Authenticator code</Label>
                <Input
                  id="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={isVerifying || code.trim().length < 6}
                onClick={handleVerify}
              >
                {isVerifying ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Verify and continue
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="factor-name">Authenticator name</Label>
                <Input
                  id="factor-name"
                  value={friendlyName}
                  onChange={(event) => setFriendlyName(event.target.value)}
                  placeholder="Primary authenticator"
                />
              </div>

              {qrCode ? (
                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex justify-center">
                    {/* Supabase supplies this enrollment QR as inline SVG data. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt="Authenticator QR code"
                      className="h-48 w-48 rounded-md border bg-white p-2"
                      src={`data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`}
                    />
                  </div>
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">Can&apos;t scan?</p>
                    <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
                      {secret}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="setup-code">Authenticator code</Label>
                    <Input
                      id="setup-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      value={code}
                      onChange={(event) =>
                        setCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={isVerifying || code.trim().length < 6}
                    onClick={handleVerify}
                  >
                    {isVerifying ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Finish setup
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  className="w-full"
                  disabled={isStartingSetup}
                  onClick={handleStartSetup}
                >
                  {isStartingSetup ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Start authenticator setup
                </Button>
              )}

              <p className="text-sm text-muted-foreground">
                {requiresMfaForRole
                  ? "Admin sessions require MFA before any dashboard access."
                  : "Seller payout and account-management actions require MFA before they can continue."}
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSigningOut}
            onClick={handleSignOut}
          >
            {isSigningOut ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Sign out
          </Button>
          <Link
            href="/account-recovery?reason=mfa"
            className="text-center text-sm text-muted-foreground underline underline-offset-4"
          >
            Need help recovering access?
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
