import { Text, Section, Button, Hr } from "@react-email/components";
import { EmailLayout } from "./components/layout";
import * as React from "react";

interface OrderConfirmationEmailProps {
  buyerName: string;
  orderNumber: string;
  listingTitle: string;
  quantity: string;
  pricePerSqFt: string;
  subtotal: string;
  buyerFee: string;
  total: string;
  orderUrl: string;
}

export default function OrderConfirmationEmail({
  buyerName = "there",
  orderNumber = "PM-ABC12345",
  listingTitle = "Premium White Oak Hardwood",
  quantity = "2,500 sq ft",
  pricePerSqFt = "$2.50",
  subtotal = "$6,250.00",
  buyerFee = "$187.50",
  total = "$6,437.50",
  orderUrl = "https://plankmarket.com/buyer/orders/123",
}: OrderConfirmationEmailProps) {
  return (
    <EmailLayout previewText={`Order ${orderNumber} confirmed`}>
      <Text style={heading}>Order Confirmed</Text>
      <Text style={paragraph}>Hi {buyerName},</Text>
      <Text style={paragraph}>
        Your order <strong>{orderNumber}</strong> has been placed successfully.
        The seller has been notified and will process your order shortly.
      </Text>

      <Section style={orderBox}>
        <Text style={orderTitle}>{listingTitle}</Text>
        <Text style={orderDetail}>Quantity: {quantity}</Text>
        <Text style={orderDetail}>Price: {pricePerSqFt}/sq ft</Text>
        <Hr style={divider} />
        <Text style={orderDetail}>Subtotal: {subtotal}</Text>
        <Text style={orderDetail}>Buyer Fee (3%): {buyerFee}</Text>
        <Text style={orderTotal}>Total: {total}</Text>
      </Section>

      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Button href={orderUrl} style={button}>
          View Order Details
        </Button>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "24px",
  fontWeight: "bold" as const,
  color: "#1a1a1a",
  margin: "0 0 16px",
};

const paragraph = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#4a4a4a",
  margin: "0 0 12px",
};

const orderBox = {
  backgroundColor: "#f9f8f6",
  borderRadius: "8px",
  padding: "20px",
  margin: "16px 0",
};

const orderTitle = {
  fontSize: "16px",
  fontWeight: "600" as const,
  color: "#1a1a1a",
  margin: "0 0 8px",
};

const orderDetail = {
  fontSize: "13px",
  color: "#666",
  margin: "2px 0",
};

const orderTotal = {
  fontSize: "16px",
  fontWeight: "bold" as const,
  color: "#5C4033",
  margin: "8px 0 0",
};

const divider = {
  borderColor: "#e5e5e5",
  margin: "12px 0",
};

const button = {
  backgroundColor: "#5C4033",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "14px",
  fontWeight: "600" as const,
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 32px",
};
