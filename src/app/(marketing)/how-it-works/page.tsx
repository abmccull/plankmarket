import { Metadata } from "next";
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
  Package,
  DollarSign,
  BarChart3,
  Shield,
  Eye,
  CreditCard,
  Globe,
} from "lucide-react";
import { TransactionTimelineExplainer } from "@/components/marketplace/transaction-timeline";

export const metadata: Metadata = {
  title: "How It Works - Buy & Sell Surplus Flooring",
  description:
    "Discover how PlankMarket works for buyers and sellers. Browse surplus flooring inventory, purchase securely via Stripe, and coordinate freight shipping nationwide.",
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
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-20">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
              Simple & Transparent
            </Badge>
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
              How PlankMarket Works
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              PlankMarket connects buyers and sellers of surplus flooring materials through a simple, transparent process. Whether you are sourcing materials or clearing inventory, we make it easy.
            </p>
          </div>
        </div>
      </section>

      {/* Buyer Steps */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4">For Buyers</Badge>
            <h2 className="font-display text-3xl">
              Find and Purchase Flooring
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              Finding the flooring inventory you need has never been easier. Our platform simplifies the entire purchasing process from discovery to delivery.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Search,
                step: "1",
                title: "Browse Inventory",
                description:
                  "Browse listings featuring hardwood, engineered wood, vinyl plank, laminate, bamboo, and tile. Filter by material type, color, finish, lot size, price, and location.",
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
                title: "Pay Through Stripe",
                description:
                  "Complete your purchase through Stripe. After tracked carrier pickup and the configured delay, PlankMarket rechecks the transaction before initiating a separate seller transfer.",
              },
              {
                icon: Truck,
                step: "4",
                title: "Receive Your Order",
                description:
                  "Track your order status through your dashboard. Inspect materials upon delivery and note any issues on the delivery receipt. You have 48 hours after delivery to report damage or shortages with photo evidence.",
              },
            ].map((item) => (
              <Card key={item.step} className="card-hover-lift">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                      {item.step}
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                      <item.icon className="h-6 w-6 text-primary" />
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
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4">For Sellers</Badge>
            <h2 className="font-display text-3xl">
              List and Sell Your Surplus
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              Turn your surplus flooring inventory into revenue. PlankMarket provides everything you need to list, manage, and sell your overstock, closeouts, and discontinued materials.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Package,
                step: "1",
                title: "List Your Inventory",
                description:
                  "Create detailed listings in minutes. Upload high-quality photos, specify material type, color, finish, dimensions, and quantity. The more detail, the faster it sells.",
              },
              {
                icon: DollarSign,
                step: "2",
                title: "Set Your Pricing",
                description:
                  "You control the price. Set competitive rates based on market conditions, material quality, and lot size. Update pricing anytime to respond to demand.",
              },
              {
                icon: ShoppingCart,
                step: "3",
                title: "Receive Orders or Offers",
                description:
                  "Get notified immediately when a buyer places an order or submits an offer. Accept, counter, or decline — all on-platform. Stripe processes buyer payments.",
              },
              {
                icon: BarChart3,
                step: "4",
                title: "Ship & Get Paid",
                description:
                  "Coordinate freight pickup through PlankMarket and track it on the order. After confirmed pickup and the configured delay, PlankMarket rechecks the transaction before initiating a Stripe Connect transfer. Bank availability is determined by Stripe and the seller's bank.",
              },
            ].map((item) => (
              <Card key={item.step} className="card-hover-lift">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                      {item.step}
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                      <item.icon className="h-6 w-6 text-secondary" />
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

      <section className="border-y bg-background py-20">
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
            <TransactionTimelineExplainer />
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl">Key Benefits</h2>
            <p className="mt-3 text-muted-foreground">
              Why flooring professionals trust PlankMarket
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {[
              {
                icon: Shield,
                title: "Verified Sellers",
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
                description:
                  "Stripe processes the buyer charge. PlankMarket initiates a separate seller transfer only after tracked pickup, the configured delay, and transaction-state checks.",
              },
              {
                icon: Globe,
                title: "Nationwide Shipping",
                description:
                  "Buy and sell flooring materials across the country. Buyers select an integrated carrier quote at checkout, and sellers prepare the order for scheduled pickup.",
              },
            ].map((item) => (
              <Card key={item.title} className="card-hover-lift">
                <CardHeader>
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-2">
                    <item.icon className="h-6 w-6 text-primary" />
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
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4">Shipping & Freight</Badge>
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
              <Card key={item.question} className="card-hover-lift">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">{item.question}</CardTitle>
                  <CardDescription>{item.answer}</CardDescription>
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
                Whether you are looking to source surplus flooring or clear out excess inventory, PlankMarket makes it easy.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/register?role=buyer">
                  <Button
                    size="xl"
                    variant="gold"
                  >
                    Start Buying <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/register?role=seller">
                  <Button
                    size="xl"
                    variant="secondary"
                    className="border-2 border-white/70 text-white bg-white/10 hover:bg-white/20"
                  >
                    Start Selling
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
