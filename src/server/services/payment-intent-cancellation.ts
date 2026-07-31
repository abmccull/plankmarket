import { stripe } from "@/lib/stripe";
import { isStripePaymentIntentCancelable } from "./order-transitions";

export async function cancelUncapturedOrderPayment(params: {
  orderId: string;
  paymentIntentId: string | null;
  expectedAmountCents: number;
}): Promise<{ cancelled: boolean; reason: string }> {
  if (!params.paymentIntentId) {
    return { cancelled: false, reason: "Order has no PaymentIntent" };
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(
    params.paymentIntentId,
  );
  if (
    paymentIntent.metadata.orderId !== params.orderId ||
    paymentIntent.amount !== params.expectedAmountCents ||
    paymentIntent.currency.toLowerCase() !== "usd"
  ) {
    throw new Error("Stored PaymentIntent does not match the order");
  }
  if (paymentIntent.status === "canceled") {
    return { cancelled: true, reason: "PaymentIntent was already cancelled" };
  }
  if (!isStripePaymentIntentCancelable(paymentIntent.status)) {
    throw new Error(
      `PaymentIntent status ${paymentIntent.status} is not safe to cancel`,
    );
  }

  const cancelledIntent = await stripe.paymentIntents.cancel(
    paymentIntent.id,
    {},
    { idempotencyKey: `cancel-order-payment:${params.orderId}` },
  );
  if (cancelledIntent.status !== "canceled") {
    throw new Error(
      `PaymentIntent cancellation returned ${cancelledIntent.status}`,
    );
  }
  return { cancelled: true, reason: "PaymentIntent cancelled" };
}
