import { resend } from "./client";
import WelcomeEmail from "@/emails/welcome";
import OrderConfirmationEmail from "@/emails/order-confirmation";
import VerificationApprovedEmail from "@/emails/verification-approved";
import VerificationRejectedEmail from "@/emails/verification-rejected";
import OnboardingNudgeEmail, {
  getOnboardingNudgeSubject,
} from "@/emails/onboarding-nudge";
import MilestoneCongratsEmail from "@/emails/milestone-congrats";
import React from "react";
import { env } from "@/env";

const FROM = env.EMAIL_FROM;

export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  role: "buyer" | "seller";
}) {
  const dashboardUrl = `${env.NEXT_PUBLIC_APP_URL}/${params.role}`;

  return resend.emails.send({
    from: FROM,
    to: params.to,
    subject: "Welcome to PlankMarket!",
    react: React.createElement(WelcomeEmail, {
      name: params.name,
      role: params.role,
      dashboardUrl,
    }),
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
  total: string;
  orderId: string;
}) {
  const orderUrl = `${env.NEXT_PUBLIC_APP_URL}/buyer/orders/${params.orderId}`;

  return resend.emails.send({
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
      total: params.total,
      orderUrl,
    }),
  });
}

export async function sendVerificationApprovedEmail(params: {
  to: string;
  name: string;
  role: "buyer" | "seller";
}) {
  const dashboardUrl = `${env.NEXT_PUBLIC_APP_URL}/${params.role}`;

  return resend.emails.send({
    from: FROM,
    to: params.to,
    subject: "Your PlankMarket Account is Verified!",
    react: React.createElement(VerificationApprovedEmail, {
      name: params.name,
      role: params.role,
      dashboardUrl,
    }),
  });
}

export async function sendVerificationRejectedEmail(params: {
  to: string;
  name: string;
  reason?: string;
  role: "buyer" | "seller";
}) {
  const resubmitUrl = `${env.NEXT_PUBLIC_APP_URL}/${params.role === "seller" ? "seller/verification" : "buyer/settings"}`;

  return resend.emails.send({
    from: FROM,
    to: params.to,
    subject: "Update on Your PlankMarket Verification",
    react: React.createElement(VerificationRejectedEmail, {
      name: params.name,
      reason: params.reason,
      resubmitUrl,
    }),
  });
}

export async function sendOnboardingNudgeEmail(params: {
  to: string;
  name: string;
  role: "buyer" | "seller";
  step: "day1" | "day3" | "day7";
}) {
  const dashboardUrl = env.NEXT_PUBLIC_APP_URL;

  return resend.emails.send({
    from: FROM,
    to: params.to,
    subject: getOnboardingNudgeSubject(params.step, params.role),
    react: React.createElement(OnboardingNudgeEmail, {
      name: params.name,
      role: params.role,
      step: params.step,
      dashboardUrl,
    }),
  });
}

export async function sendMilestoneCongratsEmail(params: {
  to: string;
  name: string;
  milestone: "first_listing" | "first_purchase";
}) {
  const dashboardUrl = env.NEXT_PUBLIC_APP_URL;
  const subject =
    params.milestone === "first_listing"
      ? "Your First Listing is Live on PlankMarket!"
      : "Your First Purchase on PlankMarket!";

  return resend.emails.send({
    from: FROM,
    to: params.to,
    subject,
    react: React.createElement(MilestoneCongratsEmail, {
      name: params.name,
      milestone: params.milestone,
      dashboardUrl,
    }),
  });
}
