import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Mail,
  Briefcase,
  Settings,
  Clock,
  Shield,
  CreditCard,
  AlertCircle,
  MessageSquare,
  Newspaper,
  Lightbulb,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Contact Us - Get Help with PlankMarket",
  description:
    "Contact the PlankMarket team for support with buying, selling, shipping, payments, or account questions. We're here to help flooring professionals.",
  openGraph: {
    title: "Contact PlankMarket",
    description:
      "Get in touch with the PlankMarket support team for any questions about the B2B flooring marketplace.",
  },
};

export const revalidate = 3600;

export default function ContactPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-20">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
              We&apos;re Here to Help
            </Badge>
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Get in Touch
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Reach out to the PlankMarket team with questions, feedback, or partnership inquiries. We typically respond within 24 hours.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              <strong>Tip:</strong> For order-related inquiries, please include your order number in the subject line for faster response.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Cards */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                icon: Mail,
                title: "General Support",
                email: "support@plankmarket.com",
                description:
                  "Questions about your account, listings, orders, or general platform support.",
              },
              {
                icon: Briefcase,
                title: "Business Inquiries",
                email: "partnerships@plankmarket.com",
                description:
                  "Partnership opportunities, volume seller arrangements, or business development.",
              },
              {
                icon: Settings,
                title: "Technical Support",
                email: "support@plankmarket.com",
                description:
                  "Experiencing technical difficulties? Include a description, browser info, and screenshots.",
              },
            ].map((item) => (
              <Card key={item.title} className="card-hover-lift text-center">
                <CardHeader className="items-center">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-2">
                    <item.icon className="h-7 w-7 text-primary" />
                  </div>
                  <CardTitle className="font-display">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <a
                    href={`mailto:${item.email}`}
                    className="text-primary hover:underline font-medium text-sm"
                  >
                    {item.email}
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Help Topics */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-bold">Help Topics</h2>
            <p className="mt-3 text-muted-foreground">
              Find answers in our resources before reaching out
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              {
                icon: Shield,
                title: "Seller Verification",
                description: "Questions about the verification process or documents",
                href: "/seller-guide",
              },
              {
                icon: CreditCard,
                title: "Payments & Billing",
                description: "Payment issues, payouts, and transaction details",
                href: "/pricing",
              },
              {
                icon: AlertCircle,
                title: "How It Works",
                description: "Learn about the buying and selling process",
                href: "/how-it-works",
              },
              {
                icon: MessageSquare,
                title: "Platform Messaging",
                description: "Use in-dashboard messaging for account-specific help",
                href: "/register",
              },
              {
                icon: Newspaper,
                title: "Privacy Policy",
                description: "How we handle and protect your data",
                href: "/privacy",
              },
              {
                icon: Lightbulb,
                title: "Seller Guide",
                description: "Detailed information for sellers on PlankMarket",
                href: "/seller-guide",
              },
            ].map((item) => (
              <Link key={item.title} href={item.href}>
                <Card className="card-hover-lift h-full">
                  <CardHeader className="flex-row items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center shrink-0">
                      <item.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">{item.title}</CardTitle>
                      <CardDescription className="text-xs mt-1">{item.description}</CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Office Hours & Feedback */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="card-hover-lift">
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-2">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="font-display">Office Hours</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span className="font-medium text-foreground">Monday - Friday</span>
                    <span>9:00 AM - 6:00 PM ET</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-foreground">Saturday - Sunday</span>
                    <span>Closed</span>
                  </div>
                  <p className="pt-2 text-xs">
                    We strive to respond to all inquiries within 24 hours. Response times may be longer during weekends and holidays.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="card-hover-lift">
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-2">
                  <Lightbulb className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="font-display">Feedback & Suggestions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    We are always looking to improve PlankMarket. If you have feedback, feature requests, or suggestions, we want to hear from you.
                  </p>
                  <p>
                    For press inquiries or media requests, contact{" "}
                    <a
                      href="mailto:partnerships@plankmarket.com"
                      className="text-primary hover:underline font-medium"
                    >
                      partnerships@plankmarket.com
                    </a>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="rounded-3xl bg-gradient-to-br from-primary to-secondary p-12 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
            <div className="text-center relative z-10">
              <h2 className="font-display text-3xl font-bold mb-4">
                Ready to Get Started?
              </h2>
              <p className="text-white/80 mb-8 max-w-xl mx-auto">
                Join PlankMarket and connect with flooring professionals across the United States. Create your account today.
              </p>
              <Link href="/register">
                <Button
                  size="xl"
                  className="bg-gradient-to-b from-amber-400 to-amber-500 text-amber-950 shadow-md hover:shadow-lg hover:brightness-110"
                >
                  Create Free Account <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
