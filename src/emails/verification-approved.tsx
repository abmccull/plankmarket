import { Text, Section, Button } from "@react-email/components";
import { EmailLayout } from "./components/layout";
import * as React from "react";

interface VerificationApprovedEmailProps {
  name: string;
  role: "buyer" | "seller";
  dashboardUrl: string;
}

export default function VerificationApprovedEmail({
  name = "John",
  role = "buyer",
  dashboardUrl = "https://plankmarket.com/buyer",
}: VerificationApprovedEmailProps) {
  return (
    <EmailLayout previewText="Your PlankMarket account has been verified!">
      <Text style={heading}>You&apos;re Verified!</Text>
      <Text style={paragraph}>Hi {name},</Text>
      <Text style={paragraph}>
        Great news — your business has been verified on PlankMarket. You now have
        full access to the marketplace.
      </Text>

      {role === "seller" ? (
        <>
          <Text style={subheading}>What you can do now:</Text>
          <Text style={listItem}>- Publish listings visible to all buyers</Text>
          <Text style={listItem}>- Receive and manage orders</Text>
          <Text style={listItem}>- Access buyer request board</Text>
        </>
      ) : (
        <>
          <Text style={subheading}>What you can do now:</Text>
          <Text style={listItem}>- Purchase from verified sellers</Text>
          <Text style={listItem}>- Make offers on listings</Text>
          <Text style={listItem}>- Post buyer requests</Text>
        </>
      )}

      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Button href={dashboardUrl} style={button}>
          Go to Dashboard
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

const subheading = {
  fontSize: "16px",
  fontWeight: "600" as const,
  color: "#1a1a1a",
  margin: "16px 0 8px",
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
