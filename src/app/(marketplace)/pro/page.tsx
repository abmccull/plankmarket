import type { Metadata } from "next";
import Link from "next/link";
import { Check, LogIn, UserPlus } from "lucide-react";
import { ProBadge } from "@/components/pro-badge";
import { ProSubscriptionAction } from "@/components/subscription/pro-subscription-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isPro } from "@/lib/pro";
import {
  type BillingInterval,
  resolveBillingInterval,
} from "@/lib/pro-pricing";
import { createServerCaller } from "@/lib/trpc/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "PlankMarket Pro - Advanced Buyer and Seller Tools",
  description:
    "Compare Free and Pro on PlankMarket. Pro adds unlimited listings and saved searches, saved-search monitoring and repricing tools, market intelligence, seller followups, bulk upload, promotion credit, and the Pro badge.",
  alternates: {
    canonical: "/pro",
  },
  openGraph: {
    title: "PlankMarket Pro",
    description:
      "Optional Pro access for power users who want unlimited listings or saved searches, saved-search monitoring and repricing tools, market intelligence, seller followups, and bulk upload.",
  },
};

const FREE_FEATURES = [
  "10 active listings",
  "3 saved searches",
  "AI-assisted search & listing creation",
  "AI offer insights",
  "Marketplace transaction fees shown separately by role",
  "Unlimited transactions",
] as const;

const PRO_FEATURES = [
  "Unlimited active listings",
  "Unlimited saved searches",
  "Saved-search monitoring and seller repricing tools",
  "Market intelligence (pricing data, demand signals, competitive position)",
  "Seller CRM (tags, notes, followups)",
  "Bulk CSV import",
  "$15/month promotion credit",
  "Pro badge on profile",
] as const;

type ProPageProps = {
  searchParams: Promise<{ interval?: string }>;
};

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

function BillingToggle({ interval }: { interval: BillingInterval }) {
  return (
    <div className="mt-8 flex items-center justify-center gap-3">
      <Link
        href="/pro?interval=monthly"
        className={cn(
          "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
          interval === "monthly"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-current={interval === "monthly" ? "page" : undefined}
      >
        Monthly
      </Link>
      <Link
        href="/pro?interval=annual"
        className={cn(
          "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
          interval === "annual"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-current={interval === "annual" ? "page" : undefined}
      >
        Annual
      </Link>
      {interval === "annual" && (
        <Badge variant="success" className="ml-1">
          Save $99
        </Badge>
      )}
    </div>
  );
}

export default async function ProPricingPage({ searchParams }: ProPageProps) {
  const params = await searchParams;
  const interval = resolveBillingInterval(params.interval);
  const caller = await createServerCaller();
  const session = await caller.auth.getSession();
  const isAuthenticated = session.isAuthenticated;

  let hasProAccess = false;

  if (isAuthenticated) {
    const status = await caller.subscription.getStatus();
    hasProAccess = isPro({
      proStatus: status.proStatus,
      proExpiresAt: status.proExpiresAt
        ? new Date(status.proExpiresAt)
        : null,
    });
  }

  if (hasProAccess) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-6 w-6 text-emerald-600" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">
                You&apos;re a Pro member{" "}
                <ProBadge className="ml-1 align-middle" />
              </h1>
              <p className="text-muted-foreground">
                You have access to all Pro features.
              </p>
            </div>
            <div className="flex justify-center">
              <ProSubscriptionAction mode="manage" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-12">
      <div className="text-center">
        <h1 className="text-display-md">PlankMarket Pro</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Unlock advanced tools to buy and sell smarter on PlankMarket.
          Marketplace transaction fees remain separate from Pro.
        </p>
      </div>

      <BillingToggle interval={interval} />

      <div className="mt-10 grid gap-6 md:grid-cols-2">
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
            {interval === "annual" ? (
              <p className="mt-1 text-sm text-muted-foreground">
                $20.75/month, billed annually
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Everything in Free, plus:
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <FeatureList features={PRO_FEATURES} />
            {isAuthenticated ? (
              <ProSubscriptionAction interval={interval} mode="subscribe" />
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
                  Pro checkout starts after you sign in to your buyer or seller
                  account.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
