import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Section,
  Text,
  Hr,
} from "@react-email/components";
import * as React from "react";

interface EmailLayoutProps {
  children: React.ReactNode;
  previewText?: string;
}

export function EmailLayout({ children, previewText }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        {previewText && (
          <Text style={preview}>{previewText}</Text>
        )}
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Text style={logo}>PlankMarket</Text>
          </Section>

          {/* Content */}
          <Section style={content}>{children}</Section>

          {/* Footer */}
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>
              PlankMarket - B2B Wood Flooring Marketplace
            </Text>
            <Text style={footerText}>
              You are receiving this email because you have an account on
              PlankMarket. To manage your email preferences, visit your{" "}
              <Link href={`${process.env.NEXT_PUBLIC_APP_URL ?? "https://plankmarket.com"}/settings/notifications`} style={footerLink}>
                notification settings
              </Link>
              .
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f5f3",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const preview = {
  display: "none" as const,
  maxHeight: 0,
  overflow: "hidden" as const,
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "0",
  maxWidth: "600px",
  borderRadius: "8px",
  overflow: "hidden" as const,
};

const header = {
  backgroundColor: "#5C4033",
  padding: "24px 32px",
};

const logo = {
  color: "#ffffff",
  fontSize: "24px",
  fontWeight: "bold" as const,
  margin: "0",
};

const content = {
  padding: "32px",
};

const hr = {
  borderColor: "#e5e5e5",
  margin: "0",
};

const footer = {
  padding: "24px 32px",
};

const footerText = {
  color: "#999999",
  fontSize: "12px",
  lineHeight: "16px",
  margin: "4px 0",
};

const footerLink = {
  color: "#5C4033",
  textDecoration: "underline" as const,
};
