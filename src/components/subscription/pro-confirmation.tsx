"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { isPro } from "@/lib/pro";
import { FEATURES } from "@/lib/feature-flags";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  QueryErrorState,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { ProSuccessActions } from "./pro-success-actions";

const features = [
  "Unlimited active listings",
  "Unlimited saved searches",
  "Seller offer automation and repricing tools",
  "Market intelligence",
  "Seller CRM",
  "Bulk CSV import",
  ...(FEATURES.PROMOTIONS_ENABLED ? ["$15/month promotion credit"] : []),
  "Pro badge on profile",
];

export function ProConfirmation({ returnPath }: { returnPath: string }) {
  const [automaticCheckComplete, setAutomaticCheckComplete] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setAutomaticCheckComplete(true), 30000);
    return () => clearTimeout(timer);
  }, []);
  const status = trpc.subscription.getStatus.useQuery(undefined, {
    retry: false,
    refetchInterval: (query) => {
      if (query.state.error || automaticCheckComplete) return false;
      return query.state.data && isPro(query.state.data) ? false : 5000;
    },
  });
  const signIn = `/login?redirect=${encodeURIComponent(returnPath)}`;
  return (
    <div className="container mx-auto max-w-2xl px-4 py-10 sm:py-16">
      {status.isLoading ? (
        <StatePanelLoading label="Checking your subscription" rows={2} />
      ) : status.isError ? (
        <QueryErrorState
          title={
            status.error.data?.code === "UNAUTHORIZED"
              ? "Sign in to check your subscription"
              : "We couldn't check your subscription"
          }
          description="We couldn't confirm your current subscription status. Check again before starting another purchase."
          onRetry={() => {
            void status.refetch();
          }}
          isRetrying={status.isFetching}
          secondaryAction={{
            label:
              status.error.data?.code === "UNAUTHORIZED"
                ? "Sign in"
                : "Get help",
            href:
              status.error.data?.code === "UNAUTHORIZED" ? signIn : "/contact",
          }}
        />
      ) : status.data && isPro(status.data) ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-6 p-6 text-center sm:p-8">
            <CheckCircle2
              aria-hidden="true"
              className="h-12 w-12 text-secondary"
            />
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Your Pro access is ready</h1>
              <p className="text-muted-foreground">
                Your account has access to these Pro tools.
              </p>
              {status.data.proStatus === "past_due" ? (
                <p className="text-sm font-medium">
                  A payment needs attention. Update your payment method in
                  subscription settings.
                </p>
              ) : null}
              {status.data.proStatus === "cancelled" &&
              status.data.proExpiresAt ? (
                <p className="text-sm">
                  Your paid access continues until{" "}
                  {new Date(status.data.proExpiresAt).toLocaleDateString(
                    "en-US",
                  )}
                  .
                </p>
              ) : null}
            </div>
            <ul className="w-full space-y-3 text-left text-sm">
              {features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <CheckCircle2
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-secondary"
                  />
                  {feature}
                </li>
              ))}
            </ul>
            <ProSuccessActions />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-5 p-6 sm:p-8">
            <Clock3 aria-hidden="true" className="h-10 w-10 text-primary" />
            <h1 className="text-2xl font-bold">
              Confirming your Pro subscription
            </h1>
            <p className="text-muted-foreground">
              Pro access is not confirmed on your account yet. If you just
              finished payment, the confirmation may still be arriving. You can
              keep using the marketplace while we check.
            </p>
            <p className="text-sm">
              Check your status before purchasing again. If it still hasn&apos;t
              updated, contact support with your payment receipt.
            </p>
            {automaticCheckComplete && (
              <p role="status" className="text-sm font-medium">
                Automatic checking has finished. You can check again or contact
                support.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  void status.refetch();
                }}
                disabled={status.isFetching}
              >
                {status.isFetching ? "Checking…" : "Check status"}
              </Button>
              <Button asChild variant="outline">
                <Link href="/listings">Browse flooring</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/contact">Get help</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
