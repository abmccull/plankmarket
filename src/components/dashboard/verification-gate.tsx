"use client";

import { useAuthStore } from "@/lib/stores/auth-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, XCircle, CheckCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface VerificationGateProps {
  children: React.ReactNode;
}

export function VerificationGate({ children }: VerificationGateProps) {
  const { user, isLoading } = useAuthStore();

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

  // Pending verification
  if (user.verificationStatus === "pending") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-blue-100 p-3">
                <Clock className="h-8 w-8 text-blue-600" aria-hidden="true" />
              </div>
            </div>
            <CardTitle className="text-2xl">Your Business Verification is Under Review</CardTitle>
            <CardDescription className="text-base">
              We&apos;re reviewing your application. This typically takes 1-2 business days. You&apos;ll be notified once approved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-lg">What you can do while waiting</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium">Set up your profile</p>
                    <p className="text-sm text-muted-foreground">
                      Complete your business profile and preferences
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium">Browse listings</p>
                    <p className="text-sm text-muted-foreground">
                      Explore available flooring inventory
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium">Review our guides</p>
                    <p className="text-sm text-muted-foreground">
                      Learn how to get the most out of PlankMarket
                    </p>
                  </div>
                </div>
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
                  If you believe this is an error or would like to provide additional information, please contact our support team.
                </p>
              </CardContent>
            </Card>
            <div className="flex justify-center">
              <Button asChild>
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
