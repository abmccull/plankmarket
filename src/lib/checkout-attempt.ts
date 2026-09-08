import { z } from "zod";
import { createOrderSchema, createOrderFromOfferSchema } from "@/lib/validators/order";

const attemptSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("direct"), input: createOrderSchema }),
  z.object({ mode: z.literal("offer"), input: createOrderFromOfferSchema }),
]);
export type CheckoutAttempt = z.infer<typeof attemptSchema>;

export function checkoutAttemptKey(buyerId: string, listingId: string, offerId: string | null) {
  return `plankmarket:checkout:v1:${buyerId}:${listingId}:${offerId ?? "direct"}`;
}

/** Session storage survives refresh and lost responses, but is isolated from
 * other signed-in buyers. It never contains a Stripe client secret. */
export function readCheckoutAttempt(storage: Pick<Storage, "getItem">, key: string): CheckoutAttempt | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  // Corrupted recovery data must not silently turn into a new purchase.
  return attemptSchema.parse(JSON.parse(raw));
}

export function persistCheckoutAttempt(storage: Pick<Storage, "getItem" | "setItem">, key: string, attempt: CheckoutAttempt): CheckoutAttempt {
  const existing = readCheckoutAttempt(storage, key);
  if (existing) return existing;
  const validated = attemptSchema.parse(attempt);
  storage.setItem(key, JSON.stringify(validated));
  return validated;
}
