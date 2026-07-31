import Stripe from "stripe";
import { env } from "@/env";

let stripeClient: Stripe | undefined;

export function getStripeClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required for Stripe operations");
  }

  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-01-28.clover" as const,
  });

  return stripeClient;
}

// Route modules are evaluated during `next build`. Defer client construction
// until an actual Stripe operation so secret-free CI builds can collect route
// metadata without weakening runtime configuration checks.
export const stripe = new Proxy({} as Stripe, {
  get(_target, property) {
    const client = getStripeClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
