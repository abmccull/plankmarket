"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useProStatus } from "@/hooks/use-pro-status";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProBadge } from "@/components/pro-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Check, Loader2, LogIn, Settings, UserPlus } from "lucide-react";
import { getErrorMessage } from "@/lib/utils";

type BillingInterval = "monthly" | "annual";

const FREE_FEATURES = [
  "10 active listings",
  "3 saved searches",
  "AI-assisted search & listing creation",
  "AI offer insights",
  "Standard fees (3% buyer, 2% seller)",
  "Unlimited transactions",
] as const;

const PRO_FEATURES = [
  "Unlimited active listings",
  "Unlimited saved searches",
  "AI agent workflows (saved-search monitoring, auto-offers, repricing)",
  "Market intelligence (pricing data, demand signals, competitive position)",
  "Seller CRM (tags, notes, followups)",
  "Bulk CSV import",
  "$15/month promotion credit",
  "Priority verification (24hr)",
  "Pro badge on profile",
] as const;

function FeatureList({ features }: { features: readonly string[] }) {
  return (
    <ul className="space-y-2.5" role="list">
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-2 text-sm">
          <Check
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
            aria-hidden="true"
          />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ProPricingPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { isPro, isLoading: statusLoading } = useProStatus();
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const [isRedirecting, setIsRedirecting] = useState(false);

  const createCheckout = trpc.subscription.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error) => {
      setIsRedirecting(false);
      toast.error(getErrorMessage(error));
    },
  });

  const handleSubscribe = () => {
    setIsRedirecting(true);
    createCheckout.mutate({ interval });
  };

  if (authLoading || (isAuthenticated && statusLoading)) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-12">
        <div className="space-y-4 text-center">
          <Skeleton className="mx-auto h-10 w-64" />
          <Skeleton className="mx-auto h-5 w-96" />
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isPro) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-6 w-6 text-emerald-600" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">
                You&apos;re a Pro member <ProBadge className="ml-1 align-middle" />
              </h1>
              <p className="text-muted-foreground">
                You have access to all Pro features.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/settings/subscription">
                <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
                Manage Subscription
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-12">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-display-md">PlankMarket Pro</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Unlock advanced tools to buy and sell smarter on PlankMarket.
        </p>
      </div>

      {/* Billing toggle */}
      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setInterval("monthly")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            interval === "monthly"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          aria-pressed={interval === "monthly"}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setInterval("annual")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            interval === "annual"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          aria-pressed={interval === "annual"}
        >
          Annual
        </button>
        {interval === "annual" && (
          <Badge variant="success" className="ml-1">
            Save $99
          </Badge>
        )}
      </div>

      {/* Pricing cards */}
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {/* Free tier */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Free</CardTitle>
            <div className="mt-2">
              <span className="text-3xl font-bold">$0</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Get started with the essentials.
            </p>
          </CardHeader>
          <CardContent>
            <FeatureList features={FREE_FEATURES} />
          </CardContent>
        </Card>

        {/* Pro tier */}
        <Card className="relative border-primary">
          <div className="absolute left-0 right-0 top-0 h-1 rounded-t-xl bg-gradient-to-r from-primary to-secondary" />
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Pro</CardTitle>
              <ProBadge />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-bold">
                {interval === "monthly" ? "$29" : "$249"}
              </span>
              <span className="text-muted-foreground">
                /{interval === "monthly" ? "month" : "year"}
              </span>
            </div>
            {interval === "annual" && (
              <p className="mt-1 text-sm text-muted-foreground">
                $20.75/month, billed annually
              </p>
            )}
            {interval === "monthly" && (
              <p className="mt-1 text-sm text-muted-foreground">
                Everything in Free, plus:
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <FeatureList features={PRO_FEATURES} />
            {isAuthenticated ? (
              <Button
                className="mt-4 w-full"
                variant="gold"
                size="lg"
                onClick={handleSubscribe}
                disabled={isRedirecting}
              >
                {isRedirecting ? (
                  <>
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Redirecting to checkout...
                  </>
                ) : (
                  `Subscribe${interval === "annual" ? " & Save $99" : ""}`
                )}
              </Button>
            ) : (
              <div className="mt-4 space-y-3">
                <Button asChild className="w-full" variant="gold" size="lg">
                  <Link href="/register">
                    <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Create Account to Upgrade
                  </Link>
                </Button>
                <Button asChild className="w-full" variant="outline">
                  <Link href="/login">
                    <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
                    Sign In to Subscribe
                  </Link>
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Pro checkout starts after you sign in to your buyer or seller account.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
