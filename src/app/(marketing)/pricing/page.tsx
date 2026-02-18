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
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  CreditCard,
  Shield,
  TrendingUp,
  HelpCircle,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing & Fees - Transparent B2B Marketplace Costs",
  description:
    "PlankMarket charges a 3% buyer fee and 2% seller fee with no hidden costs. Transparent pricing for the B2B flooring liquidation marketplace.",
  openGraph: {
    title: "PlankMarket Pricing & Fees",
    description:
      "Simple, transparent fee structure: 3% buyer fee, 2% seller fee, no hidden costs.",
  },
};

export const revalidate = 3600;

export default function PricingPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-20">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
              No Hidden Fees
            </Badge>
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
              Simple, Transparent Pricing
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Transparent pricing with no hidden charges. PlankMarket keeps fees simple so you can focus on buying and selling flooring materials.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Buyer Card */}
            <Card className="card-hover-lift border-secondary/30 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-secondary to-secondary/50" />
              <CardHeader className="text-center pb-4">
                <Badge variant="outline" className="w-fit mx-auto mb-2 border-secondary text-secondary">
                  For Buyers
                </Badge>
                <CardTitle className="font-display text-3xl">Free</CardTitle>
                <CardDescription>Free to browse and register</CardDescription>
              </CardHeader>
              <Separator />
              <CardContent className="pt-6">
                <ul className="space-y-3">
                  {[
                    "Free to browse and register",
                    "3% buyer fee on purchases",
                    "Secure Stripe payment processing",
                    "Save searches and watchlists",
                    "Direct messaging with sellers",
                    "Order tracking and support",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-secondary shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <Link href="/register?role=buyer" className="block">
                    <Button className="w-full" variant="secondary">
                      Start Buying Free <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Seller Card */}
            <Card className="card-hover-lift border-primary/30 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-primary/50" />
              <CardHeader className="text-center pb-4">
                <Badge variant="outline" className="w-fit mx-auto mb-2 border-primary text-primary">
                  For Sellers
                </Badge>
                <CardTitle className="font-display text-3xl">Commission-Based</CardTitle>
                <CardDescription>2% commission on completed sales</CardDescription>
              </CardHeader>
              <Separator />
              <CardContent className="pt-6">
                <ul className="space-y-3">
                  {[
                    "Free to list — unlimited listings",
                    "2% commission only on completed sales",
                    "Secure payment via Stripe Connect",
                    "Built-in messaging and order management",
                    "Access to nationwide buyer network",
                    "Customer support for you and buyers",
                    "Seller dashboard and analytics",
                    "Fast payouts within 3-5 business days after shipment pickup",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <Link href="/register?role=seller" className="block">
                    <Button className="w-full">
                      Start Selling <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Fee Breakdown */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl">Fee Breakdown</h2>
            <p className="mt-3 text-muted-foreground">
              Understanding what you pay and when
            </p>
          </div>
          <div className="max-w-3xl mx-auto">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center shrink-0">
                      <CreditCard className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Platform Commission</h3>
                      <p className="text-sm text-muted-foreground">
                        PlankMarket charges a 2% seller commission and 3% buyer fee on each completed transaction. This covers listing hosting, buyer network access, secure payment processing, payment protection, messaging tools, and platform support.
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center shrink-0">
                      <Shield className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Payment Processing (Stripe)</h3>
                      <p className="text-sm text-muted-foreground">
                        Standard Stripe fees apply: approximately 2.9% + $0.30 per credit/debit card transaction. ACH transfers have lower percentage fees. These are charged by Stripe and deducted automatically before payout.
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center shrink-0">
                      <TrendingUp className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Payout Timeline</h3>
                      <p className="text-sm text-muted-foreground">
                        Once shipment is picked up by the carrier, payment is automatically released and transferred to your connected Stripe account. Funds are typically available in your bank within 3-5 business days.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Fee Example */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl">Fee Example</h2>
            <p className="mt-3 text-muted-foreground">
              See how fees work on a typical transaction
            </p>
          </div>
          <div className="max-w-3xl mx-auto">
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="text-xl">Example: $10,000 Order</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm font-medium">Subtotal</span>
                    <span className="text-sm font-semibold">$10,000.00</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm">Buyer fee (3%)</span>
                    <span className="text-sm">$300.00</span>
                  </div>
                  <div className="flex justify-between items-center py-2 bg-secondary/10 px-3 rounded-md">
                    <span className="text-sm font-semibold">Buyer total</span>
                    <span className="text-sm font-semibold">$10,300.00 + shipping</span>
                  </div>
                  <Separator className="my-4" />
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm">Seller commission (2%)</span>
                    <span className="text-sm">$200.00</span>
                  </div>
                  <div className="flex justify-between items-center py-2 bg-primary/10 px-3 rounded-md">
                    <span className="text-sm font-semibold">Seller payout</span>
                    <span className="text-sm font-semibold">$9,800.00</span>
                  </div>
                  <Separator className="my-4" />
                  <div className="flex justify-between items-start py-2">
                    <span className="text-sm text-muted-foreground">Stripe processing (~2.9% + $0.30)</span>
                    <span className="text-sm text-muted-foreground text-right">Deducted by Stripe from payout</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* No Hidden Fees */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl">No Hidden Fees</h2>
            <p className="mt-3 text-muted-foreground">
              Unlike other marketplaces, we never charge for these
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              "Monthly subscription fees",
              "Listing or insertion fees",
              "Featured listing charges",
              "Renewal fees for unsold listings",
              "Account maintenance fees",
              "Withdrawal or payout fees",
            ].map((item) => (
              <Card key={item} className="bg-red-50/50 border-red-100">
                <CardHeader className="flex-row items-center gap-3 py-4">
                  <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                  <CardDescription className="text-foreground font-medium text-sm">
                    {item}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Volume Sellers */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/30 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-amber-500" />
              <CardHeader className="text-center">
                <Badge className="w-fit mx-auto mb-2 border-transparent bg-amber-100 text-amber-800">
                  Enterprise
                </Badge>
                <CardTitle className="font-display text-2xl">Volume Sellers</CardTitle>
                <CardDescription>
                  High-volume sellers with large inventories or frequent transactions may be eligible for reduced commission rates. Contact our partnerships team to discuss custom pricing.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Link href="mailto:partnerships@plankmarket.com">
                  <Button variant="outline" className="border-amber-300 hover:bg-amber-100">
                    Contact Partnerships Team
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Refunds & FAQ */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl">Common Questions</h2>
          </div>
          <div className="max-w-3xl mx-auto space-y-4">
            {[
              {
                question: "What happens in case of a dispute or return?",
                answer:
                  "Our secure payment hold protects both parties. Buyers have 48 hours after delivery to report damage or shortage, with photo evidence and delivery receipt notes required. Freight damage must be noted on the delivery receipt at time of delivery. If no dispute is opened within 5 business days of delivery, the transaction is considered complete. Disputes are mediated by our support team. Commission and processing fees are refunded on full refunds; partial refunds get proportional adjustments.",
              },
              {
                question: "Are there plans for premium features?",
                answer:
                  "We are developing optional premium features like featured listing placement, priority support, advanced analytics, and inventory management integrations. All premium features will be optional — core features remain available at standard commission rates.",
              },
              {
                question: "How does tax reporting work?",
                answer:
                  "Sellers receive tax documentation from Stripe Connect for all transactions. You are responsible for reporting income and paying applicable taxes per local, state, and federal regulations.",
              },
              {
                question: "Have more questions about pricing?",
                answer:
                  "Contact us at support@plankmarket.com. We are happy to explain how our pricing works and help you understand your expected costs or earnings.",
              },
            ].map((item) => (
              <Card key={item.question} className="card-hover-lift">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <HelpCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <CardTitle className="text-base font-semibold">{item.question}</CardTitle>
                      <CardDescription className="mt-2">{item.answer}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="rounded-3xl bg-gradient-to-br from-primary to-secondary p-12 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
            <div className="text-center relative z-10">
              <h2 className="font-display text-3xl mb-4">
                Ready to Get Started?
              </h2>
              <p className="text-white/80 mb-8 max-w-xl mx-auto">
                Join PlankMarket today. Buyers browse for free, sellers pay only when they sell.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/register?role=buyer">
                  <Button
                    size="xl"
                    variant="gold"
                  >
                    Create Buyer Account <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/register?role=seller">
                  <Button
                    size="xl"
                    variant="secondary"
                    className="border-2 border-white/70 text-white bg-white/10 hover:bg-white/20"
                  >
                    Create Seller Account
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
