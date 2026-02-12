"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreditCard, X, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const BANNER_DISMISSED_KEY = "stripe-onboarding-banner-dismissed";

export function StripeOnboardingBanner() {
  const [isDismissed, setIsDismissed] = useState(() => {
    // Initialize state from sessionStorage
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(BANNER_DISMISSED_KEY) === "true";
    }
    return false;
  });
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  const { data: connectStatus, isLoading } = trpc.payment.getConnectStatus.useQuery();
  const createConnectAccount = trpc.payment.createConnectAccount.useMutation();

  const handleSetUpPayments = async () => {
    setIsCreatingAccount(true);
    try {
      const { url } = await createConnectAccount.mutateAsync();
      toast.success("Redirecting to Stripe...");
      window.location.href = url;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start Stripe onboarding";
      toast.error(message);
      setIsCreatingAccount(false);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem(BANNER_DISMISSED_KEY, "true");
    setIsDismissed(true);
  };

  // Don't show banner if loading, dismissed, or already onboarded
  if (isLoading || isDismissed || connectStatus?.onboardingComplete) {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2.5">
            <CreditCard className="h-5 w-5 text-amber-700 dark:text-amber-500" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  Set up payments to start receiving orders
                </h3>
                <p className="text-sm text-amber-800 dark:text-amber-200/80 mt-1">
                  Connect your Stripe account to accept payments. It only takes a few
                  minutes to get started.
                </p>
              </div>
              <button
                onClick={handleDismiss}
                className="shrink-0 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-opacity"
                aria-label="Dismiss banner"
              >
                <X className="h-4 w-4 text-amber-700 dark:text-amber-500" aria-hidden="true" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleSetUpPayments}
                disabled={isCreatingAccount}
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isCreatingAccount ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                    Set Up Now
                  </>
                )}
              </Button>
              <p className="text-xs text-amber-700 dark:text-amber-500">
                Powered by Stripe
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
