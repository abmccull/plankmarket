/**
 * Checkout-related type definitions
 */

export type PaymentStep = "form" | "payment";

export interface PaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
}

export interface StripeConfirmationParams {
  return_url: string;
}
