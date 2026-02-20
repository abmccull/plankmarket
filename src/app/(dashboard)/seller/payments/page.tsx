"use client";

import { trpc } from "@/lib/trpc/client";
import { StripeConnectProvider } from "@/components/stripe/stripe-connect-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, CreditCard } from "lucide-react";
import {
  ConnectAccountOnboarding,
  ConnectPayouts,
  ConnectPayments,
  ConnectAccountManagement,
  ConnectNotificationBanner,
} from "@stripe/react-connect-js";

export default function SellerPaymentsPage() {
  const {
    data: status,
    isLoading,
    refetch,
  } = trpc.payment.getConnectStatus.useQuery();
  const createAccount = trpc.payment.createConnectAccount.useMutation();

  const handleCreateAccount = async () => {
    try {
      await createAccount.mutateAsync();
      await refetch();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to create account";
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

  // State A: No Stripe account yet
  if (!status?.connected) {
    return (
      <div className="max-w-xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Payments</h1>
          <p className="text-muted-foreground mt-1">
            Set up payments to start selling on PlankMarket
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Connect Stripe Account
            </CardTitle>
            <CardDescription>
              We use Stripe to securely process payments and send you payouts. A
              2% seller fee is deducted from each transaction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleCreateAccount}
              disabled={createAccount.isPending}
              className="w-full"
            >
              {createAccount.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Connect Stripe Account
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // State B: Account exists but onboarding incomplete
  if (!status.onboardingComplete) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Payments</h1>
          <p className="text-muted-foreground mt-1">
            Complete your account setup to start receiving payments
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Complete Account Setup</CardTitle>
            <CardDescription>
              Fill in your business details, verify your identity, and connect a
              bank account to start receiving payouts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StripeConnectProvider>
              <ConnectAccountOnboarding
                onExit={() => {
                  refetch();
                }}
              />
            </StripeConnectProvider>
          </CardContent>
        </Card>
      </div>
    );
  }

  // State C: Fully onboarded
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Payments</h1>
        <p className="text-muted-foreground mt-1">
          Manage your payouts, transactions, and account settings
        </p>
      </div>

      <StripeConnectProvider>
        <ConnectNotificationBanner />

        <Tabs defaultValue="payouts" className="mt-4">
          <TabsList>
            <TabsTrigger value="payouts">Payouts</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>
          <TabsContent value="payouts">
            <Card>
              <CardContent className="pt-6">
                <ConnectPayouts />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="payments">
            <Card>
              <CardContent className="pt-6">
                <ConnectPayments />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="account">
            <Card>
              <CardContent className="pt-6">
                <ConnectAccountManagement />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </StripeConnectProvider>
    </div>
  );
}
