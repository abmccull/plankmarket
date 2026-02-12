"use client";

import { Elements } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useEffect, useState } from "react";

interface StripeProviderProps {
  clientSecret: string | null;
  children: React.ReactNode;
}

export function StripeProvider({ clientSecret, children }: StripeProviderProps) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  useEffect(() => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

    if (!publishableKey) {
      console.error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not defined");
      return;
    }

    setStripePromise(loadStripe(publishableKey));
  }, []);

  if (!stripePromise || !clientSecret) {
    return null;
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#2563eb",
            colorBackground: "#ffffff",
            colorText: "#1f2937",
            colorDanger: "#ef4444",
            fontFamily: "system-ui, sans-serif",
            borderRadius: "0.5rem",
          },
        },
      }}
    >
      {children}
    </Elements>
  );
}
