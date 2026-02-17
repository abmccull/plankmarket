"use client";

import { useAuthStore } from "@/lib/stores/auth-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, XCircle, CheckCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { useEffect } from "react";
import { celebrateMilestone } from "@/lib/utils/celebrate";
import { VerificationPendingBanner } from "./verification-pending-banner";

interface VerificationGateProps {
  children: React.ReactNode;
}

const ALLOWED_PENDING_PATHS = [
  "/seller/settings",
  "/seller/verification",
  "/seller/listings/new",
  "/preferences",
  "/seller/stripe-onboarding",
  "/buyer/settings",
  "/listings",
];

export function VerificationGate({ children }: VerificationGateProps) {
  const { user, isLoading, setUser } = useAuthStore();
  const pathname = usePathname();

  // Poll for session updates every 5 seconds when pending
  const { data: sessionData } = trpc.auth.getSession.useQuery(undefined, {
    refetchInterval: user?.verificationStatus === "pending" ? 5000 : false,
    enabled: user?.verificationStatus === "pending",
  });

  // Auto-update auth store when verification status changes
  useEffect(() => {
    if (sessionData?.user && user && sessionData.user.verificationStatus !== user.verificationStatus) {
      if (sessionData.user.verificationStatus === "verified" && user.verificationStatus === "pending") {
        celebrateMilestone("You're Verified!", "Your business has been verified. You now have full access to PlankMarket.");
      }
      setUser(sessionData.user);
    }
  }, [sessionData, user, setUser]);

  // Wait for auth to load
  if (isLoading || !user) {
    return null;
  }

  // Admins bypass verification
  if (user.role === "admin") {
    return <>{children}</>;
  }

  // Verified users see normal dashboard
  if (user.verificationStatus === "verified") {
    return <>{children}</>;
  }

  // Pending verification - allow specific routes
  if (user.verificationStatus === "pending") {
    const isAllowedPath = ALLOWED_PENDING_PATHS.some((path) => pathname.startsWith(path));

    if (isAllowedPath) {
      return (
        <>
          <VerificationPendingBanner />
          {children}
        </>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-blue-100 p-3 relative">
                <Clock className="h-8 w-8 text-blue-600" aria-hidden="true" />
                <Loader2 className="h-4 w-4 text-blue-400 animate-spin absolute -bottom-1 -right-1" aria-hidden="true" />
              </div>
            </div>
            <CardTitle className="text-2xl">Your Business Verification is Under Review</CardTitle>
            <CardDescription className="text-base">
              We&apos;re reviewing your application. This is usually verified within minutes.
              This page will automatically update once approved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-lg">Get started while you wait</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href={user.role === "seller" ? "/seller/settings" : "/buyer/settings"} className="flex items-start gap-3 rounded-lg p-2 hover:bg-accent transition-colors">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium">Set up your profile</p>
                    <p className="text-sm text-muted-foreground">
                      Complete your business profile and contact information
                    </p>
                  </div>
                </Link>
                <Link href="/preferences" className="flex items-start gap-3 rounded-lg p-2 hover:bg-accent transition-colors">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium">Set your preferences</p>
                    <p className="text-sm text-muted-foreground">
                      Configure your matching preferences for better recommendations
                    </p>
                  </div>
                </Link>
                <Link href="/listings" className="flex items-start gap-3 rounded-lg p-2 hover:bg-accent transition-colors">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium">Browse listings</p>
                    <p className="text-sm text-muted-foreground">
                      Explore available flooring inventory
                    </p>
                  </div>
                </Link>
                {user.role === "seller" && (
                  <>
                    <Link href="/seller/listings/new" className="flex items-start gap-3 rounded-lg p-2 hover:bg-accent transition-colors">
                      <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                      <div>
                        <p className="font-medium">Draft a listing</p>
                        <p className="text-sm text-muted-foreground">
                          Prepare your first listing — it will go live after verification
                        </p>
                      </div>
                    </Link>
                    <Link href="/seller/stripe-onboarding" className="flex items-start gap-3 rounded-lg p-2 hover:bg-accent transition-colors">
                      <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                      <div>
                        <p className="font-medium">Connect Stripe</p>
                        <p className="text-sm text-muted-foreground">
                          Set up payments so you can receive funds from sales
                        </p>
                      </div>
                    </Link>
                    <Link href="/seller-guide" className="flex items-start gap-3 rounded-lg p-2 hover:bg-accent transition-colors">
                      <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                      <div>
                        <p className="font-medium">Read the seller guide</p>
                        <p className="text-sm text-muted-foreground">
                          Tips for pricing, photos, and getting your first sale
                        </p>
                      </div>
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Rejected verification
  if (user.verificationStatus === "rejected") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-red-100 p-3">
                <XCircle className="h-8 w-8 text-red-600" aria-hidden="true" />
              </div>
            </div>
            <CardTitle className="text-2xl">Your Business Verification Was Not Approved</CardTitle>
            <CardDescription className="text-base">
              We were unable to verify your business information at this time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  You can resubmit your verification with updated documents, or contact our support team for assistance.
                </p>
              </CardContent>
            </Card>
            <div className="flex justify-center gap-3">
              <Button asChild>
                <Link href={user.role === "seller" ? "/seller/verification" : "/buyer/settings"}>Resubmit Verification</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/support">Contact Support</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Unverified (shouldn't happen with new flow, but handle it)
  if (user.verificationStatus === "unverified") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-yellow-100 p-3">
                <Clock className="h-8 w-8 text-yellow-600" aria-hidden="true" />
              </div>
            </div>
            <CardTitle className="text-2xl">Complete Your Business Verification</CardTitle>
            <CardDescription className="text-base">
              To access the full dashboard, please complete your business verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link href="/settings">Complete Verification</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Default fallback: render children
  return <>{children}</>;
}
