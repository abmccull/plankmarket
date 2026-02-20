"use client";

import { useMemo } from "react";
import { ConnectComponentsProvider } from "@stripe/react-connect-js";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import { trpc } from "@/lib/trpc/client";

export function StripeConnectProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const createAccountSession = trpc.payment.createAccountSession.useMutation();

  const stripeConnectInstance = useMemo(() => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) return null;

    return loadConnectAndInitialize({
      publishableKey,
      fetchClientSecret: async () => {
        const { clientSecret } = await createAccountSession.mutateAsync();
        return clientSecret;
      },
      appearance: {
        variables: {
          colorPrimary: "#16a34a",
          fontFamily: "inherit",
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!stripeConnectInstance) return null;

  return (
    <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
      {children}
    </ConnectComponentsProvider>
  );
}
