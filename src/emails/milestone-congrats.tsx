import { Text, Section, Button } from "@react-email/components";
import { EmailLayout } from "./components/layout";
import * as React from "react";

interface MilestoneCongratsEmailProps {
  name: string;
  milestone: "first_listing" | "first_purchase";
  dashboardUrl: string;
}

const milestoneContent = {
  first_listing: {
    preview: "Your first listing is live on PlankMarket!",
    heading: "Your First Listing is Live!",
    body: "Congratulations! Your listing is now visible to thousands of buyers on PlankMarket. Here are some tips to maximize your sales:",
    tips: [
      "- Add high-quality photos to increase buyer interest",
      "- Price competitively — check similar listings for reference",
      "- Respond quickly to buyer inquiries",
    ],
    cta: "View Your Listings",
    ctaPath: "/seller/listings",
  },
  first_purchase: {
    preview: "Your first order on PlankMarket is confirmed!",
    heading: "First Purchase Complete!",
    body: "Congratulations on your first purchase! Your order is being processed. Here's what happens next:",
    tips: [
      "- Track your order status from your dashboard",
      "- The seller will provide shipping details soon",
      "- Leave a review after receiving your order",
    ],
    cta: "View Your Orders",
    ctaPath: "/buyer/orders",
  },
};

export default function MilestoneCongratsEmail({
  name = "John",
  milestone = "first_listing",
  dashboardUrl = "https://plankmarket.com",
}: MilestoneCongratsEmailProps) {
  const c = milestoneContent[milestone];
  const ctaUrl = `${dashboardUrl}${c.ctaPath}`;

  return (
    <EmailLayout previewText={c.preview}>
      <Text style={heading}>{c.heading}</Text>
      <Text style={paragraph}>Hi {name},</Text>
      <Text style={paragraph}>{c.body}</Text>

      {c.tips.map((tip, i) => (
        <Text key={i} style={listItem}>
          {tip}
        </Text>
      ))}

      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Button href={ctaUrl} style={button}>
          {c.cta}
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

const listItem = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#4a4a4a",
  margin: "2px 0",
  paddingLeft: "8px",
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
