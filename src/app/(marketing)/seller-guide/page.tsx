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
import { PUBLIC_COMMERCIAL_COPY } from "@/lib/public-commercial-copy";
import {
  ArrowRight,
  Camera,
  FileText,
  Tag,
  Layers,
  UserCheck,
  ClipboardList,
  CreditCard,
  Package,
  MessageSquare,
  Truck,
  Clock,
  DollarSign,
  TrendingUp,
  Star,
  Zap,
  CheckCircle2,
  Shield,
  Calculator,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Seller Guide - How to List and Sell Surplus Flooring",
  description:
    "Complete guide for sellers on PlankMarket. Learn how to create listings, set pricing, manage orders, and get paid for surplus flooring inventory.",
  openGraph: {
    title: "PlankMarket Seller Guide",
    description:
      "Everything you need to know about selling surplus flooring on PlankMarket.",
  },
};

export const revalidate = 3600;

export default function SellerGuidePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-10 sm:py-14">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
              Seller Resources
            </Badge>
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
              Seller Guide
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Prepare an accurate listing, coordinate pickup and understand your
              seller transfer. Start with the task you need.
            </p>
            <nav
              aria-label="Seller guide sections"
              className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium"
            >
              <Link
                href="#prepare"
                className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
              >
                Account and approval
              </Link>
              <Link
                href="#publish"
                className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
              >
                Prepare a listing
              </Link>
              <Link
                href="#ship"
                className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
              >
                Ship an order
              </Link>
              <Link
                href="#get-paid"
                className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
              >
                Understand payment
              </Link>
            </nav>
          </div>
        </div>
      </section>

      {/* Getting Started */}
      <section id="prepare" className="scroll-mt-24 py-10 sm:py-14">
        <div className="container mx-auto px-4">
          <div className="text-center mb-7">
            <h2 className="font-display text-3xl">Getting Started</h2>
            <p className="mt-3 text-muted-foreground">
              Three simple steps to start selling on PlankMarket
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                icon: UserCheck,
                step: "1",
                title: "Create Your Account",
                description:
                  "Register with your business and contact details. Prepare a listing draft on this browser before approval, and complete business verification when your documents are ready.",
              },
              {
                icon: ClipboardList,
                step: "2",
                title: "Complete Your Profile",
                description:
                  "Confirm your business details and pickup location. Add accurate shipping information and set up your connected Stripe account for seller transfers.",
              },
              {
                icon: Package,
                step: "3",
                title: "Create Your First Listing",
                description:
                  "Prepare material details and pricing in your local draft. After approval, upload clear product photos, review the details and publish.",
              },
            ].map((item) => (
              <Card key={item.step} className="card-hover-lift relative">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold shrink-0">
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

      {/* Creating Effective Listings */}
      <section id="publish" className="scroll-mt-24 py-10 sm:py-14 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-7">
            <h2 className="font-display text-3xl">
              Creating Effective Listings
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              The quality of your listings directly impacts how quickly your
              inventory sells. Follow these best practices.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              {
                icon: Camera,
                title: "High-Quality Photos",
                tips: [
                  "Multiple angles showing material clearly",
                  "Close-ups highlighting texture, grain, and finish",
                  "Photos of packaging and quantity",
                  "Any imperfections shown transparently",
                  "Aim for 5-8 well-lit images per listing",
                ],
              },
              {
                icon: FileText,
                title: "Detailed Descriptions",
                tips: [
                  "Brand and product line",
                  "Material type, species, and dimensions",
                  "Color, finish, and sheen level",
                  "Reason for surplus (overstock, closeout, etc.)",
                  "Condition and installation type",
                ],
              },
              {
                icon: Tag,
                title: "Competitive Pricing",
                tips: [
                  "Research similar listings for market rates",
                  "Price below retail for surplus inventory",
                  "Offer volume discounts for larger lots",
                  "Factor in material condition and grade",
                  "Update pricing based on demand",
                ],
              },
              {
                icon: Layers,
                title: "Accurate Lot Sizes",
                tips: [
                  "Total square footage in the lot",
                  "Number of boxes or pallets",
                  "Whether you can split lots",
                  "Minimum order quantity if applicable",
                ],
              },
            ].map((item) => (
              <Card key={item.title} className="card-hover-lift">
                <CardHeader>
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-2">
                    <item.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="font-display">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {item.tips.map((tip) => (
                      <li
                        key={tip}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <CheckCircle2 className="h-4 w-4 text-secondary shrink-0 mt-0.5" />
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <aside
        className="border-y bg-muted/20 py-6"
        aria-label="Optional seller calculator"
      >
        <div className="container mx-auto flex max-w-4xl items-start gap-3 px-4">
          <Calculator
            className="mt-1 h-5 w-5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div>
            <p className="font-semibold">Still weighing when to sell?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use your own assumptions to compare holding costs and estimated
              seller net.
            </p>
            <Link
              href="/tools/carrying-cost-calculator"
              className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4"
            >
              Open the carrying-cost calculator
            </Link>
          </div>
        </div>
      </aside>

      {/* Material Types */}
      <section className="py-10 sm:py-14">
        <div className="container mx-auto px-4">
          <div className="text-center mb-7">
            <h2 className="font-display text-3xl">Supported Material Types</h2>
            <p className="mt-3 text-muted-foreground">
              PlankMarket supports all major flooring material categories
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                name: "Hardwood",
                badge: "hardwood" as const,
                description:
                  "Solid wood flooring — oak, maple, hickory, walnut, cherry, and exotic species. Specify prefinished or unfinished, plank width, and grade.",
              },
              {
                name: "Engineered Wood",
                badge: "engineered" as const,
                description:
                  "Real wood veneer over plywood core. Include wear layer thickness, core construction, and installation method.",
              },
              {
                name: "Laminate",
                badge: "laminate" as const,
                description:
                  "Photographic wood or tile appearance. Specify AC rating, thickness, underlayment inclusion, and locking system type.",
              },
              {
                name: "Vinyl & LVP",
                badge: "vinyl" as const,
                description:
                  "LVT, LVP, WPC, and SPC flooring. Include wear layer thickness, waterproof rating, and installation type.",
              },
              {
                name: "Bamboo",
                badge: "default" as const,
                description:
                  "Solid or engineered bamboo. Specify strand-woven, horizontal, or vertical construction and carbonization level.",
              },
              {
                name: "Tile",
                badge: "default" as const,
                description:
                  "Ceramic or porcelain tile. Include dimensions, finish, slip rating, and intended use (indoor/outdoor).",
              },
            ].map((item) => (
              <Card key={item.name} className="card-hover-lift">
                <CardHeader>
                  <Badge variant={item.badge} className="w-fit mb-2">
                    {item.name}
                  </Badge>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Order Management */}
      <section className="py-10 sm:py-14 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-7">
            <h2 id="ship" className="scroll-mt-24 font-display text-3xl">
              Managing Orders & Shipping
            </h2>
            <p className="mt-3 text-muted-foreground">
              From order notification to delivery confirmation
            </p>
          </div>
          <div className="max-w-3xl mx-auto space-y-4">
            {[
              {
                icon: Zap,
                step: "1",
                title: "Order Notification",
                description:
                  "Check order notifications and your seller dashboard. Review the order details and required next step promptly.",
              },
              {
                icon: MessageSquare,
                step: "2",
                title: "Coordinate with Buyer",
                description:
                  "Use the order and built-in messaging to confirm pickup details. Freight options and amounts are handled through the platform.",
              },
              {
                icon: Package,
                step: "3",
                title: "Package Materials",
                description:
                  "Package materials properly — palletized, banded, and stretch-wrapped for LTL freight. Provide accurate weight, dimensions, and pallet count.",
              },
              {
                icon: Truck,
                step: "4",
                title: "Ship & Track",
                description:
                  "Prepare the booked shipment, use the order documents and confirm pickup details. Follow tracking and shipping updates on the order.",
              },
              {
                icon: DollarSign,
                step: "5",
                title: "Get Paid",
                description:
                  "After pickup is confirmed and the configured release delay passes, PlankMarket rechecks the order and initiates the seller transfer through Stripe Connect.",
              },
            ].map((item) => (
              <Card key={item.step} className="card-hover-lift">
                <CardHeader className="flex-row items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                    {item.step}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <item.icon className="h-5 w-5 text-primary" />
                      <CardTitle className="font-display text-lg">
                        {item.title}
                      </CardTitle>
                    </div>
                    <CardDescription>{item.description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Freight & Shipping Requirements */}
      <section className="py-10 sm:py-14">
        <div className="container mx-auto px-4">
          <div className="text-center mb-7">
            <h2 className="font-display text-3xl">
              Freight & Shipping Requirements
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              Clear guidelines for packaging and shipping surplus flooring
              materials
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              {
                icon: Package,
                title: "Packaging Standards",
                description:
                  "All materials must be palletized, banded, and stretch-wrapped. Use corner protectors for hardwood and engineered wood.",
              },
              {
                icon: FileText,
                title: "Required Information",
                description:
                  "Accurate weight, dimensions (L×W×H per pallet), pallet count, and NMFC class if known.",
              },
              {
                icon: DollarSign,
                title: "Shipping Quotes",
                description:
                  "PlankMarket provides integrated freight quotes from our carrier network. Shipping costs are calculated based on origin, destination, weight, and dimensions.",
              },
              {
                icon: Shield,
                title: "Damage Prevention",
                description:
                  "Ensure materials are secured to prevent shifting during transit. Loose boxes or unwrapped pallets may result in damage claims.",
              },
              {
                icon: CheckCircle2,
                title: "Delivery & Inspection",
                description:
                  "Buyers must inspect shipments upon delivery and note any damage on the delivery receipt (BOL). Photo evidence within 48 hours is required for damage claims.",
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

      {/* Tips for Faster Sales */}
      <section className="py-10 sm:py-14 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-7">
            <h2 className="font-display text-3xl">Tips for Faster Sales</h2>
          </div>
          <Card className="max-w-3xl mx-auto bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[
                  {
                    icon: DollarSign,
                    title: "Price Aggressively",
                    description:
                      "Buyers come to PlankMarket for deals. If pricing is too close to retail, listings sit unsold.",
                  },
                  {
                    icon: Camera,
                    title: "Document the Lot",
                    description:
                      "Show packaging, labels, material, finish, quantity, and any defects buyers should evaluate.",
                  },
                  {
                    icon: Star,
                    title: "Be Transparent",
                    description:
                      "Clearly describe condition, quantity, and defects. Honesty reduces disputes and builds trust.",
                  },
                  {
                    icon: Clock,
                    title: "Respond Fast",
                    description:
                      "Respond promptly with clear answers about quantity, condition and pickup.",
                  },
                  {
                    icon: Truck,
                    title: "Flexible Shipping",
                    description:
                      "Provide accurate pallet details and pickup readiness so buyers receive dependable integrated carrier quotes.",
                  },
                  {
                    icon: TrendingUp,
                    title: "Update Regularly",
                    description:
                      "Keep inventory quantities current and refresh pricing based on demand and inventory age.",
                  },
                ].map((tip) => (
                  <div key={tip.title} className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center shrink-0">
                      <tip.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{tip.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {tip.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Payment Processing */}
      <section id="get-paid" className="scroll-mt-24 py-10 sm:py-14">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <Card>
              <CardHeader className="text-center">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-2 mx-auto">
                  <CreditCard className="h-7 w-7 text-primary" />
                </div>
                <CardTitle className="font-display text-2xl">
                  Payment Processing
                </CardTitle>
                <CardDescription>
                  Buyers pay through Stripe; seller transfers are sent to your
                  connected Stripe account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {[
                    "Buyers pay upfront when placing an order",
                    "Stripe processes payment; seller transfer starts only after confirmed pickup and the configured delay",
                    "PlankMarket rechecks payment, shipment, and dispute state before initiating the transfer",
                    "Bank availability depends on Stripe and your connected account payout schedule",
                    "View all transaction history and earnings in your seller dashboard",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <CheckCircle2 className="h-4 w-4 text-secondary shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-sm text-muted-foreground">
                  There is no required subscription or listing fee. Completed
                  inventory sales have a{" "}
                  {PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} plus{" "}
                  {PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel} processing. Pro
                  is an optional paid subscription. See our{" "}
                  <Link
                    href="/pricing"
                    className="text-primary hover:underline font-medium"
                  >
                    Pricing & Fees
                  </Link>{" "}
                  page for details.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-10 sm:py-14 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="relative overflow-hidden rounded-3xl bg-primary p-8 text-primary-foreground sm:p-12">
            <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
            <div className="text-center relative z-10">
              <h2 className="font-display text-3xl mb-4">
                Ready to Start Selling?
              </h2>
              <p className="mx-auto mb-8 max-w-xl text-primary-foreground">
                Create your seller account today and turn your surplus flooring
                inventory into revenue. Our team is here to help you succeed.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/register?role=seller">
                  <Button size="xl" variant="gold">
                    Create Seller Account{" "}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button
                    size="xl"
                    variant="outline"
                    className="border-2 border-primary-foreground bg-primary-foreground text-primary hover:bg-primary-foreground/90 hover:text-primary"
                  >
                    Contact Support
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
