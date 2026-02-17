import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  ShoppingCart,
  Store,
  Shield,
  TrendingDown,
  Truck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "PlankMarket — B2B Wood Flooring Liquidation Marketplace",
  description:
    "The B2B marketplace for liquidation, overstock, and closeout flooring inventory. Connect directly with verified buyers and sellers across all 50 states.",
};

export const revalidate = 3600;

export default function HomePage() {
  return (
    <>
      {/* Hero Fork Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background min-h-[calc(100vh-4rem)] flex items-center">
        {/* Hero background photo — parquet flooring in room */}
        <Image
          src="https://images.unsplash.com/photo-1584622781564-1d987f7333c1?w=1400&q=80&fit=crop"
          alt=""
          fill
          className="object-cover opacity-[0.07]"
          priority
          aria-hidden="true"
        />
        {/* Wood grain texture overlay */}
        <div
          aria-hidden="true"
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
        <div
          aria-hidden="true"
          className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-20 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl"
        />

        <div className="container mx-auto px-4 relative z-10 py-20">
          <div className="mx-auto max-w-4xl text-center">
            <Badge className="mb-6 border-transparent bg-amber-100 text-amber-800">
              B2B Flooring Marketplace
            </Badge>
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl md:text-6xl">
              The Smarter Way to Trade
              <br />
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Surplus Flooring
              </span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              PlankMarket connects flooring manufacturers, distributors, and
              retailers. Trade overstock, discontinued, and closeout inventory
              directly with verified professionals.
            </p>

            {/* Fork: Two large clickable cards */}
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
              {/* Buyer Card */}
              <Link
                href="/for-buyers"
                className="group relative rounded-2xl border-2 border-border bg-card p-8 text-left transition-all duration-300 hover:border-primary hover:shadow-elevation-lg hover:-translate-y-1"
              >
                <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-2xl bg-gradient-to-r from-primary to-primary/60 opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mb-5">
                  <ShoppingCart
                    className="h-7 w-7 text-primary"
                    aria-hidden="true"
                  />
                </div>
                <h2 className="font-display text-2xl mb-2">
                  I&apos;m a Buyer
                </h2>
                <p className="text-muted-foreground text-base leading-relaxed mb-6">
                  Source premium surplus flooring at 30–60% below wholesale.
                  Verified sellers, detailed specs, integrated freight.
                </p>
                <span className="inline-flex items-center text-sm font-semibold text-primary group-hover:gap-2 transition-all">
                  Explore buyer benefits
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>

              {/* Seller Card */}
              <Link
                href="/for-sellers"
                className="group relative rounded-2xl border-2 border-border bg-card p-8 text-left transition-all duration-300 hover:border-secondary hover:shadow-elevation-lg hover:-translate-y-1"
              >
                <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-2xl bg-gradient-to-r from-secondary to-secondary/60 opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-secondary/10 to-primary/10 flex items-center justify-center mb-5">
                  <Store
                    className="h-7 w-7 text-secondary"
                    aria-hidden="true"
                  />
                </div>
                <h2 className="font-display text-2xl mb-2">
                  I&apos;m a Seller
                </h2>
                <p className="text-muted-foreground text-base leading-relaxed mb-6">
                  Liquidate overstock and closeout inventory fast. Reach verified
                  buyers, get paid in 3–5 days, 2% fee only when you sell.
                </p>
                <span className="inline-flex items-center text-sm font-semibold text-secondary group-hover:gap-2 transition-all">
                  Explore seller benefits
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </div>

            {/* Trust signals */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5 bg-white/50 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-elevation-xs">
                <Shield className="h-4 w-4" aria-hidden="true" />
                <span>Verified Professionals</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/50 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-elevation-xs">
                <TrendingDown className="h-4 w-4" aria-hidden="true" />
                <span>Wholesale Pricing</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/50 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-elevation-xs">
                <Truck className="h-4 w-4" aria-hidden="true" />
                <span>Integrated Freight</span>
              </div>
            </div>

            {/* Browse link for visitors who just want to look */}
            <p className="mt-8 text-sm text-muted-foreground">
              Just browsing?{" "}
              <Link
                href="/listings"
                className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
              >
                View all listings
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* Compact stats bar */}
      <section className="py-12 bg-gradient-to-br from-primary to-secondary text-primary-foreground relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                90deg,
                transparent,
                transparent 2px,
                white 2px,
                white 4px
              )
            `,
          }}
        />
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="font-display text-2xl">6</div>
              <div className="text-sm opacity-80">Material Categories</div>
            </div>
            <div>
              <div className="font-display text-2xl">All 50</div>
              <div className="text-sm opacity-80">US States</div>
            </div>
            <div>
              <div className="font-display text-2xl">3% + 2%</div>
              <div className="text-sm opacity-80">Transparent Fees</div>
            </div>
            <div>
              <div className="font-display text-2xl">3–5 Days</div>
              <div className="text-sm opacity-80">Seller Payouts</div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="rounded-3xl bg-gradient-to-br from-primary to-secondary p-12 text-white relative overflow-hidden">
            <div
              aria-hidden="true"
              className="absolute top-0 right-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl"
            />
            <div
              aria-hidden="true"
              className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full blur-3xl"
            />

            <div className="text-center relative z-10">
              <h2 className="font-display text-3xl mb-4">
                Ready to Get Started?
              </h2>
              <p className="text-white/80 mb-8 max-w-xl mx-auto">
                Create your free account and join the marketplace built
                specifically for flooring professionals.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/register?role=buyer">
                  <Button
                    size="xl"
                    variant="gold"
                  >
                    Sign Up as Buyer
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/register?role=seller">
                  <Button
                    size="xl"
                    variant="outline"
                    className="border-white/30 text-white hover:bg-white/10"
                  >
                    Sign Up as Seller
                    <ArrowRight className="ml-2 h-4 w-4" />
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
