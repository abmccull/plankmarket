import { Text, Section, Button, Hr } from "@react-email/components";
import { EmailLayout } from "./components/layout";
import * as React from "react";

interface RefundConfirmationEmailProps {
  name: string;
  orderNumber: string;
  refundAmount: string;
  reason: string;
  orderUrl: string;
}

export default function RefundConfirmationEmail({
  name = "there",
  orderNumber = "PM-ABC12345",
  refundAmount = "$100.00",
  reason = "Requested by admin",
  orderUrl = "https://plankmarket.com/buyer/orders/123",
}: RefundConfirmationEmailProps) {
  return (
    <EmailLayout previewText={`Refund processed for order ${orderNumber}`}>
      <Text style={heading}>Refund Processed</Text>
      <Text style={paragraph}>Hi {name},</Text>
      <Text style={paragraph}>
        A refund has been processed for order <strong>{orderNumber}</strong>.
        The funds will be returned to the original payment method within 5-10
        business days.
      </Text>

      <Section style={refundBox}>
        <Text style={refundTitle}>Refund Details</Text>
        <Text style={refundDetail}>Order: {orderNumber}</Text>
        <Text style={refundDetail}>Reason: {reason}</Text>
        <Hr style={divider} />
        <Text style={refundTotal}>Amount Refunded: {refundAmount}</Text>
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

const refundBox = {
  backgroundColor: "#f9f8f6",
  borderRadius: "8px",
  padding: "20px",
  margin: "16px 0",
};

const refundTitle = {
  fontSize: "16px",
  fontWeight: "600" as const,
  color: "#1a1a1a",
  margin: "0 0 8px",
};

const refundDetail = {
  fontSize: "13px",
  color: "#666",
  margin: "2px 0",
};

const refundTotal = {
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
