"use client";

import { useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, CreditCard, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { celebrateMilestone } from "@/lib/utils/celebrate";

export default function StripeOnboardingPage() {
  const searchParams = useSearchParams();
  const isSuccess = searchParams.get("success") === "true";

  const { data: status, isLoading } =
    trpc.payment.getConnectStatus.useQuery();
  const createAccount = trpc.payment.createConnectAccount.useMutation();
  const createLoginLink = trpc.payment.createLoginLink.useMutation();

  useEffect(() => {
    if (isSuccess) {
      celebrateMilestone(
        "Stripe Connected!",
        "You can now receive payments from buyers on PlankMarket."
      );
    }
    // Only fire once on mount when success param is present
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOnboard = async () => {
    try {
      const result = await createAccount.mutateAsync();
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to start onboarding";
      toast.error(message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Payment Setup</h1>
        <p className="text-muted-foreground mt-1">
          Connect your Stripe account to receive payouts
        </p>
      </div>

      {isSuccess && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-emerald-600" />
          <div>
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-400">
              Stripe setup in progress
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-500">
              Your account is being reviewed by Stripe. This usually takes a
              few minutes.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Stripe Connect
          </CardTitle>
          <CardDescription>
            We use Stripe to securely process payments and send you payouts.
            A 2% seller fee is deducted from each transaction.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Account Status</span>
            {status?.onboardingComplete ? (
              <Badge variant="success">
                <CheckCircle className="mr-1 h-3 w-3" />
                Active
              </Badge>
            ) : status?.connected ? (
              <Badge variant="warning">
                <AlertCircle className="mr-1 h-3 w-3" />
                Setup Incomplete
              </Badge>
            ) : (
              <Badge variant="outline">Not Connected</Badge>
            )}
          </div>

          {status?.connected && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Can accept payments
                </span>
                <span>
                  {status.chargesEnabled ? "Yes" : "No"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Can receive payouts
                </span>
                <span>
                  {status.payoutsEnabled ? "Yes" : "No"}
                </span>
              </div>
            </>
          )}

          {!status?.onboardingComplete && (
            <Button
              onClick={handleOnboard}
              disabled={createAccount.isPending}
              className="w-full"
            >
              {createAccount.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {status?.connected
                ? "Complete Setup"
                : "Connect Stripe Account"}
            </Button>
          )}

          {status?.onboardingComplete && status?.pastDue && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                  Stripe requires updated information
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-500">
                  Your account has been restricted. Please update your payment
                  details to continue receiving payouts.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleOnboard}
                disabled={createAccount.isPending}
              >
                {createAccount.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Update Info
              </Button>
            </div>
          )}

          {status?.onboardingComplete && (
            <>
              <Button
                variant="outline"
                className="w-full"
                disabled={createLoginLink.isPending}
                onClick={async () => {
                  try {
                    const result = await createLoginLink.mutateAsync();
                    if (result.url) {
                      window.open(result.url, "_blank");
                    }
                  } catch (error: unknown) {
                    const message =
                      error instanceof Error
                        ? error.message
                        : "Failed to open Stripe dashboard";
                    toast.error(message);
                  }
                }}
              >
                {createLoginLink.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                View Stripe Dashboard
              </Button>
              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                Your Stripe account is fully set up. Payouts will be
                processed automatically after successful orders.
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
