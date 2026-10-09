import { FEATURES } from "@/lib/feature-flags";
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
  CreditCard,
  Shield,
  TrendingUp,
  HelpCircle,
} from "lucide-react";
import { PUBLIC_COMMERCIAL_COPY } from "@/lib/public-commercial-copy";
import { FREE_LIMITS } from "@/lib/pro";

export const metadata: Metadata = {
  title: "Pricing & Fees - Transparent B2B Marketplace Costs",
  description: `PlankMarket shows a ${PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeeLabel} and ${PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} separately, plus seller processing on inventory only and an optional Pro subscription for advanced tools.`,
  openGraph: {
    title: "PlankMarket Pricing & Fees",
    description: `Clear marketplace pricing: ${PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeeLabel}, ${PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel}, seller processing on inventory only, plus optional Pro for advanced tools.`,
  },
};

export const revalidate = 3600;

export default function PricingPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-10 sm:py-14">
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

      {/* Fee Example */}
      <section className="py-10 sm:py-14">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl">
              See both sides of an example order
            </h2>
            <p className="mt-3 text-muted-foreground">
              Compare the buyer total and projected seller transfer for the same
              order.
            </p>
          </div>
          <div className="max-w-3xl mx-auto">
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="text-xl">
                  Example: $10,000 inventory order
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm font-medium">
                      Inventory subtotal
                    </span>
                    <span className="text-sm font-semibold">
                      {PUBLIC_COMMERCIAL_COPY.exampleOrder.inventorySubtotal}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm">Quoted freight</span>
                    <span className="text-sm">
                      {PUBLIC_COMMERCIAL_COPY.exampleOrder.quotedFreight}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm">
                      Buyer fee (
                      {PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeePercent}%)
                    </span>
                    <span className="text-sm">
                      {PUBLIC_COMMERCIAL_COPY.exampleOrder.buyerFee}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 bg-secondary/10 px-3 rounded-md">
                    <span className="text-sm font-semibold">
                      Buyer total before tax
                    </span>
                    <span className="text-sm font-semibold">
                      {PUBLIC_COMMERCIAL_COPY.exampleOrder.buyerTotal}
                    </span>
                  </div>
                  <Separator className="my-4" />
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm">
                      Seller fee (
                      {PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeePercent}%)
                    </span>
                    <span className="text-sm">
                      {PUBLIC_COMMERCIAL_COPY.exampleOrder.sellerFee}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm">
                      Seller payment processing (
                      {PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel})
                    </span>
                    <span className="text-sm">
                      {PUBLIC_COMMERCIAL_COPY.exampleOrder.sellerStripeFee}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 bg-primary/10 px-3 rounded-md">
                    <span className="text-sm font-semibold">
                      Projected seller transfer
                    </span>
                    <span className="text-sm font-semibold">
                      {
                        PUBLIC_COMMERCIAL_COPY.exampleOrder
                          .projectedSellerTransfer
                      }
                    </span>
                  </div>
                  <Separator className="my-4" />
                  <div className="flex justify-between items-start py-2">
                    <span className="text-sm text-muted-foreground">
                      Freight disclosure
                    </span>
                    <span className="text-sm text-muted-foreground text-right">
                      Displayed freight charge may include carrier charges plus
                      PlankMarket shipping service margin
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-10 sm:py-14">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Buyer Card */}
            <Card className="card-hover-lift border-secondary/30 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-secondary to-secondary/50" />
              <CardHeader className="text-center pb-4">
                <Badge
                  variant="outline"
                  className="w-fit mx-auto mb-2 border-secondary text-secondary"
                >
                  For Buyers
                </Badge>
                <CardTitle className="font-display text-3xl">
                  Buyer total shown before payment
                </CardTitle>
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
                    `Up to ${FREE_LIMITS.savedSearches} saved searches with email and in-app alerts on Free`,
                    "Optional Pro for unlimited saved searches",
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
                  <Button asChild className="w-full" variant="secondary">
                    <Link href="/register?role=buyer">
                      Create a free buyer account{" "}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Seller Card */}
            <Card className="card-hover-lift border-primary/30 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-primary/50" />
              <CardHeader className="text-center pb-4">
                <Badge
                  variant="outline"
                  className="w-fit mx-auto mb-2 border-primary text-primary"
                >
                  For Sellers
                </Badge>
                <CardTitle className="font-display text-3xl">
                  Projected seller transfer
                </CardTitle>
                <CardDescription>
                  {PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} plus
                  inventory-only Stripe processing on completed sales
                </CardDescription>
              </CardHeader>
              <Separator />
              <CardContent className="pt-6">
                <ul className="space-y-3">
                  {[
                    `Free plan includes up to ${FREE_LIMITS.activeListings} active listings`,
                    `${PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} on inventory sold`,
                    `${PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel} Stripe fee on inventory subtotal only`,
                    "Review seller deductions and projected transfer in your orders",
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
                  <Button asChild className="w-full">
                    <Link href="/register?role=seller">
                      Create a seller account{" "}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
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
                  unlimited saved searches, seller offer automation and
                  repricing tools, bulk CSV import, seller CRM, market
                  intelligence
                  {FEATURES.PROMOTIONS_ENABLED
                    ? ", and monthly promotion credit"
                    : ""}
                  .
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center pb-8">
                <Button asChild variant="gold">
                  <Link href="/pro">
                    Explore Pro{" "}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Fee Breakdown */}
      <section className="py-10 sm:py-14 bg-muted/30">
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
                        Buyers pay a{" "}
                        {PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeeLabel} on the
                        inventory subtotal only. Freight is quoted separately
                        before payment, and the displayed freight charge may
                        include carrier charges plus PlankMarket shipping
                        service margin.
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
                        Sellers pay a{" "}
                        {PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} plus
                        Stripe processing of{" "}
                        {PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel} on the
                        inventory subtotal only.
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center shrink-0">
                      <TrendingUp className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">
                        Freight and Seller Transfer
                      </h3>
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

      {/* Free Plan */}
      <section className="py-10 sm:py-14">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-display text-3xl">
              Start without a subscription
            </h2>
            <p className="mt-3 text-muted-foreground">
              Create a free account and browse inventory. The Free plan includes
              up to {FREE_LIMITS.activeListings} active listings with no listing
              fee and {FREE_LIMITS.savedSearches} saved searches with email and
              in-app alerts.
            </p>
            <p className="mt-3 text-muted-foreground">
              No subscription is required to buy or sell. Transaction fees apply
              when you trade; Pro is optional for additional tools and higher
              limits.
            </p>
          </div>
        </div>
      </section>

      {/* Volume Sellers */}
      <section className="py-10 sm:py-14 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/30 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-amber-500" />
              <CardHeader className="text-center">
                <Badge className="w-fit mx-auto mb-2 border-transparent bg-amber-100 text-amber-800">
                  Inventory onboarding
                </Badge>
                <CardTitle className="font-display text-2xl">
                  Bringing a large inventory online?
                </CardTitle>
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
                <Button
                  asChild
                  variant="outline"
                  className="border-amber-300 hover:bg-amber-100"
                >
                  <Link href="mailto:partnerships@plankmarket.com">
                    Contact Partnerships Team
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Refunds & FAQ */}
      <section className="py-10 sm:py-14">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl">Common Questions</h2>
          </div>
          <div className="max-w-3xl mx-auto space-y-4">
            {[
              {
                question: "What happens in case of a dispute or return?",
                answer: `${PUBLIC_COMMERCIAL_COPY.paymentHoldModel} ${PUBLIC_COMMERCIAL_COPY.sellerTransferWithhold} Buyers can report damage, shortages, or quality issues through the platform within 48 hours of delivery with photo evidence. Freight damage must be noted on the delivery receipt at time of delivery. Our support team reviews the order, provider records, and submitted evidence. Buyer and seller marketplace fees are refunded on full refunds; partial refunds receive proportional adjustments.`,
              },
              {
                question: "Who is Pro for?",
                answer:
                  "Pro is for buyers who need more saved searches and sellers managing more inventory or repeat sales. It adds unlimited listings and saved searches, seller offer automation and repricing tools, seller CRM, bulk upload, and market intelligence. Marketplace transaction fees still apply. The core marketplace remains usable without a required subscription.",
              },
              {
                question: "Where can I review payment records?",
                answer:
                  "Your seller dashboard and order details show your order history, fee deductions, and seller-transfer status.",
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
                      <CardTitle className="text-base font-semibold">
                        {item.question}
                      </CardTitle>
                      <CardDescription className="mt-2">
                        {item.answer}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-10 sm:py-14">
        <div className="container mx-auto px-4">
          <div className="rounded-3xl bg-gradient-to-br from-primary to-secondary p-6 sm:p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
            <div className="text-center relative z-10">
              <h2 className="font-display text-3xl mb-4">
                Ready to Get Started?
              </h2>
              <p className="text-white/80 mb-8 max-w-xl mx-auto">
                Start on Free. Transaction fees apply when you trade, and Pro is
                optional when you need more tools.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button asChild size="xl" variant="gold">
                  <Link href="/register?role=buyer">
                    Create Buyer Account{" "}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="xl"
                  variant="secondary"
                  className="border-2 border-white/70 text-white bg-white/10 hover:bg-white/20"
                >
                  <Link href="/register?role=seller">
                    Create Seller Account
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
