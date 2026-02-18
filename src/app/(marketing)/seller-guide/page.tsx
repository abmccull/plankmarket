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
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-20">
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
              Everything you need to know to successfully sell surplus flooring materials on PlankMarket. From registration to getting paid.
            </p>
          </div>
        </div>
      </section>

      {/* Getting Started */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
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
                title: "Register & Verify",
                description:
                  "Create a seller account with your business name, contact info, EIN, and verification documents. Our team reviews applications within 1-3 business days.",
              },
              {
                icon: ClipboardList,
                step: "2",
                title: "Complete Your Profile",
                description:
                  "Add your company logo, business description, location, service areas, business hours, shipping capabilities, and return policies to build buyer trust.",
              },
              {
                icon: Package,
                step: "3",
                title: "Create Your First Listing",
                description:
                  "Upload high-quality photos, specify material details, set competitive pricing, and publish. The more detailed your listing, the faster it sells.",
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
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl">Creating Effective Listings</h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              The quality of your listings directly impacts how quickly your inventory sells. Follow these best practices.
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
                      <li key={tip} className="flex items-start gap-2 text-sm text-muted-foreground">
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

      {/* Material Types */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
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
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl">Managing Orders & Shipping</h2>
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
                  "Receive instant email and dashboard notifications when a buyer places an order. Review order details promptly.",
              },
              {
                icon: MessageSquare,
                step: "2",
                title: "Coordinate with Buyer",
                description:
                  "Use built-in messaging to confirm details, provide estimated ship dates, offer freight quotes, and share carrier options.",
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
                  "Arrange freight and mark the order as shipped with tracking information. Buyers can follow delivery progress through their dashboard.",
              },
              {
                icon: DollarSign,
                step: "5",
                title: "Get Paid",
                description:
                  "Payment is automatically released when the carrier picks up your shipment. Funds arrive in your bank within 3-5 business days.",
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
                      <CardTitle className="font-display text-lg">{item.title}</CardTitle>
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
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl">Freight & Shipping Requirements</h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              Clear guidelines for packaging and shipping surplus flooring materials
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
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
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
                    title: "8+ Photos",
                    description:
                      "Listings with 8 or more photos sell significantly faster. Show every angle and detail.",
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
                      "Respond to inquiries within 24 hours. Quick communication increases sale completion rates.",
                  },
                  {
                    icon: Truck,
                    title: "Flexible Shipping",
                    description:
                      "Offer multiple options — seller freight, buyer pickup, or carrier assistance — to attract more buyers.",
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
                      <p className="text-sm text-muted-foreground">{tip.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Payment Processing */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <Card>
              <CardHeader className="text-center">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-2 mx-auto">
                  <CreditCard className="h-7 w-7 text-primary" />
                </div>
                <CardTitle className="font-display text-2xl">Payment Processing</CardTitle>
                <CardDescription>
                  All payments are processed through Stripe Connect for secure, reliable transactions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {[
                    "Buyers pay upfront when placing an order",
                    "Funds are held securely until the carrier picks up the shipment",
                    "Once pickup is confirmed, payment is automatically released to your Stripe account",
                    "Funds typically available in your bank within 3-5 business days",
                    "View all transaction history and earnings in your seller dashboard",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-secondary shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-sm text-muted-foreground">
                  PlankMarket charges a commission on each completed sale with no monthly or listing fees.
                  See our{" "}
                  <Link href="/pricing" className="text-primary hover:underline font-medium">
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
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="rounded-3xl bg-gradient-to-br from-primary to-secondary p-12 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
            <div className="text-center relative z-10">
              <h2 className="font-display text-3xl mb-4">
                Ready to Start Selling?
              </h2>
              <p className="text-white/80 mb-8 max-w-xl mx-auto">
                Create your seller account today and turn your surplus flooring inventory into revenue. Our team is here to help you succeed.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/register?role=seller">
                  <Button
                    size="xl"
                    variant="gold"
                  >
                    Create Seller Account <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button
                    size="xl"
                    variant="secondary"
                    className="border-2 border-white/70 text-white bg-white/10 hover:bg-white/20"
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
