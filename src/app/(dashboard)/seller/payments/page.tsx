"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
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
import { Loader2 } from "lucide-react";
import {
  ConnectAccountOnboarding,
  ConnectPayouts,
  ConnectPayments,
  ConnectAccountManagement,
  ConnectNotificationBanner,
} from "@stripe/react-connect-js";
import { PUBLIC_COMMERCIAL_COPY } from "@/lib/public-commercial-copy";

const actionClass = "h-auto min-h-11 whitespace-normal py-2";

export default function SellerPaymentsPage() {
  const owner = useAuthStore((state) => state.user?.id);
  return owner ? (
    <PaymentsWorkspace key={owner} owner={owner} />
  ) : (
    <p role="status">Checking account access…</p>
  );
}

function PaymentsWorkspace({ owner }: { owner: string }) {
  const query = trpc.payment.getConnectStatus.useQuery(undefined, {
    retry: false,
  });
  const utils = trpc.useUtils();
  const active = useRef(false);
  const creating = useRef(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [statusReadFailed, setStatusReadFailed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const current = () =>
    active.current && useAuthStore.getState().user?.id === owner;
  const refreshStatus = async () => {
    if (creating.current || !current()) return;
    creating.current = true;
    setBusy(true);
    try {
      // Cancel older observer reads before/after this authoritative read so a
      // reconnect response cannot replace the current account status.
      await utils.payment.getConnectStatus.cancel();
      if (!current()) return;
      const status = await utils.client.payment.getConnectStatus.query();
      if (!current()) return;
      await utils.payment.getConnectStatus.cancel();
      if (!current()) return;
      utils.payment.getConnectStatus.setData(undefined, status);
      setStatusReadFailed(false);
      setUncertain(false);
      setProblem(null);
    } catch {
      if (current()) {
        setStatusReadFailed(true);
        setProblem(
          "We couldn’t refresh your payment account status. Try again when your connection is restored.",
        );
      }
    } finally {
      if (current()) {
        creating.current = false;
        setBusy(false);
      }
    }
  };
  const createAccount = async () => {
    if (
      creating.current ||
      created ||
      uncertain ||
      query.isError ||
      query.isFetching ||
      !query.data ||
      query.data.connected ||
      !current()
    )
      return;
    creating.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await utils.client.payment.createConnectAccount.mutate();
      if (!current()) return;
      setCreated(true);
      try {
        await utils.payment.getConnectStatus.cancel();
        if (!current()) return;
        const status = await utils.client.payment.getConnectStatus.query();
        if (!current()) return;
        await utils.payment.getConnectStatus.cancel();
        if (current()) {
          utils.payment.getConnectStatus.setData(undefined, status);
          setStatusReadFailed(false);
        }
      } catch {
        if (current()) {
          setStatusReadFailed(true);
          setProblem(
            "Your Stripe account was created, but we couldn’t refresh its setup status. Check status to continue.",
          );
        }
      }
    } catch {
      if (current()) {
        setUncertain(true);
        setProblem(
          "We couldn’t confirm whether Stripe setup started. Check account status before trying again.",
        );
      }
    } finally {
      if (current()) {
        creating.current = false;
        setBusy(false);
      }
    }
  };
  const status = query.data;
  const error = query.isError || statusReadFailed || !status;
  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Payments</h1>
          <p className="mt-1 text-muted-foreground">
            Set up your payment account and manage bank payouts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2"><Button className={actionClass} asChild variant="outline"><Link href="/seller/listings/new">Continue your listing</Link></Button><Button className={actionClass} asChild variant="outline">
          <Link href="/seller/orders">View order proceeds</Link>
        </Button></div>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Your order pages show marketplace charges, fees and transfers to Stripe.
        A bank payout is Stripe’s separate transfer from your Stripe balance to
        your bank.
      </p>
      {created && !status?.connected && (
        <p role="status" className="text-sm font-medium">
          Your Stripe account was created.
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {query.isLoading ? (
        <p role="status" className="flex items-center gap-2 py-6">
          <Loader2
            className="h-5 w-5 shrink-0 animate-spin"
            aria-hidden="true"
          />
          Checking payment account…
        </p>
      ) : error ? (
        <section
          role="alert"
          className="max-w-xl space-y-3 rounded-lg border p-4"
        >
          <h2 className="text-lg font-semibold">
            Payment account status unavailable
          </h2>
          <p className="text-sm text-muted-foreground">
            We couldn’t confirm your Stripe account status. Check again before
            starting or changing setup.
          </p>
          <Button
            className={actionClass}
            disabled={busy || query.isFetching}
            onClick={() => void refreshStatus()}
          >
            Retry payment status
          </Button>
        </section>
      ) : !status.connected ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>
              {created
                ? "Continue your Stripe setup"
                : "Set up your Stripe account"}
            </CardTitle>
            <CardDescription>
              Connect your business and bank details to receive payouts for your
              marketplace sales.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {created || uncertain ? (
              <Button
                className={actionClass + " w-full"}
                disabled={busy || query.isFetching}
                onClick={() => void refreshStatus()}
              >
                Check account status
              </Button>
            ) : (
              <Button
                className={actionClass + " w-full"}
                disabled={busy || query.isFetching}
                onClick={() => void createAccount()}
              >
                {busy && (
                  <Loader2
                    className="mr-2 h-4 w-4 shrink-0 animate-spin"
                    aria-hidden="true"
                  />
                )}
                Connect Stripe account
              </Button>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer py-2 font-medium">
                Fees and when funds become available
              </summary>
              <p className="mt-2 text-muted-foreground">
                Sellers pay a {PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel}{" "}
                on inventory subtotal plus{" "}
                {PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel} processing on
                inventory subtotal only. Marketplace transfers become eligible
                after live pickup and the required waiting period, subject to
                payment, shipment, refund and dispute checks.{" "}
                {PUBLIC_COMMERCIAL_COPY.sellerTransferWithhold} Each order shows
                its shipping contribution and net proceeds. Stripe’s bank payout
                timing is separate.
              </p>
            </details>
          </CardContent>
        </Card>
      ) : !status.onboardingComplete ? (
        <Card>
          <CardHeader>
            <CardTitle>Finish your payment account setup</CardTitle>
            <CardDescription>
              Stripe will ask for your business details, identity and bank
              account. Completing this step lets you receive eligible
              marketplace transfers and later bank payouts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StripeConnectProvider>
              {(callbacks) => (
                <ConnectAccountOnboarding
                  {...callbacks}
                  onExit={() => void refreshStatus()}
                />
              )}
            </StripeConnectProvider>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="max-w-3xl space-y-1 text-sm">
            <h2 className="font-semibold">Stripe account tools</h2>
            <p className="text-muted-foreground">
              Use Bank payouts for your Stripe-to-bank activity. Stripe activity
              shows transactions on your connected account; marketplace order
              payment and transfer details remain in Orders.
            </p>
          </section>
          <StripeConnectProvider>
            {(callbacks) => (
              <>
                <ConnectNotificationBanner
                  onLoadError={callbacks.onLoadError}
                />
                <Tabs defaultValue="payouts" className="mt-4">
                  <TabsList className="h-auto min-h-11 flex-wrap justify-start">
                    <TabsTrigger className={actionClass} value="payouts">
                      Bank payouts
                    </TabsTrigger>
                    <TabsTrigger className={actionClass} value="payments">
                      Stripe activity
                    </TabsTrigger>
                    <TabsTrigger className={actionClass} value="account">
                      Account details
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="payouts">
                    <Card>
                      <CardContent className="pt-6">
                        <ConnectPayouts {...callbacks} />
                      </CardContent>
                    </Card>
                  </TabsContent>
                  <TabsContent value="payments">
                    <Card>
                      <CardContent className="pt-6">
                        <ConnectPayments {...callbacks} />
                      </CardContent>
                    </Card>
                  </TabsContent>
                  <TabsContent value="account">
                    <Card>
                      <CardContent className="pt-6">
                        <ConnectAccountManagement {...callbacks} />
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </StripeConnectProvider>
        </>
      )}
    </div>
  );
}
