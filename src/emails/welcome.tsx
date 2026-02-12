import { Text, Section, Button } from "@react-email/components";
import { EmailLayout } from "./components/layout";
import * as React from "react";

interface WelcomeEmailProps {
  name: string;
  role: "buyer" | "seller";
  dashboardUrl: string;
}

export default function WelcomeEmail({
  name = "John",
  role = "buyer",
  dashboardUrl = "https://plankmarket.com/buyer",
}: WelcomeEmailProps) {
  return (
    <EmailLayout previewText="Welcome to PlankMarket!">
      <Text style={heading}>Welcome to PlankMarket!</Text>
      <Text style={paragraph}>Hi {name},</Text>
      <Text style={paragraph}>
        Thank you for joining PlankMarket, the B2B marketplace for liquidation
        and closeout flooring inventory.
      </Text>

      {role === "buyer" ? (
        <>
          <Text style={paragraph}>
            As a buyer, you can now browse thousands of flooring lots at
            wholesale prices, save searches with alerts, and purchase directly
            from verified sellers.
          </Text>
          <Text style={subheading}>Get started:</Text>
          <Text style={listItem}>
            - Browse listings by material, species, and condition
          </Text>
          <Text style={listItem}>
            - Set up saved search alerts for your preferred products
          </Text>
          <Text style={listItem}>
            - Add items to your watchlist for later
          </Text>
        </>
      ) : (
        <>
          <Text style={paragraph}>
            As a seller, you can list your overstock, discontinued, and closeout
            flooring inventory to reach thousands of retail buyers.
          </Text>
          <Text style={subheading}>Get started:</Text>
          <Text style={listItem}>
            - Complete your Stripe payment setup to receive payouts
          </Text>
          <Text style={listItem}>
            - Create your first listing with our guided form
          </Text>
          <Text style={listItem}>
            - Upload photos and set competitive pricing
          </Text>
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
