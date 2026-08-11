"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";
import { celebrateMilestone } from "@/lib/utils/celebrate";
import { VerificationPendingBanner } from "./verification-pending-banner";

interface VerificationGateProps {
  children: React.ReactNode;
}

interface DashboardAccessStateProps {
  title: string;
  description: string;
}

function DashboardAccessState({
  title,
  description,
}: DashboardAccessStateProps) {
  return (
    <div className="mx-auto flex min-h-[400px] max-w-3xl flex-col justify-center">
      <Card
        role="status"
        aria-live="polite"
        className="border-border/60 bg-gradient-to-br from-background via-background to-muted/30 shadow-sm"
      >
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4 rounded-xl border border-border/60 bg-muted/40 p-4">
            <div
              aria-hidden="true"
              className="h-11 w-11 animate-pulse rounded-full bg-primary/10"
            />
            <div className="flex-1 space-y-3">
              <div
                aria-hidden="true"
                className="h-3 w-40 animate-pulse rounded-full bg-muted-foreground/20"
              />
              <div
                aria-hidden="true"
                className="h-3 w-full animate-pulse rounded-full bg-muted-foreground/15"
              />
              <div
                aria-hidden="true"
                className="h-3 w-5/6 animate-pulse rounded-full bg-muted-foreground/15"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
            <div className="h-24 animate-pulse rounded-xl border border-dashed border-border/60 bg-muted/30" />
            <div className="h-24 animate-pulse rounded-xl border border-dashed border-border/60 bg-muted/30" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function VerificationGate({ children }: VerificationGateProps) {
  const { user, isLoading, setUser } = useAuthStore();

  const { data: sessionData } = trpc.auth.getSession.useQuery(undefined, {
    refetchInterval: user?.verificationStatus === "pending" ? 5000 : false,
    enabled: user?.verificationStatus === "pending",
  });

  useEffect(() => {
    if (!sessionData?.user || !user) return;
    if (sessionData.user.verificationStatus === user.verificationStatus) return;

    if (
      sessionData.user.verificationStatus === "verified" &&
      user.verificationStatus === "pending"
    ) {
      celebrateMilestone(
        "You're Verified!",
        "Your business has been verified. Transaction routes are now unlocked.",
      );
    }
    setUser(sessionData.user);
  }, [sessionData, user, setUser]);

  if (isLoading) {
    return (
      <DashboardAccessState
        title="Checking your dashboard access"
        description="We’re syncing your session, role, and verification status before loading protected tools."
      />
    );
  }

  if (!user) {
    return (
      <DashboardAccessState
        title="Redirecting to secure sign in"
        description="Your dashboard session is not available here, so we’re handing you back to the protected sign-in flow."
      />
    );
  }

  if (user.role === "admin" || user.verificationStatus === "verified") {
    return <>{children}</>;
  }

  const ctaHref =
    user.role === "seller" ? "/seller/verification" : "/buyer/settings";
  const ctaText =
    user.role === "seller"
      ? "Submit Seller Verification"
      : "Submit Buyer Verification";

  return (
    <>
      {user.verificationStatus === "pending" ? (
        <VerificationPendingBanner />
      ) : (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>
              {user.verificationStatus === "rejected"
                ? "Verification Rejected"
                : "Verification Required for Transactions"}
            </CardTitle>
            <CardDescription>
              {user.role === "seller"
                ? "You can explore the platform now. Verification approval is required before creating listings."
                : "You can browse and message now. Verification approval is required before checkout."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={ctaHref}>{ctaText}</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {children}
    </>
  );
}
