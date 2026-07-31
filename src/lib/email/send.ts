import { sendEmailOrThrow } from "./delivery";
import { buildEmailIdempotencyKey } from "./delivery-policy";
import WelcomeEmail from "@/emails/welcome";
import OrderConfirmationEmail from "@/emails/order-confirmation";
import OfferAcceptedEmail from "@/emails/offer-accepted";
import VerificationApprovedEmail from "@/emails/verification-approved";
import VerificationRejectedEmail from "@/emails/verification-rejected";
import OnboardingNudgeEmail, {
  getOnboardingNudgeSubject,
} from "@/emails/onboarding-nudge";
import MilestoneCongratsEmail from "@/emails/milestone-congrats";
import RefundConfirmationEmail from "@/emails/refund-confirmation";
import React from "react";
import { env } from "@/env";

const FROM = env.EMAIL_FROM;

export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  role: "buyer" | "seller";
  idempotencyKey?: string;
}) {
  const dashboardUrl = `${env.NEXT_PUBLIC_APP_URL}/${params.role}`;

  return sendEmailOrThrow({
    category: "welcome",
    idempotencyKey:
      params.idempotencyKey ??
      buildEmailIdempotencyKey("welcome", params.to, params.role),
    message: {
      from: FROM,
      to: params.to,
      subject: "Welcome to PlankMarket!",
      react: React.createElement(WelcomeEmail, {
        name: params.name,
        role: params.role,
        dashboardUrl,
      }),
    },
  });
}

export async function sendOrderConfirmationEmail(params: {
  to: string;
  buyerName: string;
  orderNumber: string;
  listingTitle: string;
  quantity: string;
  pricePerSqFt: string;
  subtotal: string;
  buyerFee: string;
  fullFreightCharge: string;
  buyerFreightCharge: string;
  sellerShippingCredit: string;
  hasSellerShippingCredit: boolean;
  total: string;
  orderId: string;
  idempotencyKey?: string;
}) {
  const orderUrl = `${env.NEXT_PUBLIC_APP_URL}/buyer/orders/${params.orderId}`;

  return sendEmailOrThrow({
    category: "paid_order_buyer",
    idempotencyKey:
      params.idempotencyKey ??
      buildEmailIdempotencyKey(
        "paid_order_buyer",
        params.orderId,
        params.to,
      ),
    message: {
      from: FROM,
      to: params.to,
      subject: `Order ${params.orderNumber} Confirmed - PlankMarket`,
      react: React.createElement(OrderConfirmationEmail, {
        buyerName: params.buyerName,
        orderNumber: params.orderNumber,
        listingTitle: params.listingTitle,
        quantity: params.quantity,
        pricePerSqFt: params.pricePerSqFt,
        subtotal: params.subtotal,
        buyerFee: params.buyerFee,
        fullFreightCharge: params.fullFreightCharge,
        buyerFreightCharge: params.buyerFreightCharge,
        sellerShippingCredit: params.sellerShippingCredit,
        hasSellerShippingCredit: params.hasSellerShippingCredit,
        total: params.total,
        orderUrl,
      }),
    },
  });
}

export async function sendSellerPaidOrderEmail(params: {
  to: string;
  sellerName: string;
  orderNumber: string;
  listingTitle: string;
  quantity: string;
  fullFreightCharge: string;
  buyerFreightCharge: string;
  sellerFreightContribution: string;
  sellerPayout: string;
  orderId: string;
  idempotencyKey?: string;
}) {
  const orderUrl = `${env.NEXT_PUBLIC_APP_URL}/seller/orders/${params.orderId}`;
  return sendEmailOrThrow({
    category: "paid_order_seller",
    idempotencyKey:
      params.idempotencyKey ??
      buildEmailIdempotencyKey(
        "paid_order_seller",
        params.orderId,
        params.to,
      ),
    message: {
      from: FROM,
      to: params.to,
      subject: `Paid order ${params.orderNumber} is ready - PlankMarket`,
      react: React.createElement(
        "div",
        null,
        React.createElement("p", null, `Hi ${params.sellerName},`),
        React.createElement(
          "p",
          null,
          `Order ${params.orderNumber} for ${params.listingTitle} has been paid and its freight booking is confirmed.`,
        ),
        React.createElement("p", null, `Quantity: ${params.quantity} sq ft`),
        React.createElement(
          "p",
          null,
          `Full freight charge: ${params.fullFreightCharge}`,
        ),
        React.createElement(
          "p",
          null,
          `Buyer shipping: ${params.buyerFreightCharge}`,
        ),
        React.createElement(
          "p",
          null,
          `Seller shipping contribution: ${params.sellerFreightContribution}`,
        ),
        React.createElement("p", null, `Net payout: ${params.sellerPayout}`),
        React.createElement("p", null, React.createElement("a", { href: orderUrl }, "View order")),
      ),
    },
  });
}

