"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  BillingActionControls,
  BillingStatusFeedback,
  useBillingStatus,
} from "@/components/subscription/pro-subscription-action";
import { isPro } from "@/lib/pro";
import { formatCurrency, formatDate } from "@/lib/utils";

const statusLabels: Record<string, string> = {
  free: "Free",
  active: "Active",
  trialing: "Trial",
  past_due: "Payment needs attention",
  cancelled: "Cancelled",
};
const control = "h-auto min-h-11 whitespace-normal px-4 py-2 text-center";

function SubscriptionWorkspace() {
  const billing = useBillingStatus();
  const data = billing.data;
  const current = billing.phase === "ready";
  const proAccess =
    current && data ? isPro(data) : billing.hadProAccess === true;
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">Subscription</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your Pro access and billing.
        </p>
      </div>
      <BillingStatusFeedback billing={billing} showRefreshReady />
      {data && (
        <Card aria-label="Subscription status">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {current ? "Current plan" : "Last checked plan"}
              </h2>
              <Badge
                variant={
                  current && data.proStatus === "past_due"
                    ? "destructive"
                    : "outline"
                }
              >
                {current ? "" : "Last known: "}
                {statusLabels[data.proStatus]}
              </Badge>
            </div>
            <p className="text-sm">
              {current ? "Current access: " : "Last known access: "}
              {proAccess ? "Pro" : "Free"}
            </p>
            {current && data.proStatus === "past_due" && (
              <p className="text-sm">
                A payment needs attention. Open billing to review your payment
                method and invoices.
              </p>
            )}
            {current && data.proStatus === "cancelled" && !proAccess && (
              <p className="text-sm text-muted-foreground">
                Your Pro access has ended. Your billing history remains
                available when a billing account is recorded.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-3 text-sm">
              {data.proStartedAt && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium">Member since:</dt>
                  <dd>{formatDate(data.proStartedAt)}</dd>
                </div>
              )}
              {data.proStatus === "cancelled" &&
                proAccess &&
                data.proExpiresAt && (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium">Access until:</dt>
                    <dd>{formatDate(data.proExpiresAt)}</dd>
                  </div>
                )}
              {data.availableCredit > 0 && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium">Promotion credit:</dt>
                  <dd>{formatCurrency(data.availableCredit)}</dd>
                </div>
              )}
            </dl>
            <BillingActionControls billing={billing} mode="manage" />
            {current && !proAccess && (
              <Button asChild variant="gold" className={control}>
                <Link href="/pro">View Pro plans</Link>
              </Button>
            )}
            {current && data.hasBillingAccount && (
              <p className="text-sm text-muted-foreground">
                Billing opens securely in Stripe. Review invoices, payment
                methods and renewal details there, even after Pro access ends.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function SubscriptionSettingsPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-4 py-8">
          Checking subscription status…
        </p>
      }
    >
      <SubscriptionWorkspace />
    </Suspense>
  );
}
