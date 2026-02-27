import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  ArrowRight,
  ShoppingCart,
  Store,
  Shield,
  TrendingDown,
  Truck,
  Clock,
  DollarSign,
  Users,
  Star,
} from "lucide-react";

export const metadata: Metadata = {
  title: "PlankMarket — B2B Closeout Flooring Marketplace",
  description:
    "Your closeout flooring is losing value right now. PlankMarket is the fastest path from surplus inventory to verified buyer. Move overstock, discontinued, and closeout flooring across all 50 states.",
};

export const revalidate = 3600;

export default function HomePage() {
  return (
    <>
      {/* ─── Hero: The Depreciation Clock ──────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background min-h-[calc(100vh-4rem)] flex items-center">
        {/* Hero background photo */}
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
              Your Closeout Inventory Is{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Losing Value Right Now
              </span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Every week surplus flooring sits in a warehouse, carrying costs
              eat into your margin and the product moves closer to obsolete.
              PlankMarket is the fastest path from excess inventory to verified
              buyer, before the margin disappears.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register?role=seller">
                <Button size="xl" variant="gold">
                  List Your Surplus Inventory
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/listings">
                <Button size="xl" variant="outline">
                  Browse Closeout Lots
                </Button>
              </Link>
            </div>

            {/* Trust signals */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5 bg-white/50 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-elevation-xs">
                <Shield className="h-4 w-4" aria-hidden="true" />
                <span>Verified Professionals Only</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/50 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-elevation-xs">
                <TrendingDown className="h-4 w-4" aria-hidden="true" />
                <span>30-60% Below Wholesale</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/50 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-elevation-xs">
                <Truck className="h-4 w-4" aria-hidden="true" />
                <span>Integrated LTL Freight</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── The Problem: Two Sides ────────────────────────────────────── */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-14">
            <h2 className="font-display text-3xl sm:text-4xl">
              Surplus flooring is a{" "}
              <span className="text-primary">two-sided problem.</span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Sellers have inventory depreciating in their warehouse. Buyers
              are missing deals they never hear about. The phone-around game
              wastes time on both ends.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Seller Pain */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-secondary/10 to-primary/10 flex items-center justify-center">
                  <Store
                    className="h-5 w-5 text-secondary"
                    aria-hidden="true"
                  />
                </div>
                <h3 className="font-display text-xl">
                  If You Sell Flooring
                </h3>
              </div>
              {[
                {
                  title: "Warehouse space is not free.",
                  description:
                    "A 5,000 sq ft lot of discontinued engineered oak sitting on pallets for six months is active overhead. That rack space has a price tag, and it compounds every week.",
                },
                {
                  title: "Capital tied up in surplus is capital you can not use.",
                  description:
                    "$200,000 in overstock looks like an asset on paper. But every month it does not move, depreciation and storage costs eat into your recovery.",
                },
                {
                  title: "Your sales channels were not built for liquidation.",
                  description:
                    "Your wholesale accounts do not want last year's closeout SKUs. Your reps are focused on active lines. Posting on classifieds brings low-ball offers and no-shows.",
                },
              ].map((pain) => (
                <Card
                  key={pain.title}
                  className="border-l-4 border-l-destructive/30"
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="font-display text-base leading-snug">
                      {pain.title}
                    </CardTitle>
                    <CardDescription className="text-sm leading-relaxed">
                      {pain.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>

            {/* Buyer Pain */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                  <ShoppingCart
                    className="h-5 w-5 text-primary"
                    aria-hidden="true"
                  />
                </div>
                <h3 className="font-display text-xl">
                  If You Buy Flooring
                </h3>
              </div>
              {[
                {
                  title: "The phone-around game wastes your week.",
                  description:
                    "You need 4,000 sq ft of engineered oak for a project. Two days calling distributors, chasing quotes, leaving voicemails. The lot you wanted sold yesterday.",
                },
                {
                  title: "Good lots are gone before you hear about them.",
                  description:
                    "Mill-direct hardwood, discontinued premium LVP, name-brand engineered closeouts. The best surplus gets picked up by buyers already plugged into the right networks.",
                },
                {
                  title: "Pricing is a black box.",
                  description:
                    "Call five distributors for the same product and get five different prices. None posted publicly. No baseline, no transparency, no way to know if you are getting a fair deal.",
                },
              ].map((pain) => (
                <Card
                  key={pain.title}
                  className="border-l-4 border-l-destructive/30"
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="font-display text-base leading-snug">
                      {pain.title}
                    </CardTitle>
                    <CardDescription className="text-sm leading-relaxed">
                      {pain.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── The Mechanism: How PlankMarket Works ──────────────────────── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-14">
            <Badge variant="outline" className="mb-4">
              The Marketplace
            </Badge>
            <h2 className="font-display text-3xl sm:text-4xl">
              One platform. Verified buyers and sellers.{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Surplus moves fast.
              </span>
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              PlankMarket connects flooring manufacturers, distributors, and
              retailers to trade overstock, discontinued, and closeout
              inventory directly. No brokers. No middlemen. Transparent
              pricing on every lot.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="flex flex-col gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                <Users className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>
              <h3 className="font-display text-xl">Verified Network</h3>
              <p className="text-muted-foreground text-base leading-relaxed">
                Every buyer and seller on PlankMarket undergoes business
                verification. EIN verification, document review, admin
                approval. You are dealing with real flooring professionals,
                not tire-kickers or flippers.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                <Clock className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>
              <h3 className="font-display text-xl">Speed to Close</h3>
              <p className="text-muted-foreground text-base leading-relaxed">
                Sellers list in minutes with guided forms and AI-assisted
                descriptions. Buyers set saved search alerts and get notified
                the moment a matching lot is listed. Offers, negotiation, and
                checkout happen on-platform.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                <DollarSign
                  className="h-7 w-7 text-primary"
                  aria-hidden="true"
                />
              </div>
              <h3 className="font-display text-xl">
                Transparent Fees
              </h3>
              <p className="text-muted-foreground text-base leading-relaxed">
                3% buyer fee. 2% seller fee. No listing fees, no
                subscriptions, no hidden charges. Payments through Stripe with
                escrow protection. Seller payouts in 3-5 business days after
                carrier pickup.
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Link href="/how-it-works">
              <Button variant="outline" size="lg">
                See How It Works
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Social Proof ──────────────────────────────────────────────── */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="font-display text-3xl sm:text-4xl">
              What flooring professionals are saying.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto stagger-grid">
            {[
              {
                quote:
                  "We had 18,000 sq ft of discontinued engineered hickory taking up three rack bays for almost a year. Listed it on PlankMarket on a Tuesday, had four offers by Friday, and it was sold and scheduled for pickup the following week. Faster than anything our sales team managed in months.",
                name: "Kevin M.",
                role: "Inventory Manager",
                company: "Regional flooring distributor, Texas",
              },
              {
                quote:
                  "I used to spend half my Monday morning calling distributors to check availability. Now I open PlankMarket, filter for what I need, and have a quote submitted before lunch. Found a 6,200 sq ft lot of prefinished white oak last month, well below what I would have paid through my usual channels.",
                name: "Marcus T.",
                role: "Purchasing Manager",
                company: "Regional flooring contractor, Southeast US",
              },
              {
                quote:
                  "The verified buyer network is worth it on its own. I was spending hours responding to inquiries from people who were not serious. Every buyer on PlankMarket has been through verification. Conversations move to offers much faster.",
                name: "Tom H.",
                role: "Owner",
                company:
                  "Flooring wholesale and distribution, Midwest",
              },
            ].map((testimonial) => (
              <Card
                key={testimonial.name}
                className="card-hover-lift flex flex-col"
              >
                <CardHeader className="flex-1">
                  {/* Star rating */}
                  <div
                    className="flex gap-0.5 mb-3"
                    aria-label="5 out of 5 stars"
                  >
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-amber-400 text-amber-400"
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                  <blockquote className="text-sm leading-relaxed text-muted-foreground italic mb-4">
                    &ldquo;{testimonial.quote}&rdquo;
                  </blockquote>
                  <div className="mt-auto pt-4 border-t border-border">
                    <p className="font-semibold text-sm">
                      {testimonial.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {testimonial.role}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {testimonial.company}
                    </p>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Stats Bar ─────────────────────────────────────────────────── */}
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
              <div className="font-display text-2xl">3-5 Days</div>
              <div className="text-sm opacity-80">Seller Payouts</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Buyer / Seller Fork ───────────────────────────────────────── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="font-display text-3xl sm:text-4xl">
              Which side of the trade are you on?
            </h2>
            <p className="mt-4 text-muted-foreground">
              PlankMarket works for both sides. Pick your path.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
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
              <h3 className="font-display text-2xl mb-2">
                I&apos;m a Buyer
              </h3>
              <p className="text-muted-foreground text-base leading-relaxed mb-4">
                Source surplus hardwood, engineered, LVP, laminate, bamboo,
                and tile at 30-60% below wholesale. Verified sellers.
                Full specs and photos on every lot. Integrated freight
                quotes at checkout.
              </p>
              <span className="inline-flex items-center text-sm font-semibold text-primary group-hover:gap-2 transition-all">
                See buyer benefits
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
              <h3 className="font-display text-2xl mb-2">
                I&apos;m a Seller
              </h3>
              <p className="text-muted-foreground text-base leading-relaxed mb-4">
                Liquidate overstock and closeout inventory to verified
                buyers across all 50 states. 2% commission only when you
                sell. No listing fees. Payouts in 3-5 business days.
              </p>
              <span className="inline-flex items-center text-sm font-semibold text-secondary group-hover:gap-2 transition-all">
                See seller benefits
                <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </div>

          {/* Browse link */}
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Just browsing?{" "}
            <Link
              href="/listings"
              className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
            >
              View all listings
            </Link>
          </p>
        </div>
      </section>

      {/* ─── Final CTA: The Clock Is Running ───────────────────────────── */}
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
              <h2 className="font-display text-3xl sm:text-4xl mb-4">
                Every day surplus sits, the margin shrinks.
              </h2>
              <p className="text-white/80 mb-8 max-w-xl mx-auto text-lg leading-relaxed">
                Sellers: list your surplus and get it in front of verified
                buyers across all 50 states. Buyers: stop missing deals.
                Set alerts for the products you need and source at
                wholesale prices.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/register?role=seller">
                  <Button size="xl" variant="gold">
                    List Your Inventory
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/register?role=buyer">
                  <Button
                    size="xl"
                    variant="outline"
                    className="border-2 border-white/70 text-white bg-white/10 hover:bg-white/20"
                  >
                    Sign Up as Buyer
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <p className="mt-6 text-sm text-white/60">
                Free to join. No listing fees. No subscription.
                Pay only when a transaction completes.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
