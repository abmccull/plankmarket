"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useProStatus } from "@/hooks/use-pro-status";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProBadge } from "@/components/pro-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { formatCurrency, formatDate, getErrorMessage } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <Badge variant="success">Active</Badge>;
    case "trialing":
      return <Badge variant="info">Trial</Badge>;
    case "cancelled":
      return <Badge variant="warning">Cancelled</Badge>;
    case "past_due":
      return <Badge variant="destructive">Past Due</Badge>;
    default:
      return <Badge variant="outline">Free</Badge>;
  }
}

export default function SubscriptionSettingsPage() {
  const { isPro, proStatus, proExpiresAt, availableCredit, isLoading } =
    useProStatus();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const { data: statusData } = trpc.subscription.getStatus.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 }
  );

  const createPortal = trpc.subscription.createPortalSession.useMutation({
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

  const handleManage = () => {
    setIsRedirecting(true);
    createPortal.mutate();
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">Subscription</h1>
        <p className="text-muted-foreground mt-1">
          Manage your PlankMarket subscription and billing.
        </p>
      </div>

      {/* Current plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Current Plan</CardTitle>
            <StatusBadge status={proStatus} />
          </div>
          <CardDescription>
            {isPro
              ? "You have full access to all Pro features."
              : "You are on the free plan with limited features."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPro && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Plan:</span>
                <span className="text-sm">
                  PlankMarket Pro <ProBadge className="ml-1" />
                </span>
              </div>

              {statusData?.proStartedAt && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Member since:</span>
                  <span className="text-sm">
                    {formatDate(statusData.proStartedAt)}
                  </span>
                </div>
              )}

              {proExpiresAt && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {proStatus === "cancelled"
                      ? "Access until:"
                      : "Next billing date:"}
                  </span>
                  <span className="text-sm">{formatDate(proExpiresAt)}</span>
                </div>
              )}

              {availableCredit > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Promotion credit:</span>
                  <span className="text-sm">
                    {formatCurrency(availableCredit)}
                  </span>
                </div>
              )}
            </>
          )}

          <div className="pt-2">
            {isPro ? (
              <Button
                variant="outline"
                onClick={handleManage}
                disabled={isRedirecting}
              >
                {isRedirecting ? (
                  <>
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Redirecting...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
                    Manage Subscription
                    <ExternalLink
                      className="ml-1 h-3 w-3"
                      aria-hidden="true"
                    />
                  </>
                )}
              </Button>
            ) : (
              <Button asChild variant="gold">
                <Link href="/pro">Upgrade to Pro</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
