import { Text, Section, Button, Hr } from "@react-email/components";
import { EmailLayout } from "./components/layout";
import * as React from "react";

interface OfferAcceptedEmailProps {
  buyerName: string;
  listingTitle: string;
  acceptedPrice: string;
  quantity: string;
  estimatedTotal: string;
  checkoutUrl: string;
  expiresAt: string;
}

export default function OfferAcceptedEmail({
  buyerName = "there",
  listingTitle = "Premium White Oak Hardwood",
  acceptedPrice = "$2.25/sq ft",
  quantity = "2,500 sq ft",
  estimatedTotal = "$5,625.00",
  checkoutUrl = "https://plankmarket.com/listings/123/checkout?offerId=456",
  expiresAt = "March 1, 2026 at 3:00 PM EST",
}: OfferAcceptedEmailProps) {
  return (
    <EmailLayout previewText="Your offer has been accepted!">
      <Text style={heading}>Your Offer Has Been Accepted!</Text>
      <Text style={paragraph}>Hi {buyerName},</Text>
      <Text style={paragraph}>
        Congratulations! The seller has accepted your offer on{" "}
        <strong>{listingTitle}</strong>. Complete your purchase to secure this
        deal.
      </Text>

      <Section style={detailsBox}>
        <Text style={detailsTitle}>{listingTitle}</Text>
        <Text style={detailsItem}>Accepted Price: {acceptedPrice}</Text>
        <Text style={detailsItem}>Quantity: {quantity}</Text>
        <Hr style={divider} />
        <Text style={detailsTotal}>Estimated Total: {estimatedTotal}</Text>
      </Section>

      <Section style={urgencyBox}>
        <Text style={urgencyText}>
          Complete your purchase by <strong>{expiresAt}</strong>. Your accepted
          offer expires in 48 hours.
        </Text>
      </Section>

      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Button href={checkoutUrl} style={button}>
          Complete Checkout
        </Button>
      </Section>

      <Text style={footerNote}>
        If you do not complete checkout before the deadline, your accepted offer
        will expire and the listing will become available to other buyers.
      </Text>
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

const detailsBox = {
  backgroundColor: "#f9f8f6",
  borderRadius: "8px",
  padding: "20px",
  margin: "16px 0",
};

const detailsTitle = {
  fontSize: "16px",
  fontWeight: "600" as const,
  color: "#1a1a1a",
  margin: "0 0 8px",
};

const detailsItem = {
  fontSize: "13px",
  color: "#666",
  margin: "2px 0",
};

const detailsTotal = {
  fontSize: "16px",
  fontWeight: "bold" as const,
  color: "#5C4033",
  margin: "8px 0 0",
};

const divider = {
  borderColor: "#e5e5e5",
  margin: "12px 0",
};

const urgencyBox = {
  backgroundColor: "#fef3c7",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "16px 0",
  borderLeft: "4px solid #f59e0b",
};

const urgencyText = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#92400e",
  margin: "0",
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

const footerNote = {
  fontSize: "12px",
  lineHeight: "18px",
  color: "#999",
  margin: "24px 0 0",
};