export async function sendOfferAcceptedEmail(params: {
  to: string;
  buyerName: string;
  listingTitle: string;
  acceptedPrice: string;
  quantity: string;
  estimatedTotal: string;
  checkoutUrl: string;
  expiresAt: string;
  idempotencyKey?: string;
}) {
  return sendEmailOrThrow({
    category: "offer_accepted",
    idempotencyKey:
      params.idempotencyKey ??
      buildEmailIdempotencyKey(
        "offer_accepted",
        params.to,
        params.checkoutUrl,
      ),
    message: {
      from: FROM,
      to: params.to,
      subject: `Offer Accepted - ${params.listingTitle}`,
      react: React.createElement(OfferAcceptedEmail, {
        buyerName: params.buyerName,
        listingTitle: params.listingTitle,
        acceptedPrice: params.acceptedPrice,
        quantity: params.quantity,
        estimatedTotal: params.estimatedTotal,
        checkoutUrl: params.checkoutUrl,
        expiresAt: params.expiresAt,
      }),
    },
  });
}

export async function sendVerificationApprovedEmail(params: {
  to: string;
  name: string;
  role: "buyer" | "seller";
  idempotencyKey?: string;
}) {
  const dashboardUrl = `${env.NEXT_PUBLIC_APP_URL}/${params.role}`;

  return sendEmailOrThrow({
    category: "verification_approved",
    idempotencyKey:
      params.idempotencyKey ??
      buildEmailIdempotencyKey(
        "verification_approved",
        params.to,
        params.role,
      ),
    message: {
      from: FROM,
      to: params.to,
      subject: "Your PlankMarket Account is Verified!",
      react: React.createElement(VerificationApprovedEmail, {
        name: params.name,
        role: params.role,
        dashboardUrl,
      }),
    },
  });
}

export async function sendVerificationRejectedEmail(params: {
  to: string;
  name: string;
  reason?: string;
  role: "buyer" | "seller";
  idempotencyKey?: string;
}) {
  const resubmitUrl = `${env.NEXT_PUBLIC_APP_URL}/${params.role === "seller" ? "seller/verification" : "buyer/settings"}`;

  return sendEmailOrThrow({
    category: "verification_rejected",
    idempotencyKey:
      params.idempotencyKey ??
      buildEmailIdempotencyKey(
        "verification_rejected",
        params.to,
        params.role,
        params.reason,
      ),
    message: {
      from: FROM,
      to: params.to,
      subject: "Update on Your PlankMarket Verification",
      react: React.createElement(VerificationRejectedEmail, {
        name: params.name,
        reason: params.reason,
        resubmitUrl,
      }),
    },
  });
}

export async function sendOnboardingNudgeEmail(params: {
  to: string;
  name: string;
  role: "buyer" | "seller";
  step: "day1" | "day3" | "day7";
  idempotencyKey?: string;
}) {
  const dashboardUrl = env.NEXT_PUBLIC_APP_URL;

  return sendEmailOrThrow({
    category: "onboarding_nudge",
    idempotencyKey:
      params.idempotencyKey ??
      buildEmailIdempotencyKey(
        "onboarding_nudge",
        params.to,
        params.role,
        params.step,
      ),
    message: {
      from: FROM,
      to: params.to,
      subject: getOnboardingNudgeSubject(params.step, params.role),
      react: React.createElement(OnboardingNudgeEmail, {
        name: params.name,
        role: params.role,
        step: params.step,
        dashboardUrl,
      }),
    },
  });
}

export async function sendRefundEmail(params: {
  to: string;
  name: string;
  recipientRole: "buyer" | "seller";
  orderNumber: string;
  refundAmount: string;
  reason: string;
  orderId: string;
  idempotencyKey?: string;
}) {
  const orderUrl = `${env.NEXT_PUBLIC_APP_URL}/${params.recipientRole}/orders/${params.orderId}`;

  return sendEmailOrThrow({
    category: "refund",
    idempotencyKey:
      params.idempotencyKey ??
      buildEmailIdempotencyKey(
        "refund",
        params.orderId,
        params.recipientRole,
        params.to,
        params.refundAmount,
        params.reason,
      ),
    message: {
      from: FROM,
      to: params.to,
      subject: `Refund Processed - Order ${params.orderNumber}`,
      react: React.createElement(RefundConfirmationEmail, {
        name: params.name,
        orderNumber: params.orderNumber,
        refundAmount: params.refundAmount,
        reason: params.reason,
        orderUrl,
      }),
    },
  });
}

export async function sendMilestoneCongratsEmail(params: {
  to: string;
  name: string;
  milestone: "first_listing" | "first_purchase";
  idempotencyKey?: string;
}) {
  const dashboardUrl = env.NEXT_PUBLIC_APP_URL;
  const subject =
    params.milestone === "first_listing"
      ? "Your First Listing is Live on PlankMarket!"
      : "Your First Purchase on PlankMarket!";

  return sendEmailOrThrow({
    category: "milestone",
    idempotencyKey:
      params.idempotencyKey ??
      buildEmailIdempotencyKey(
        "milestone",
        params.to,
        params.milestone,
      ),
    message: {
      from: FROM,
      to: params.to,
      subject,
      react: React.createElement(MilestoneCongratsEmail, {
        name: params.name,
        milestone: params.milestone,
        dashboardUrl,
      }),
    },
  });
}
