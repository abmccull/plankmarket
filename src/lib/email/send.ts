import { resend } from "./client";
import WelcomeEmail from "@/emails/welcome";
import OrderConfirmationEmail from "@/emails/order-confirmation";
import React from "react";

const FROM = process.env.EMAIL_FROM || "PlankMarket <noreply@plankmarket.com>";

export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  role: "buyer" | "seller";
}) {
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${params.role}`;

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
  sellerName: string;
  orderId: string;
}) {
  const orderUrl = `${process.env.NEXT_PUBLIC_APP_URL}/buyer/orders/${params.orderId}`;

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
      sellerName: params.sellerName,
      orderUrl,
    }),
  });
}
