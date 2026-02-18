"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";
import Link from "next/link";

export default function SellerVerificationPage() {
  const { user } = useAuthStore();
  const utils = trpc.useUtils();

  const resubmitMutation = trpc.auth.resubmitVerification.useMutation({
    onSuccess: () => {
      toast.success("Verification resubmitted successfully!");
      utils.auth.getSession.invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const status = user.verificationStatus;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Seller Verification</h1>
        <p className="text-muted-foreground mt-1">
          Verify your business to build trust with buyers
        </p>
      </div>

      {/* Unverified State */}
      {status === "unverified" && (
        <Card>
          <CardHeader>
            <CardTitle>Get Verified</CardTitle>
            <CardDescription>
              Submit your business documents to become a verified seller.
              Verification is typically completed during registration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              <h3 className="font-medium text-sm">Why get verified?</h3>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                <li>Build trust with potential buyers</li>
                <li>Increase visibility in search results</li>
                <li>Display a verified badge on your listings</li>
                <li>Access to priority support</li>
              </ul>
            </div>
            <div className="mt-4">
              <Button asChild>
                <Link href="/seller/settings">Complete Business Info</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending State */}
      {status === "pending" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Verification Under Review</CardTitle>
                <CardDescription>
                  Your verification request is being processed
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="bg-yellow-50 text-yellow-700 border-yellow-200"
              >
                <Clock className="h-3 w-3 mr-1" />
                Pending
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-4 border border-blue-200 dark:border-blue-900">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-blue-900 dark:text-blue-100">
                    Usually verified within minutes
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Our AI verification system reviews your submission automatically.
                    This page will update when your verification is complete.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-sm font-medium mb-2">While you wait, you can:</p>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                <li><Link href="/seller/settings" className="text-primary hover:underline">Complete your profile</Link></li>
                <li><Link href="/preferences" className="text-primary hover:underline">Set your preferences</Link></li>
                <li><Link href="/seller/stripe-onboarding" className="text-primary hover:underline">Connect Stripe</Link></li>
                <li><Link href="/seller/listings/new" className="text-primary hover:underline">Draft a listing</Link></li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Verified State */}
      {status === "verified" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Your Account is Verified</CardTitle>
                <CardDescription>
                  You are now a verified seller on PlankMarket
                </CardDescription>
              </div>
              <Badge className="bg-green-50 text-green-700 border-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-4 border border-green-200 dark:border-green-900">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-green-900 dark:text-green-100">
                    Verification Complete
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    Your verified badge will appear on all your listings and
                    profile. Buyers will see you as a trusted seller.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rejected State */}
      {status === "rejected" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Verification Not Approved</CardTitle>
                <CardDescription>
                  Your verification request was not approved
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="bg-red-50 text-red-700 border-red-200"
              >
                <XCircle className="h-3 w-3 mr-1" />
                Rejected
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-4 border border-red-200 dark:border-red-900">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-500 mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-red-900 dark:text-red-100">
                    Reason for rejection
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    The submitted documents did not meet our verification requirements.
                    Please ensure all documents are clear, valid, and match your business information.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => resubmitMutation.mutate({})}
                disabled={resubmitMutation.isPending}
                className="flex-1"
              >
                {resubmitMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Resubmit Verification
              </Button>
              <Button variant="outline" className="flex-1" asChild>
                <Link href="/support">Contact Support</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
