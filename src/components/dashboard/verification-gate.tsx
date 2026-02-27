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

  if (isLoading || !user) {
    return null;
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
