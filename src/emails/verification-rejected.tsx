import { Text, Section, Button } from "@react-email/components";
import { EmailLayout } from "./components/layout";
import * as React from "react";

interface VerificationRejectedEmailProps {
  name: string;
  reason?: string;
  resubmitUrl: string;
}

export default function VerificationRejectedEmail({
  name = "John",
  reason,
  resubmitUrl = "https://plankmarket.com/seller/verification",
}: VerificationRejectedEmailProps) {
  return (
    <EmailLayout previewText="Update on your PlankMarket verification">
      <Text style={heading}>Verification Update</Text>
      <Text style={paragraph}>Hi {name},</Text>
      <Text style={paragraph}>
        We were unable to verify your business at this time.
      </Text>

      {reason && (
        <Text style={reasonBox}>
          <strong>Reason:</strong> {reason}
        </Text>
      )}

      <Text style={paragraph}>
        You can resubmit your verification with updated documents. If you believe
        this is an error, please contact our support team.
      </Text>

      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Button href={resubmitUrl} style={button}>
          Resubmit Verification
        </Button>
      </Section>

      <Text style={footerNote}>
        Need help? Reply to this email or contact support@plankmarket.com
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

const reasonBox = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#92400e",
  backgroundColor: "#fef3c7",
  padding: "12px 16px",
  borderRadius: "6px",
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

const footerNote = {
  fontSize: "12px",
  color: "#999999",
  marginTop: "24px",
};
