"use client";

import { useState, type FormEvent } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";

interface StripePaymentFormProps {
  listingId: string;
  orderId: string;
}

export function StripePaymentForm({ listingId, orderId }: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/listings/${listingId}/checkout/success?orderId=${orderId}`,
        },
      });

      if (error) {
        setErrorMessage(error.message || "An error occurred during payment processing.");
      }
    } catch {
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Payment
        </CardTitle>
        <CardDescription>
          Secure payment processed by Stripe. Your payment information is encrypted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-lg border bg-background p-4">
            <PaymentElement
              options={{
                layout: "tabs",
              }}
            />
          </div>

          {errorMessage && (
            <div
              role="alert"
              aria-live="polite"
              className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <p>{errorMessage}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={!stripe || !elements || isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Processing payment...
              </>
            ) : (
              "Pay now"
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Your payment is secured by Stripe. We never store your card details.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
