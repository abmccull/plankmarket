import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  Database,
  Settings,
  Share2,
  Lock,
  UserCheck,
  Cookie,
  Clock,
  Baby,
  Globe,
  RefreshCw,
  Mail,
  Shield,
  Gavel,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "PlankMarket Privacy Policy detailing how we collect, use, and protect your data on the B2B flooring marketplace.",
  robots: { index: false, follow: true },
};

export const revalidate = 3600;

export default function PrivacyPolicyPage() {
  const sections = [
    {
      icon: Database,
      number: "1",
      title: "Information We Collect",
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm mb-2">Information You Provide</h4>
            <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Registration info (name, email, business information, phone number)</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Listing details (product details, images, location)</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Transaction info (billing information, shipping address)</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Communications (messages, support requests)</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Profile details (business details, preferences)</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-2">Automatically Collected Information</h4>
            <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Device information (IP address, browser type, operating system)</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Usage data (pages viewed, time spent, click patterns)</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Location data (approximate geographic location based on IP)</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Cookies and similar tracking technologies</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-2">Payment Information</h4>
            <p className="text-sm text-muted-foreground">
              Payment information is processed by our third-party payment processor. We do not store complete credit card numbers or sensitive payment data on our servers. We may store limited payment information such as the last four digits and expiration date for reference purposes.
            </p>
          </div>
        </div>
      ),
    },
    {
      icon: Settings,
      number: "2",
      title: "How We Use Your Information",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">We use the information we collect to:</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Provide, maintain, and improve our platform services</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Process transactions and send related information</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Send administrative information, updates, and security alerts</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Respond to your comments, questions, and support requests</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Monitor and analyze usage patterns and trends</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Detect, prevent, and address fraud and security issues</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Personalize your experience and show relevant listings</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Send marketing communications (with your consent)</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Comply with legal obligations and enforce our terms</li>
          </ul>
        </div>
      ),
    },
    {
      icon: Share2,
      number: "3",
      title: "Information Sharing and Disclosure",
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm mb-2">With Other Users</h4>
            <p className="text-sm text-muted-foreground">
              When you create a listing or make a purchase, certain information (such as your business name and location) may be visible to other users to facilitate transactions.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-2">With Service Providers</h4>
            <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Payment processing and fraud detection</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Cloud hosting and data storage</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Email delivery and communication services</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Analytics and performance monitoring</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Customer support tools</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-2">For Legal Reasons</h4>
            <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Comply with legal obligations or respond to lawful requests</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Protect the rights, property, or safety of PlankMarket or others</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Investigate and prevent fraud or security issues</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Enforce our Terms of Service</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-2">Business Transfers</h4>
            <p className="text-sm text-muted-foreground">
              In the event of a merger, acquisition, or sale of assets, your information may be transferred to the acquiring entity. We will notify you of any such change.
            </p>
          </div>
        </div>
      ),
    },
    {
      icon: Lock,
      number: "4",
      title: "Data Security",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            We implement appropriate technical and organizational security measures to protect your information:
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            We use reasonable administrative, technical, and physical safeguards to protect your information. Data is transmitted using industry-standard encryption protocols.
          </p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Access controls and authentication mechanisms</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Employee training on data protection practices</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            No method of transmission over the internet is completely secure. While we strive to protect your information, we cannot guarantee absolute security.
          </p>
        </div>
      ),
    },
    {
      icon: UserCheck,
      number: "5",
      title: "Your Rights and Choices",
      content: (
        <div className="space-y-4">
          {[
            {
              subtitle: "Access and Update",
              text: "You can access and update your account information at any time through your account settings.",
            },
            {
              subtitle: "Data Portability",
              text: "You have the right to request a copy of your personal information in a structured, machine-readable format.",
            },
            {
              subtitle: "Deletion",
              text: "You may request deletion of your account and associated data. Note that we may retain certain information as required by law or for legitimate business purposes.",
            },
            {
              subtitle: "Marketing Communications",
              text: "You can opt out of marketing emails by clicking the unsubscribe link in any marketing message or by updating your account preferences.",
            },
            {
              subtitle: "Do Not Track",
              text: "Some browsers include a Do Not Track feature. Our platform does not currently respond to Do Not Track signals.",
            },
          ].map((item) => (
            <div key={item.subtitle}>
              <h4 className="font-semibold text-sm mb-1">{item.subtitle}</h4>
              <p className="text-sm text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      icon: Cookie,
      number: "6",
      title: "Cookies and Tracking Technologies",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">We use cookies and similar tracking technologies to:</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Keep you logged in to your account</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Remember your preferences and settings</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Analyze usage patterns and improve our platform</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Provide personalized content and advertising</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            You can control cookies through your browser settings. Disabling cookies may affect the functionality of certain features.
          </p>
        </div>
      ),
    },
    {
      icon: Clock,
      number: "7",
      title: "Data Retention",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            We retain your information for as long as your account is active or as needed to provide services. After account deletion, we may retain certain information for:
          </p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Legal and regulatory compliance</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Dispute resolution and fraud prevention</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Enforcing our agreements</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>Backup and disaster recovery purposes</li>
          </ul>
        </div>
      ),
    },
    {
      icon: Baby,
      number: "8",
      title: "Children's Privacy",
      content: (
        <p className="text-sm text-muted-foreground">
          PlankMarket is not intended for users under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected information from a child, we will take steps to delete such information promptly.
        </p>
      ),
    },
    {
      icon: Globe,
      number: "9",
      title: "International Data Transfers",
      content: (
        <p className="text-sm text-muted-foreground">
          Your information may be transferred to and processed in countries other than your country of residence. These countries may have different data protection laws. By using PlankMarket, you consent to the transfer of your information to these countries.
        </p>
      ),
    },
    {
      icon: RefreshCw,
      number: "10",
      title: "Changes to This Privacy Policy",
      content: (
        <p className="text-sm text-muted-foreground">
          We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the &quot;Last Updated&quot; date. Your continued use of PlankMarket after changes are posted constitutes acceptance of the updated policy.
        </p>
      ),
    },
    {
      icon: Mail,
      number: "11",
      title: "Contact Us",
      content: (
        <p className="text-sm text-muted-foreground">
          If you have questions about this Privacy Policy or our data practices, please contact us at{" "}
          <a href="mailto:privacy@plankmarket.com" className="text-primary hover:underline font-medium">
            privacy@plankmarket.com
          </a>
        </p>
      ),
    },
    {
      icon: Shield,
      number: "12",
      title: "Additional Rights for California Residents",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):
          </p>
          <ul className="space-y-1.5 text-sm text-muted-foreground ml-4">
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>The right to know what personal information we collect</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>The right to delete your personal information</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>The right to opt-out of the sale of personal information (we do not sell personal information)</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-1.5 shrink-0">&#8226;</span>The right to non-discrimination for exercising your rights</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            To exercise these rights, please contact us at the email address above.
          </p>
        </div>
      ),
    },
  ];

  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-20">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
              Legal
            </Badge>
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
              Privacy Policy
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              At PlankMarket, we take your privacy seriously. This policy explains how we collect, use, disclose, and safeguard your information.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Last Updated: February 13, 2026
            </p>
          </div>
        </div>
      </section>

      {/* Sections */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {sections.map((section) => (
              <Card key={section.number}>
                <CardHeader className="flex-row items-start gap-4 pb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center shrink-0">
                    <section.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg font-display pt-1.5">
                    {section.number}. {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pl-[4.5rem]">
                  {section.content}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <Separator className="mb-8" />
            <div className="flex items-center justify-center gap-2 mb-4">
              <Gavel className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl">Related Policies</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Please also review our other policies that govern your use of PlankMarket.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/terms">
                <Button variant="outline">
                  Terms of Service <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button variant="outline">
                  Contact Us <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
