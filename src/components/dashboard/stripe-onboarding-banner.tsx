"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreditCard, X, ExternalLink } from "lucide-react";

const BANNER_DISMISSED_KEY = "stripe-onboarding-banner-dismissed";

function subscribeToStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

export function StripeOnboardingBanner() {
  const accountId = useAuthStore((state) => state.user?.id);
  const dismissalScope = accountId ?? "current-session";
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const persistedDismissal = useSyncExternalStore(
    subscribeToStorage,
    () => {
      if (!accountId) return false;
      try {
        return sessionStorage.getItem(`${BANNER_DISMISSED_KEY}:${accountId}`) === "true";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const isDismissed = dismissedFor === dismissalScope || persistedDismissal;

  const router = useRouter();
  const { data: connectStatus, isLoading, isError, isFetching, refetch } = trpc.payment.getConnectStatus.useQuery();

  const handleSetUpPayments = () => {
    router.push("/seller/payments");
  };

  const handleDismiss = () => {
    setDismissedFor(dismissalScope);
    if (!accountId) return;
    try {
      sessionStorage.setItem(`${BANNER_DISMISSED_KEY}:${accountId}`, "true");
    } catch {
      // Dismissal still works for the current component session.
    }
  };

  // Don't show banner if loading, dismissed, or already onboarded
  if (isLoading || isDismissed) {
    return null;
  }

  if (isError || !connectStatus) {
    return (
      <section role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4">
        <p className="text-sm">We couldn’t check your payment account status.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? "Trying again…" : "Retry payment status"}</Button>
          <Button asChild variant="outline" className="min-h-11"><Link href="/seller/payments">View payments</Link></Button>
        </div>
      </section>
    );
  }
  if (connectStatus.onboardingComplete) return null;

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
                size="sm"
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                Set Up Now
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
