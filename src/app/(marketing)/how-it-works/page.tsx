import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Search,
  ShoppingCart,
  Truck,
  DollarSign,
  BarChart3,
  Shield,
  Eye,
  CreditCard,
  Globe,
} from "lucide-react";
import { TransactionTimelineExplainer } from "@/components/marketplace/transaction-timeline";
import { PUBLIC_COMMERCIAL_COPY } from "@/lib/public-commercial-copy";

export const metadata: Metadata = {
  title: "How It Works - Buy & Sell Surplus Flooring",
  description:
    "Discover how PlankMarket works for buyers and sellers. Browse surplus flooring inventory, purchase through Stripe, and coordinate freight in supported markets.",
  openGraph: {
    title: "How PlankMarket Works",
    description:
      "Simple, transparent process for buying and selling surplus flooring materials B2B.",
  },
};

export const revalidate = 3600;

export default function HowItWorksPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-10 sm:py-14">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
              Buy, sell and coordinate freight
            </Badge>
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
              How PlankMarket Works
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Browse flooring without an account, or prepare your business to
              sell. Keep the listing, offer, payment and shipment record
              together.
            </p>
            <nav
              aria-label="Choose your journey"
              className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium"
            >
              <Link
                href="#buyers"
                className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
              >
                Buying flooring
              </Link>
              <Link
                href="#sellers"
                className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
              >
                Selling inventory
              </Link>
              <Link
                href="#payment"
                className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
              >
                Payment and transfer
              </Link>
              <Link
                href="#freight"
                className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
              >
                Freight
              </Link>
            </nav>
          </div>
        </div>
      </section>

      {/* Buyer Steps */}
      <section id="buyers" className="scroll-mt-24 py-10 sm:py-14">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <Badge variant="outline" className="mb-4">
              For Buyers
            </Badge>
            <h2 className="font-display text-3xl">
              Find and Purchase Flooring
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              Compare the lot first. Create an account to save searches, ask
              questions or make an offer; complete business verification before
              checkout.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Search,
                step: "1",
                title: "Browse Inventory",
                description:
                  "Browse without an account. Filter flooring by material, quantity, condition, price and location, then inspect the lot details and photos.",
              },
              {
                icon: ShoppingCart,
                step: "2",
                title: "See Clear Pricing",
                description:
                  "Review price per square foot, total lot size, minimum order, condition, origin region, seller verification status, photos, and freight-estimate readiness before checkout.",
              },
              {
                icon: CreditCard,
                step: "3",
                title: "Verify and Check Out",
                description: `After business approval, review your quantity, the ${PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeeLabel}, selected freight and any applicable tax before paying through Stripe.`,
              },
              {
                icon: Truck,
                step: "4",
                title: "Receive Your Order",
                description:
                  "Track your order status through your dashboard. Inspect materials upon delivery and note any issues on the delivery receipt. You have 48 hours after delivery to report damage or shortages with photo evidence.",
              },
            ].map((item) => (
              <Card key={item.step}>
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                      {item.step}
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                      <item.icon
                        className="h-6 w-6 text-primary"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                  <CardTitle className="font-display">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Seller Steps */}
      <section id="sellers" className="scroll-mt-24 py-10 sm:py-14 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <Badge variant="outline" className="mb-4">
              For Sellers
            </Badge>
            <h2 className="font-display text-3xl">
              List and Sell Your Surplus
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              Prepare lot details in a draft on this browser while you complete
              business verification. Approval is required to upload product
              photos and publish.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Shield,
                step: "1",
                title: "Create and Verify Your Account",
                description:
                  "Register your seller account and complete the resumable business-verification steps. You can prepare a local draft before approval; connect Stripe to receive seller transfers.",
              },
              {
                icon: DollarSign,
                step: "2",
                title: "Prepare and Price the Lot",
                description:
                  "Prepare specifications, condition, quantity, minimum order, pricing and pallet details in your local draft. After approval, add product photos, review the details and publish.",
              },
              {
                icon: ShoppingCart,
                step: "3",
                title: "Receive Orders or Offers",
                description:
                  "Review orders and offers in your dashboard. Answer questions and accept, counter or decline offers on-platform. Stripe processes completed buyer payments.",
              },
              {
                icon: BarChart3,
                step: "4",
                title: "Ship & Get Paid",
                description:
                  "Coordinate freight pickup through PlankMarket and track it on the order. After confirmed pickup and the release waiting period, PlankMarket checks payment, shipment, refund and dispute status before initiating a Stripe Connect transfer. Bank availability is determined by Stripe and the seller's bank.",
              },
            ].map((item) => (
              <Card key={item.step}>
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                      {item.step}
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                      <item.icon
                        className="h-6 w-6 text-secondary"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                  <CardTitle className="font-display">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section
        id="payment"
        className="scroll-mt-24 border-y bg-background py-10 sm:py-14"
      >
        <div className="container mx-auto px-4">
          <div className="mx-auto mb-10 max-w-3xl text-center">
            <Badge variant="outline" className="mb-4">
              Transaction record
            </Badge>
            <h2 className="font-display text-3xl">
              What happens after checkout
            </h2>
            <p className="mt-3 text-muted-foreground">
              Payment, freight, carrier pickup, seller transfer, delivery, and
              issue reporting are separate recorded milestones. Your order
              dashboard shows the state PlankMarket has actually received.
            </p>
          </div>
          <div className="mx-auto max-w-3xl">
            <details className="rounded-lg border p-5">
              <summary className="cursor-pointer font-semibold">
                See the payment and shipment milestones
              </summary>
              <div className="mt-5">
                <TransactionTimelineExplainer />
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-10 sm:py-14">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="font-display text-3xl">
              Built around the transaction
            </h2>
            <p className="mt-3 text-muted-foreground">
              The details and records you can review before and after purchase.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {[
              {
                icon: Shield,
                title: "Visible Seller Verification",
                description:
                  "Seller verification status appears on marketplace listings. Review the status, listing photos, condition, and available reputation history before purchasing.",
              },
              {
                icon: Eye,
                title: "Transparent Pricing",
                description:
                  "Buyer and seller fees are disclosed separately, and freight quotes are shown before payment.",
              },
              {
                icon: CreditCard,
                title: "Stripe-Processed Payments",
                description: PUBLIC_COMMERCIAL_COPY.paymentHoldModel,
              },
              {
                icon: Globe,
                title: "Supported-Market Shipping",
                description:
                  "Buy and sell flooring where seller territories and current supported-market coverage overlap. Buyers select an integrated carrier quote at checkout when available, and sellers prepare the order for scheduled pickup.",
              },
            ].map((item) => (
              <Card key={item.title}>
                <CardHeader>
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-2">
                    <item.icon
                      className="h-6 w-6 text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <CardTitle className="font-display">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Shipping & Freight */}
      <section id="freight" className="scroll-mt-24 py-10 sm:py-14 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <Badge variant="outline" className="mb-4">
              Shipping & Freight
            </Badge>
            <h2 className="font-display text-3xl">
              How freight works on PlankMarket
            </h2>
          </div>
          <div className="max-w-3xl mx-auto space-y-4">
            {[
              {
                question: "Who arranges freight?",
                answer:
                  "PlankMarket provides an integrated displayed freight charge at checkout. Buyers enter their delivery address and select a carrier rate, and the seller coordinates pickup from their warehouse.",
              },
              {
                question: "When is shipping quoted?",
                answer:
                  "Freight quotes are generated at checkout based on the buyer's delivery address, pallet weight, and dimensions. The displayed shipping charge is shown before payment, added separately from the inventory subtotal, and may include carrier charges plus PlankMarket shipping service margin.",
              },
              {
                question: "Can the seller arrange their own freight?",
                answer:
                  "Checkout uses PlankMarket's integrated carrier quotes. After payment, the seller coordinates the scheduled warehouse pickup through the order workflow.",
              },
            ].map((item) => (
              <Card key={item.question}>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">
                    {item.question}
                  </CardTitle>
                  <CardDescription>{item.answer}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-10 sm:py-14">
        <div className="container mx-auto px-4">
          <div className="rounded-xl bg-primary p-6 text-primary-foreground relative overflow-hidden sm:p-10">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
            <div className="text-center relative z-10">
              <h2 className="font-display text-3xl mb-4">
                Ready to Get Started?
              </h2>
              <p className="text-white/80 mb-8 max-w-xl mx-auto">
                Browse available lots now, or create a seller account and
                prepare your business verification.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  asChild
                  size="xl"
                  variant="gold"
                  className="h-auto min-h-12 w-full whitespace-normal px-4 py-3 sm:w-auto"
                >
                  <Link href="/listings">
                    Browse inventory{" "}
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="xl"
                  variant="outline"
                  className="h-auto min-h-12 w-full whitespace-normal px-4 py-3 sm:w-auto"
                >
                  <Link href="/register?role=seller">
                    Create seller account
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
