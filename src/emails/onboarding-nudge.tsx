import { Text, Section, Button } from "@react-email/components";
import { EmailLayout } from "./components/layout";
import * as React from "react";

interface OnboardingNudgeEmailProps {
  name: string;
  role: "buyer" | "seller";
  step: "day1" | "day3" | "day7";
  dashboardUrl: string;
}

const content = {
  day1: {
    buyer: {
      subject: "Complete your PlankMarket profile",
      preview: "A quick setup unlocks personalized deals",
      heading: "Complete Your Profile",
      body: "A complete profile helps sellers trust you and unlocks personalized recommendations. It only takes a minute.",
      cta: "Complete Profile",
    },
    seller: {
      subject: "Complete your PlankMarket profile",
      preview: "Set up your seller profile to start selling",
      heading: "Complete Your Profile",
      body: "Complete your profile and connect Stripe to start receiving orders. Buyers look for sellers with complete profiles.",
      cta: "Complete Profile",
    },
  },
  day3: {
    buyer: {
      subject: "Tips to find the best deals on PlankMarket",
      preview: "Browse, save searches, and get alerts",
      heading: "Find Your Perfect Flooring",
      body: "Set up your preferences to get personalized recommendations. Save searches to get email alerts when new inventory matches your needs.",
      cta: "Set Preferences",
    },
    seller: {
      subject: "Ready to create your first listing?",
      preview: "List your inventory and reach thousands of buyers",
      heading: "Create Your First Listing",
      body: "Our guided listing form makes it easy. Add photos, set your price, and reach thousands of qualified buyers. Connect Stripe to get paid.",
      cta: "Create Listing",
    },
  },
  day7: {
    buyer: {
      subject: "Need help getting started on PlankMarket?",
      preview: "We're here to help you find great deals",
      heading: "We're Here to Help",
      body: "Not sure where to start? Browse our marketplace, post a buyer request to let sellers come to you, or reply to this email with questions.",
      cta: "Browse Listings",
    },
    seller: {
      subject: "Need help getting started on PlankMarket?",
      preview: "Check out our seller guide",
      heading: "We're Here to Help",
      body: "Check out our seller guide for tips on pricing, photos, and getting your first sale. You can also reply to this email with questions.",
      cta: "Read Seller Guide",
    },
  },
};

const ctaUrls = {
  day1: { buyer: "/buyer/settings", seller: "/seller/settings" },
  day3: { buyer: "/preferences", seller: "/seller/listings/new" },
  day7: { buyer: "/listings", seller: "/seller-guide" },
};

export default function OnboardingNudgeEmail({
  name = "John",
  role = "buyer",
  step = "day1",
  dashboardUrl = "https://plankmarket.com",
}: OnboardingNudgeEmailProps) {
  const c = content[step][role];
  const ctaPath = ctaUrls[step][role];
  const ctaUrl = `${dashboardUrl}${ctaPath}`;

  return (
    <EmailLayout previewText={c.preview}>
      <Text style={headingStyle}>{c.heading}</Text>
      <Text style={paragraph}>Hi {name},</Text>
      <Text style={paragraph}>{c.body}</Text>

      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Button href={ctaUrl} style={buttonStyle}>
          {c.cta}
        </Button>
      </Section>
    </EmailLayout>
  );
}

// Export subjects for use in send functions
export function getOnboardingNudgeSubject(
  step: "day1" | "day3" | "day7",
  role: "buyer" | "seller",
) {
  return content[step][role].subject;
}

const headingStyle = {
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

const buttonStyle = {
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
