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
  Package,
  Search,
  Shield,
  TrendingDown,
  Truck,
} from "lucide-react";
import { PremiumHeroBanner } from "@/components/promotions/hero-banner";
import { FeaturedCarousel } from "@/components/promotions/featured-carousel";

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-20 md:py-32">
        {/* Wood grain texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                90deg,
                transparent,
                transparent 2px,
                oklch(0.40 0.10 55) 2px,
                oklch(0.40 0.10 55) 4px
              ),
              repeating-linear-gradient(
                0deg,
                transparent,
                transparent 1px,
                oklch(0.42 0.09 155) 1px,
                oklch(0.42 0.09 155) 2px
              )
            `,
          }}
        />

        {/* Decorative blur circles */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
              B2B Flooring Marketplace
            </Badge>
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Buy and Sell Surplus Flooring
              <br />
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Direct, B2B, No Middlemen
              </span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              A dedicated marketplace connecting flooring manufacturers, distributors, and retailers.
              Trade overstock, discontinued, and closeout inventory directly with verified professionals.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register?role=buyer">
                <Button variant="default" size="xl">
                  Start Buying
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/register?role=seller">
                <Button variant="secondary" size="xl">
                  Start Selling
                </Button>
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1 bg-white/50 backdrop-blur-sm rounded-full px-6 py-3 shadow-elevation-sm">
                <Shield className="h-4 w-4" />
                <span>Verified Sellers</span>
              </div>
              <div className="flex items-center gap-1 bg-white/50 backdrop-blur-sm rounded-full px-6 py-3 shadow-elevation-sm">
                <TrendingDown className="h-4 w-4" />
                <span>Wholesale Pricing</span>
              </div>
              <div className="flex items-center gap-1 bg-white/50 backdrop-blur-sm rounded-full px-6 py-3 shadow-elevation-sm">
                <Truck className="h-4 w-4" />
                <span>Freight Logistics</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Premium Listings Hero */}
      <PremiumHeroBanner />

      {/* Featured Inventory Grid */}
      <FeaturedCarousel />

      {/* How It Works */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-bold">How PlankMarket Works</h2>
            <p className="mt-3 text-muted-foreground">
              Simple, transparent, and efficient for both buyers and sellers.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <Card className="card-hover-lift">
              <CardHeader>
                <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mb-2">
                  <Search className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="font-display">Discover</CardTitle>
                <CardDescription>
                  Browse liquidation lots with detailed specs,
                  photos, and pricing. Filter by material, species, size,
                  condition, and location.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="card-hover-lift">
              <CardHeader>
                <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mb-2">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="font-display">Purchase</CardTitle>
                <CardDescription>
                  Buy now at listed prices or make offers. Secure checkout with
                  Stripe, transparent fees (3% buyer, 2% seller), and order
                  tracking.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="card-hover-lift">
              <CardHeader>
                <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mb-2">
                  <Truck className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="font-display">Receive</CardTitle>
                <CardDescription>
                  Coordinated freight shipping from warehouse to your door.
                  Full tracking, insurance options, and delivery confirmation.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-16 items-center max-w-5xl mx-auto">
            <div>
              <Badge variant="outline" className="mb-4">
                For Buyers
              </Badge>
              <h2 className="font-display text-3xl font-bold mb-4">
                Source Premium Flooring Below Cost
              </h2>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mt-0.5 shrink-0">
                    <span className="text-xs font-bold text-primary">1</span>
                  </div>
                  <span className="text-muted-foreground">
                    Access overstock and closeout inventory directly from
                    manufacturers and distributors at wholesale prices
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mt-0.5 shrink-0">
                    <span className="text-xs font-bold text-primary">2</span>
                  </div>
                  <span className="text-muted-foreground">
                    Detailed product specs and condition reports on every
                    listing with up to 20 photos
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mt-0.5 shrink-0">
                    <span className="text-xs font-bold text-primary">3</span>
                  </div>
                  <span className="text-muted-foreground">
                    Set alerts for specific products and get notified when
                    matching inventory is listed
                  </span>
                </li>
              </ul>
              <div className="mt-6">
                <Link href="/register?role=buyer">
                  <Button>
                    Start Buying <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
            <div>
              <Badge variant="outline" className="mb-4">
                For Sellers
              </Badge>
              <h2 className="font-display text-3xl font-bold mb-4">
                Move Inventory Fast
              </h2>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mt-0.5 shrink-0">
                    <span className="text-xs font-bold text-primary">1</span>
                  </div>
                  <span className="text-muted-foreground">
                    List overstock, discontinued, and closeout inventory in
                    minutes with our guided listing flow
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mt-0.5 shrink-0">
                    <span className="text-xs font-bold text-primary">2</span>
                  </div>
                  <span className="text-muted-foreground">
                    Reach verified retail buyers and flooring professionals
                    actively looking for inventory
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mt-0.5 shrink-0">
                    <span className="text-xs font-bold text-primary">3</span>
                  </div>
                  <span className="text-muted-foreground">
                    Bulk upload via CSV, set Buy Now prices or accept offers,
                    and get paid directly via Stripe
                  </span>
                </li>
              </ul>
              <div className="mt-6">
                <Link href="/register?role=seller">
                  <Button variant="secondary">
                    Start Selling <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative py-16 bg-gradient-to-br from-primary to-secondary text-primary-foreground overflow-hidden">
        {/* Wood grain texture overlay with lower opacity */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                90deg,
                transparent,
                transparent 2px,
                white 2px,
                white 4px
              ),
              repeating-linear-gradient(
                0deg,
                transparent,
                transparent 1px,
                white 1px,
                white 2px
              )
            `,
          }}
        />

        <div className="container mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center">
              <div className="font-display text-3xl font-bold">6</div>
              <div className="text-sm opacity-80 mt-1">Material Categories</div>
              <div className="text-xs opacity-70 mt-1">
                Hardwood, Engineered, Laminate, Vinyl, Bamboo, Tile
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center">
              <div className="font-display text-3xl font-bold">All 50 US States</div>
              <div className="text-sm opacity-80 mt-1">Coast-to-Coast Coverage</div>
              <div className="text-xs opacity-70 mt-1">
                Nationwide marketplace for flooring professionals
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center">
              <div className="font-display text-3xl font-bold">3% + 2%</div>
              <div className="text-sm opacity-80 mt-1">Transparent Fees</div>
              <div className="text-xs opacity-70 mt-1">
                Buyer fee + seller fee, no hidden costs
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="rounded-3xl bg-gradient-to-br from-primary to-secondary p-12 text-white relative overflow-hidden">
            {/* Decorative blur circle */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />

            <div className="text-center relative z-10">
              <h2 className="font-display text-3xl font-bold mb-4">
                Ready to Transform Your Flooring Business?
              </h2>
              <p className="text-white/80 mb-8 max-w-xl mx-auto">
                Join PlankMarket and connect directly with flooring professionals
                across the United States.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
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
        </div>
      </section>
    </>
  );
}
