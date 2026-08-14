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
import { PUBLIC_COMMERCIAL_COPY } from "@/lib/public-commercial-copy";

export const metadata: Metadata = {
  title: "Pricing & Fees - Transparent B2B Marketplace Costs",
  description:
    `PlankMarket shows a ${PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeeLabel} and ${PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} separately, plus seller processing on inventory only and an optional Pro subscription for advanced tools.`,
  openGraph: {
    title: "PlankMarket Pricing & Fees",
    description:
      `Clear marketplace pricing: ${PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeeLabel}, ${PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel}, seller processing on inventory only, plus optional Pro for advanced tools.`,
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
              Clear Economics
            </Badge>
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
              Clear buyer totals. Clear seller transfer.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Buyer and seller fees are shown separately. Seller processing is
              disclosed on inventory only, and freight is quoted before payment.
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
                <CardTitle className="font-display text-3xl">Buyer total shown before payment</CardTitle>
                <CardDescription>Free to browse and register</CardDescription>
              </CardHeader>
              <Separator />
              <CardContent className="pt-6">
                <ul className="space-y-3">
                  {[
                    "Free to browse and register",
                    `${PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeeLabel} on inventory purchases`,
                    "Selected freight quote shown before payment",
                    "Displayed freight charge may include carrier charges plus PlankMarket shipping service margin",
                    "Up to 3 saved searches on Free",
                    "Optional Pro for unlimited saved searches and saved-search monitoring",
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
                <CardTitle className="font-display text-3xl">Projected seller transfer</CardTitle>
                <CardDescription>{PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} plus inventory-only Stripe processing on completed sales</CardDescription>
              </CardHeader>
              <Separator />
              <CardContent className="pt-6">
                <ul className="space-y-3">
                  {[
                    "Free plan includes up to 10 active listings",
                    `${PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} on inventory sold`,
                    `${PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel} Stripe fee on inventory subtotal only`,
                    "Projected seller transfer shown before accepting the order",
                    "Built-in messaging and order management",
                    "Access to verified buyers in supported markets",
                    "Optional Pro for unlimited listings, bulk upload, seller CRM, and market intelligence",
                    "Customer support for you and buyers",
                    "Seller dashboard and analytics",
                    PUBLIC_COMMERCIAL_COPY.sellerTransferTiming,
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

      {/* Optional Pro */}
      <section className="pb-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <Card className="relative overflow-hidden border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100/40">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-amber-500" />
              <CardHeader className="text-center">
                <Badge className="mx-auto w-fit border-transparent bg-amber-100 text-amber-800">
                  Optional Upgrade
                </Badge>
                <CardTitle className="font-display text-2xl">
                  PlankMarket Pro
                </CardTitle>
                <CardDescription className="max-w-2xl mx-auto">
                  Power users can upgrade to Pro for unlimited listings,
                  unlimited saved searches, saved-search monitoring and seller
                  repricing tools, bulk CSV import, seller CRM, market
                  intelligence, and monthly promotion credit.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center pb-8">
                <Link href="/pro">
                  <Button variant="gold">
                    Explore Pro <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Fee Breakdown */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl">Who pays what, and when</h2>
            <p className="mt-3 text-muted-foreground">
              Separate buyer charges, seller deductions, and freight disclosure
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
                      <h3 className="font-semibold mb-1">Buyer Charge</h3>
                      <p className="text-sm text-muted-foreground">
                        Buyers pay a {PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeeLabel} on the inventory subtotal
                        only. Freight is quoted separately before payment, and
                        the displayed freight charge may include carrier charges
                        plus PlankMarket shipping service margin.
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center shrink-0">
                      <Shield className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Seller Deductions</h3>
                      <p className="text-sm text-muted-foreground">
                        Sellers pay a {PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} plus Stripe processing
                        of {PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel} on the inventory subtotal only.
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center shrink-0">
                      <TrendingUp className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Freight and Seller Transfer</h3>
                      <p className="text-sm text-muted-foreground">
                        {PUBLIC_COMMERCIAL_COPY.paymentHoldModel}{" "}
                        {PUBLIC_COMMERCIAL_COPY.sellerTransferWithhold} Bank
                        availability then depends on Stripe and the connected
                        account&apos;s payout schedule.{" "}
                        {PUBLIC_COMMERCIAL_COPY.notRegulatedEscrow}
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
              See how the buyer total and seller transfer are modeled on a typical transaction
            </p>
          </div>
          <div className="max-w-3xl mx-auto">
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="text-xl">Example: $10,000 inventory order</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm font-medium">Inventory subtotal</span>
                    <span className="text-sm font-semibold">{PUBLIC_COMMERCIAL_COPY.exampleOrder.inventorySubtotal}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm">Quoted freight</span>
                    <span className="text-sm">{PUBLIC_COMMERCIAL_COPY.exampleOrder.quotedFreight}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm">Buyer fee ({PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeePercent}%)</span>
                    <span className="text-sm">{PUBLIC_COMMERCIAL_COPY.exampleOrder.buyerFee}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 bg-secondary/10 px-3 rounded-md">
                    <span className="text-sm font-semibold">Buyer total</span>
                    <span className="text-sm font-semibold">{PUBLIC_COMMERCIAL_COPY.exampleOrder.buyerTotal}</span>
                  </div>
                  <Separator className="my-4" />
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm">Seller fee ({PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeePercent}%)</span>
                    <span className="text-sm">{PUBLIC_COMMERCIAL_COPY.exampleOrder.sellerFee}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm">Seller Stripe fee ({PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel})</span>
                    <span className="text-sm">{PUBLIC_COMMERCIAL_COPY.exampleOrder.sellerStripeFee}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 bg-primary/10 px-3 rounded-md">
                    <span className="text-sm font-semibold">Projected seller transfer</span>
                    <span className="text-sm font-semibold">{PUBLIC_COMMERCIAL_COPY.exampleOrder.projectedSellerTransfer}</span>
                  </div>
                  <Separator className="my-4" />
                  <div className="flex justify-between items-start py-2">
                    <span className="text-sm text-muted-foreground">Freight disclosure</span>
                    <span className="text-sm text-muted-foreground text-right">Displayed freight charge may include carrier charges plus PlankMarket shipping service margin</span>
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
              "Required monthly subscription to buy or sell",
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
                  High-volume sellers with large inventories or frequent
                  transactions can contact partnerships for onboarding and
                  inventory workflow help. Published seller fees stay at{" "}
                  {PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} plus{" "}
                  {PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel} processing.
                  There is no reduced-rate path in the current fee schedule.
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
                  `${PUBLIC_COMMERCIAL_COPY.paymentHoldModel} ${PUBLIC_COMMERCIAL_COPY.sellerTransferWithhold} Buyers can report damage, shortages, or quality issues through the platform within 48 hours of delivery with photo evidence. Freight damage must be noted on the delivery receipt at time of delivery. Our support team reviews the order, provider records, and submitted evidence. Buyer and seller marketplace fees are refunded on full refunds; partial refunds receive proportional adjustments.`,
              },
              {
                question: "Are there plans for premium features?",
                answer:
                  "Yes. PlankMarket Pro is already available for power users who want unlimited listings or saved searches, saved-search monitoring and seller repricing tools, seller CRM, bulk upload, and market intelligence. The core marketplace remains usable without a required subscription.",
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
                Join PlankMarket today. Buyers browse for free, sellers pay only when they sell, and power users can upgrade to Pro when they need advanced tools.
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
