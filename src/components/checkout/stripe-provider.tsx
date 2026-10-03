"use client";

import { Component, createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Elements, PaymentElement } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe, StripeElementsOptions } from "@stripe/stripe-js";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const PAYMENT_LOAD_TIMEOUT_MS = 20_000;
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
let stripePromise: Promise<Stripe | null> | null = null;

// Reuse a successful/in-flight SDK load. A rejected load must be retryable.
// This function never creates an order, PaymentIntent, or promotion purchase.
function getStripe() {
  if (!publishableKey) return Promise.resolve(null);
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey).catch((error: unknown) => {
      stripePromise = null;
      throw error;
    });
  }
  return stripePromise;
}

interface PaymentUiState {
  isProcessing: boolean;
  startProcessing: () => boolean;
  finishProcessing: () => void;
  retry: () => void;
}
const PaymentUiContext = createContext<PaymentUiState | null>(null);

export function usePaymentUiState() {
  const context = useContext(PaymentUiContext);
  if (!context) throw new Error("Payment UI must be inside StripeProvider");
  return context;
}

function PaymentLoading({ label }: { label: string }) {
  return <div role="status" aria-live="polite" aria-busy="true" aria-label={label} className="flex items-center gap-3 rounded-md border bg-card p-4 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" /><p>{label}…</p></div>;
}

function PaymentUnavailable({ description, onRetry, disabled = false }: {
  description?: string;
  onRetry?: () => void;
  disabled?: boolean;
}) {
  const titleId = useId();
  return <section role="alert" aria-labelledby={titleId} className="space-y-3 rounded-md border border-destructive/30 bg-card p-4">
    <h2 id={titleId} className="flex items-center gap-2 font-semibold"><AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />Payment form unavailable</h2>
    <p className="text-sm text-muted-foreground">{description ?? "The secure payment form could not load. Check your connection and retry. Retrying reloads the form for this same payment."}</p>
    {disabled && <p role="status" className="text-sm text-muted-foreground">Payment confirmation is still in progress. Wait for its result before reloading the form.</p>}
    <div className="flex flex-wrap gap-2">
      {onRetry && <Button type="button" disabled={disabled} onClick={onRetry}>Retry payment form</Button>}
      <Button type="button" variant="outline" asChild><Link href="/contact">Contact support</Link></Button>
    </div>
  </section>;
}

class PaymentRenderBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function paymentOptions(clientSecret: string): StripeElementsOptions {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    clientSecret,
    appearance: {
      theme: "stripe",
      variables: {
        colorPrimary: color("--primary", "#7b4a1f"),
        colorBackground: color("--card", "#fcfaf7"),
        colorText: color("--foreground", "#302820"),
        colorDanger: color("--destructive", "#b42318"),
        fontFamily: "system-ui, sans-serif",
        borderRadius: "10px",
      },
    },
  };
}

type SdkState = { phase: "loading" } | { phase: "error" } | { phase: "ready"; stripe: Stripe; options: StripeElementsOptions };

function StripeLoadAttempt({ clientSecret, children }: { clientSecret: string; children: ReactNode }) {
  const [state, setState] = useState<SdkState>({ phase: "loading" });
  const ui = usePaymentUiState();
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      active = false;
      setState({ phase: "error" });
    }, PAYMENT_LOAD_TIMEOUT_MS);
    void getStripe().then((stripe) => {
      if (!active) return;
      window.clearTimeout(timer);
      setState(stripe ? { phase: "ready", stripe, options: paymentOptions(clientSecret) } : { phase: "error" });
    }).catch(() => {
      if (!active) return;
      window.clearTimeout(timer);
      setState({ phase: "error" });
    });
    return () => { active = false; window.clearTimeout(timer); };
  }, [clientSecret]);

  if (state.phase === "loading") return <PaymentLoading label="Loading secure payment form" />;
  if (state.phase === "error") return <PaymentUnavailable onRetry={ui.retry} disabled={ui.isProcessing} />;
  return <PaymentRenderBoundary fallback={<PaymentUnavailable onRetry={ui.retry} disabled={ui.isProcessing} />}>
    <Elements stripe={state.stripe} options={state.options}>{children}</Elements>
  </PaymentRenderBoundary>;
}

function StripePaymentSession({ clientSecret, children }: { clientSecret: string; children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);
  const startProcessing = useCallback(() => {
    if (processingRef.current) return false;
    processingRef.current = true;
    setIsProcessing(true);
    return true;
  }, []);
  const finishProcessing = useCallback(() => {
    processingRef.current = false;
    setIsProcessing(false);
  }, []);
  const retry = useCallback(() => {
    // The ref also blocks a second event before the disabled button rerenders.
    if (!processingRef.current) setAttempt((value) => value + 1);
  }, []);
  return <PaymentUiContext.Provider value={{ isProcessing, startProcessing, finishProcessing, retry }}>
    <StripeLoadAttempt key={attempt} clientSecret={clientSecret}>{children}</StripeLoadAttempt>
  </PaymentUiContext.Provider>;
}

export function StripeProvider({ clientSecret, children }: { clientSecret: string | null; children: ReactNode }) {
  if (!publishableKey || !clientSecret) return <PaymentUnavailable description="Online payment is temporarily unavailable. Contact support with your order or promotion details." />;
  return <StripePaymentSession key={clientSecret} clientSecret={clientSecret}>{children}</StripePaymentSession>;
}

/** Keep the mounted field alive while confirmation is in flight. Only the
 * explicit, guarded retry remounts Elements, retaining the same client secret. */
export function StripePaymentFields({ onReadyChange }: { onReadyChange: (ready: boolean) => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const ui = usePaymentUiState();
  useEffect(() => {
    if (phase !== "loading") return;
    const timer = window.setTimeout(() => { setPhase("error"); onReadyChange(false); }, PAYMENT_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [phase, onReadyChange]);
  return <div className="space-y-3">
    {phase === "loading" && <PaymentLoading label="Loading secure payment fields" />}
    {phase === "error" && <PaymentUnavailable onRetry={ui.retry} disabled={ui.isProcessing} />}
    <div className={phase === "error" ? "hidden" : "rounded-lg border bg-background p-4"}>
      <PaymentElement
        options={{ layout: "tabs" }}
        onReady={() => { setPhase("ready"); onReadyChange(true); }}
        onLoadError={() => { setPhase("error"); onReadyChange(false); }}
      />
    </div>
  </div>;
}
