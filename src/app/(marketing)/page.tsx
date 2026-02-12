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
  Package,
  Search,
  Shield,
  TrendingDown,
  Truck,
  Users,
} from "lucide-react";
import { PremiumHeroBanner } from "@/components/promotions/hero-banner";
import { FeaturedCarousel } from "@/components/promotions/featured-carousel";

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-4">
              B2B Flooring Marketplace
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Liquidation Flooring
              <br />
              <span className="text-primary">At Wholesale Prices</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Connect with verified manufacturers and distributors to buy and
              sell overstock, discontinued, and closeout flooring inventory.
              Save up to 70% on premium flooring materials.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/listings">
                <Button size="xl">
                  Browse Listings
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/register?role=seller">
                <Button variant="outline" size="xl">
                  Start Selling
                </Button>
              </Link>
            </div>
            <div className="mt-8 flex items-center justify-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Shield className="h-4 w-4" />
                <span>Verified Sellers</span>
              </div>
              <div className="flex items-center gap-1">
                <TrendingDown className="h-4 w-4" />
                <span>Up to 70% Off</span>
              </div>
              <div className="flex items-center gap-1">
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
            <h2 className="text-3xl font-bold">How PlankMarket Works</h2>
            <p className="mt-3 text-muted-foreground">
              Simple, transparent, and efficient for both buyers and sellers.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                  <Search className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Discover</CardTitle>
                <CardDescription>
                  Browse thousands of liquidation lots with detailed specs,
                  photos, and pricing. Filter by material, species, size,
                  condition, and location.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Purchase</CardTitle>
                <CardDescription>
                  Buy now at listed prices or make offers. Secure checkout with
                  Stripe, transparent fees (3% buyer, 2% seller), and order
                  tracking.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                  <Truck className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Receive</CardTitle>
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
              <h2 className="text-3xl font-bold mb-4">
                Source Premium Flooring Below Cost
              </h2>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                    <span className="text-xs font-bold text-primary">1</span>
                  </div>
                  <span className="text-muted-foreground">
                    Access overstock and closeout inventory from top
                    manufacturers at 30-70% below retail
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                    <span className="text-xs font-bold text-primary">2</span>
                  </div>
                  <span className="text-muted-foreground">
                    Detailed product specs and condition reports on every
                    listing with up to 20 photos
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
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
              <h2 className="text-3xl font-bold mb-4">
                Move Inventory Fast
              </h2>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                    <span className="text-xs font-bold text-primary">1</span>
                  </div>
                  <span className="text-muted-foreground">
                    List overstock, discontinued, and closeout inventory in
                    minutes with our guided listing flow
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                    <span className="text-xs font-bold text-primary">2</span>
                  </div>
                  <span className="text-muted-foreground">
                    Reach thousands of verified retail buyers actively looking
                    for deals
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
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
                  <Button variant="outline">
                    Start Selling <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold">10K+</div>
              <div className="text-sm opacity-80 mt-1">Active Listings</div>
            </div>
            <div>
              <div className="text-3xl font-bold">2,500+</div>
              <div className="text-sm opacity-80 mt-1">Verified Sellers</div>
            </div>
            <div>
              <div className="text-3xl font-bold">$50M+</div>
              <div className="text-sm opacity-80 mt-1">
                Inventory Available
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold">50+</div>
              <div className="text-sm opacity-80 mt-1">States Covered</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Transform Your Flooring Business?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Join thousands of flooring professionals already saving time and
            money on PlankMarket.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="xl">
                Create Free Account <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
