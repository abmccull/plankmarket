import { type Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  Bell,
  FileText,
  Layers,
  Lock,
  MessageSquare,
  Search,
  Shield,
  Truck,
  Star,
} from "lucide-react";

export const metadata: Metadata = {
  title: "For Buyers — Closeout Flooring Your Competitors Miss | PlankMarket",
  description:
    "Source first-quality closeout and surplus flooring at 30-60% below wholesale. 44 data fields per listing. Verified sellers. Integrated LTL freight. 3% buyer fee, no subscription.",
  openGraph: {
    title: "The Closeout Inventory Your Competitors Never See.",
    description:
      "First-quality surplus flooring from verified manufacturers and distributors. 30-60% below wholesale. Browse lots now.",
    url: "https://plankmarket.com/for-buyers",
  },
};

export const revalidate = 3600;

export default function ForBuyersPage() {
  return (
    <>
      {/* ─── Section 1: Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-20 md:py-32">
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
        <div aria-hidden="true" className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
        <div aria-hidden="true" className="absolute bottom-20 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="mx-auto max-w-6xl">
            {/* Two-column layout: copy left, photo right */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
              <div className="text-center lg:text-left lg:pt-4">
                <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
                  B2B Flooring Marketplace
                </Badge>
                <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
                  The Inventory Your Competitors{" "}
                  <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    Never See.
                  </span>
                </h1>
                <p className="mt-6 text-lg text-muted-foreground">
                  Manufacturers and distributors sit on closeout flooring they
                  need to move. First-quality hardwood, engineered, LVP. 30-60%
                  below wholesale. Most retailers never hear about these lots.
                  PlankMarket puts them in one place, with full specs, verified
                  sellers, and transparent pricing.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                  <Link href="/listings">
                    <Button size="xl" variant="gold">
                      Browse Closeout Lots
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link href="/register?role=buyer">
                    <Button size="xl" variant="outline">
                      Create Free Buyer Account
                    </Button>
                  </Link>
                </div>

                {/* Trust badges */}
                <div className="mt-10 flex flex-wrap items-center justify-center lg:justify-start gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm rounded-full px-4 py-2 shadow-elevation-sm">
                    <Shield className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                    <span>Every seller verified</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm rounded-full px-4 py-2 shadow-elevation-sm">
                    <Layers className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                    <span>44 data fields per listing</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm rounded-full px-4 py-2 shadow-elevation-sm">
                    <Lock className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                    <span>Stripe escrow protection</span>
                  </div>
                </div>
              </div>

              {/* Hero image — living room with hardwood floors */}
              <div className="hidden lg:block relative h-[480px] rounded-2xl overflow-hidden shadow-elevation-lg">
                <Image
                  src="https://images.unsplash.com/photo-1722604828977-395d52c3cd23?w=800&q=80&fit=crop"
                  alt="Modern living room with wide plank light oak hardwood flooring"
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 2: Problem Agitation ────────────────────────────── */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl sm:text-4xl">
              You already know how this week goes.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Monday morning. You need 4,000 sq ft of engineered oak for a
              mid-rise project. Here is what happens next.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto stagger-grid">
            {[
              {
                title: "Two days on the phone. The lot sold yesterday.",
                description:
                  "You call six distributors. Leave four voicemails. Chase three quotes. By Wednesday, the lot you wanted is gone. There is no central place to see what is available and what it costs. So you start over.",
              },
              {
                title: "You bought blind. It showed up wrong.",
                description:
                  "A contact's contact had a pallet of closeout LVP at a good price. No photos. No spec sheet. It arrived 300 sq ft short with mismatched dye lots. Buying outside a structured marketplace means no recourse when things go sideways.",
              },
              {
                title: "Five distributors. Five prices. Zero transparency.",
                description:
                  "Same product. Same condition. Five different quotes, none posted publicly. No baseline to compare against. You have no way to know if you are getting a fair price or paying more because you asked first.",
              },
              {
                title: "The best lots go to buyers who are already plugged in.",
                description:
                  "Mill-direct hardwood. Discontinued premium LVP. Name-brand engineered closeouts. Surplus flooring moves fast, and the best inventory gets picked up by buyers connected to the right networks. If you are not in that network, you are always a step behind.",
              },
            ].map((pain) => (
              <Card
                key={pain.title}
                className="card-hover-lift border-l-4 border-l-destructive/40"
              >
                <CardHeader>
                  <CardTitle className="font-display text-lg leading-snug">
                    {pain.title}
                  </CardTitle>
                  <CardDescription className="text-base leading-relaxed">
                    {pain.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Section 3: Solution ─────────────────────────────────────── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-14">
            <h2 className="font-display text-3xl sm:text-4xl">
              One marketplace. Every surplus lot.{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Your sourcing advantage.
              </span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              PlankMarket aggregates closeout, overstock, and discontinued
              flooring from verified manufacturers and distributors into a
              single marketplace. Transparent pricing on every lot. Full specs.
              Integrated freight. The surplus inventory your competitors are
              still chasing by phone is already listed here.
            </p>
          </div>

          {/* Aspirational room image */}
          <div className="relative max-w-4xl mx-auto mb-16 h-64 rounded-2xl overflow-hidden shadow-elevation-md">
            <Image
              src="https://images.unsplash.com/photo-1751945965597-71171ec7a458?w=1200&q=80&fit=crop"
              alt="Bright airy living room with natural light oak flooring and modern decor"
              fill
              className="object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-primary/30 to-transparent" aria-hidden="true" />
            <div className="absolute inset-0 flex items-center px-10 relative z-10">
              <p className="text-white font-display text-2xl max-w-xs drop-shadow-lg">
                First-quality flooring. Below-wholesale pricing.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Value Prop 1 */}
            <div className="flex flex-col gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center shrink-0">
                <Search className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-display text-xl mb-2">
                  See what is available right now. Not after six phone calls.
                </h3>
                <p className="text-muted-foreground text-base leading-relaxed mb-3">
                  Browse hundreds of surplus lots from verified sellers across
                  all 50 states. Hardwood, engineered, laminate, LVP, bamboo,
                  tile. Filter by material, species, grade, square footage,
                  condition, price, and location.
                </p>
                <p className="text-sm text-primary font-medium">
                  Set saved search alerts. Get notified the moment a matching
                  lot is listed. Surplus moves fast. Alerts put you first in
                  line.
                </p>
              </div>
            </div>

            {/* Value Prop 2 */}
            <div className="flex flex-col gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center shrink-0">
                <FileText className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-display text-xl mb-2">
                  44 data fields. Up to 20 photos. Know exactly what you are buying.
                </h3>
                <p className="text-muted-foreground text-base leading-relaxed mb-3">
                  Every listing includes material type, species, dimensions,
                  grade, finish, condition, pallet count, and high-resolution
                  photos. More detail than any broker call or classified ad will
                  give you.
                </p>
                <p className="text-sm text-primary font-medium">
                  No surprises at delivery. You see the product, the specs, and
                  the condition label before you commit a dollar.
                </p>
              </div>
            </div>

            {/* Value Prop 3 */}
            <div className="flex flex-col gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center shrink-0">
                <Shield className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-display text-xl mb-2">
                  Every seller verified. Every payment protected.
                </h3>
                <p className="text-muted-foreground text-base leading-relaxed mb-3">
                  Every seller on PlankMarket undergoes business verification.
                  EIN verification, document review, and admin approval before
                  they list a single lot. Payments are processed via Stripe
                  and held in escrow until the carrier picks up your order.
                </p>
                <p className="text-sm text-primary font-medium">
                  48-hour post-delivery dispute window with photo evidence.
                  Our support team mediates and protects your purchase.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 4: How It Works ─────────────────────────────────── */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4">
              How It Works
            </Badge>
            <h2 className="font-display text-3xl sm:text-4xl">
              Search to delivery in four steps.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto stagger-grid">
            {[
              {
                step: "1",
                title: "Create your free buyer account.",
                description:
                  "Register with your business information. Business verification keeps the marketplace professional. Only verified businesses buy and sell. Approval typically takes 1-3 business days.",
              },
              {
                step: "2",
                title: "Search, filter, and set alerts.",
                description:
                  "Filter by material, species, condition, lot size, price per sq ft, and seller location. Save your searches. Set alerts so you never miss a matching lot.",
              },
              {
                step: "3",
                title: "Buy at the listed price or make an offer.",
                description:
                  "Found the right lot? Buy now or use the built-in offer tool to negotiate directly with the seller. All communication stays on-platform with a full audit trail.",
              },
              {
                step: "4",
                title: "Pay securely and track your freight.",
                description:
                  "Check out via Stripe. Payment is held in escrow. Once the seller ships via LTL freight, you get a tracking number and follow delivery through your buyer dashboard. Funds release to the seller only after carrier pickup is confirmed.",
              },
            ].map((item) => (
              <Card key={item.step} className="card-hover-lift">
                <CardHeader>
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-base font-bold mb-3 shrink-0">
                    {item.step}
                  </div>
                  <CardTitle className="font-display text-base leading-snug">
                    {item.title}
                  </CardTitle>
                  <CardDescription className="text-base leading-relaxed">
                    {item.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Section 5: Features ─────────────────────────────────────── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl sm:text-4xl">
              Built for buyers who source at volume.
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              Every feature exists because buyers told us what slows them down.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto stagger-grid">
            {[
              {
                icon: Search,
                title: "Advanced Filtering Across 20+ Dimensions",
                description:
                  "Material type, wood species, plank width, finish, condition, square footage range, price per sq ft, seller state. Find the lot you need without scrolling through irrelevant inventory.",
              },
              {
                icon: Bell,
                title: "Saved Search Alerts",
                description:
                  "Looking for 3,000+ sq ft of white oak engineered in Grade A condition? Set an alert. You get an email the second a matching lot is listed. First to know, first to buy.",
              },
              {
                icon: FileText,
                title: "44 Flooring-Specific Data Fields",
                description:
                  "Material type, species, manufacturer, dimensions, plank width, wear layer, grade, condition, reason for surplus, pallet count, and up to 20 photos. Make a confident purchasing decision without picking up the phone.",
              },
              {
                icon: MessageSquare,
                title: "Built-In Offer and Negotiation",
                description:
                  "Submit an offer. The seller can accept, counter, or decline. All negotiation happens on-platform with a full audit trail. No side deals. No ambiguity about what was agreed.",
              },
              {
                icon: Truck,
                title: "Integrated LTL Freight with Tracking",
                description:
                  "Freight quotes generated at checkout based on your delivery address, pallet weight, and dimensions. Select a carrier rate, pay once, and track your shipment through delivery. All inside PlankMarket.",
              },
              {
                icon: Shield,
                title: "Escrow Payment and Dispute Resolution",
                description:
                  "Payments held in escrow until carrier pickup is confirmed. 48-hour post-delivery window to report damage or shortages with photo evidence. Our support team mediates and protects your purchase.",
              },
            ].map((feature) => (
              <Card key={feature.title} className="card-hover-lift">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mb-2">
                    <feature.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  </div>
                  <CardTitle className="font-display text-base">
                    {feature.title}
                  </CardTitle>
                  <CardDescription className="text-base leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Section 6: Social Proof ─────────────────────────────────── */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl sm:text-4xl">
              Buyers who stopped calling around.
            </h2>
          </div>

          {/* Testimonials */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16 stagger-grid">
            {[
              {
                quote:
                  "I used to spend half my Monday morning calling distributors to check availability. Now I open PlankMarket, filter for what I need, and have a quote submitted before lunch. Found a 6,200 sq ft lot of prefinished white oak last month — well below what I would have paid through my usual channels.",
                name: "Marcus T.",
                role: "Purchasing Manager",
                company: "Regional flooring contractor, Southeast US",
              },
              {
                quote:
                  "The listing detail is what sold me. Every lot has photos, specs, pallet dimensions, and a clear condition description. I know exactly what is arriving before I pay for it. Have not had a single surprise shipment since I switched.",
                name: "Diane R.",
                role: "Owner",
                company: "Flooring retail store, Midwest",
              },
              {
                quote:
                  "We build 80-100 units a year and flooring is a major cost line. PlankMarket has become a consistent sourcing channel for us — especially for engineered hardwood and LVP. The verified sellers give our procurement team confidence, and the freight integration saves a ton of back-and-forth.",
                name: "James W.",
                role: "VP of Procurement",
                company: "Residential home builder, Mid-Atlantic region",
              },
            ].map((testimonial) => (
              <Card key={testimonial.name} className="card-hover-lift flex flex-col">
                <CardHeader className="flex-1">
                  {/* Star rating */}
                  <div className="flex gap-0.5 mb-3" aria-label="5 out of 5 stars">
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
                  <Separator className="mb-4" />
                  <div>
                    <p className="font-semibold text-sm">{testimonial.name}</p>
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

          {/* Stats bar */}
          <div className="relative rounded-2xl bg-gradient-to-br from-primary to-secondary p-px overflow-hidden">
            <div className="rounded-2xl bg-gradient-to-br from-primary to-secondary p-8">
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center text-white">
                <div>
                  <dt className="font-display text-3xl tabular-nums">
                    30-60%
                  </dt>
                  <dd className="text-sm opacity-80 mt-1">
                    Below standard wholesale on surplus lots
                  </dd>
                </div>
                <div>
                  <dt className="font-display text-3xl tabular-nums">
                    44
                  </dt>
                  <dd className="text-sm opacity-80 mt-1">
                    Flooring-specific data fields per listing
                  </dd>
                </div>
                <div>
                  <dt className="font-display text-3xl tabular-nums">
                    20
                  </dt>
                  <dd className="text-sm opacity-80 mt-1">
                    Photos per listing for full visual documentation
                  </dd>
                </div>
                <div>
                  <dt className="font-display text-3xl">
                    All 50
                  </dt>
                  <dd className="text-sm opacity-80 mt-1">
                    States covered by verified US sellers
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 7: Pricing ──────────────────────────────────────── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
                Transparent Pricing
              </Badge>
              <h2 className="font-display text-3xl sm:text-4xl">
                3% on completed purchases. Nothing else.
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                No subscription fees. No listing access fees. No charges to
                browse. The 3% buyer fee covers payment processing, escrow
                protection, dispute resolution, platform support, and freight
                coordination tools.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-start">
              {/* Fee example */}
              <Card className="shadow-elevation-md">
                <CardHeader>
                  <CardTitle className="font-display text-lg">
                    Fee Example
                  </CardTitle>
                </CardHeader>
                <div className="px-6 pb-6">
                  <dl className="space-y-3">
                    <div className="flex justify-between items-center py-3 border-b border-border">
                      <dt className="text-muted-foreground">Listed lot price</dt>
                      <dd className="font-semibold tabular-nums">$8,000</dd>
                    </div>
                    <div className="flex justify-between items-center py-3 border-b border-border">
                      <dt className="text-muted-foreground">Buyer fee (3%)</dt>
                      <dd className="font-semibold tabular-nums text-primary">
                        $240
                      </dd>
                    </div>
                    <div className="flex justify-between items-center py-3 border-b border-border">
                      <dt className="font-semibold">You pay</dt>
                      <dd className="font-bold text-lg tabular-nums">
                        $8,240 + freight
                      </dd>
                    </div>
                    <div className="flex justify-between items-center py-3">
                      <dt className="text-xs text-muted-foreground">
                        Freight quoted separately at checkout
                      </dt>
                      <dt className="text-xs text-muted-foreground">
                        Seller receives $7,840
                      </dt>
                    </div>
                  </dl>
                </div>
              </Card>

              {/* Comparison */}
              <div className="space-y-4">
                <h3 className="font-display text-lg">
                  Compare that to the alternatives.
                </h3>
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="font-semibold text-sm mb-1">
                      Traditional brokers
                    </p>
                    <p className="text-sm text-muted-foreground">
                      8-15% commission. No transparent pricing. Weeks added to
                      the process. You pay more and wait longer.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="font-semibold text-sm mb-1">
                      Calling distributors directly
                    </p>
                    <p className="text-sm text-muted-foreground">
                      No central visibility into available inventory. Inconsistent
                      pricing. No buyer protection if the order goes wrong.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="font-semibold text-sm mb-1">
                      General marketplaces
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Unverified sellers. No flooring-specific specs. No freight
                      integration. No dispute resolution for commercial freight
                      orders.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                  <p className="text-sm font-medium text-amber-900">
                    You pay 3% only when you complete a purchase. Browse, search,
                    set alerts, and negotiate for free.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 8: FAQ ──────────────────────────────────────────── */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="font-display text-3xl sm:text-4xl">
                Common questions from buyers.
              </h2>
            </div>
            <div className="space-y-4">
              {[
                {
                  question: "Who can buy on PlankMarket?",
                  answer:
                    "PlankMarket is a B2B marketplace for flooring professionals. Retailers, contractors, and builders. To buy, you need to create an account and complete business verification. Your business name, contact information, and EIN are reviewed and approved by our team, typically within 1-3 business days.",
                },
                {
                  question: "What types of flooring are listed?",
                  answer:
                    "Overstock, closeout, discontinued, and surplus inventory across six categories: hardwood, engineered wood, laminate, vinyl/LVP, bamboo, and tile. Conditions include new overstock, discontinued lines, factory seconds, remnants, and customer returns. Every lot is clearly labeled with its condition.",
                },
                {
                  question: "Can I negotiate on price?",
                  answer:
                    "Yes. Every listing supports direct offers. Submit your offer and the seller can accept, counter, or decline within a 48-hour response window. The full offer history is visible to both parties throughout the negotiation.",
                },
                {
                  question: "How does freight work?",
                  answer:
                    "PlankMarket uses integrated LTL freight. At checkout, you enter your delivery address and we generate freight quotes from our carrier network based on pallet weight and dimensions. You select a rate, the freight cost is added to your order, and you can track the shipment in real time through your buyer dashboard.",
                },
                {
                  question: "What if my order arrives damaged or short?",
                  answer:
                    "Note any visible damage on the delivery receipt (BOL) at the time of delivery. Open a dispute in your buyer dashboard within 48 hours with photo evidence. Our support team mediates the claim. Payments are held in escrow until carrier pickup, providing an additional layer of protection.",
                },
                {
                  question: "Is my payment secure?",
                  answer:
                    "All payments are processed through Stripe, which is PCI-compliant and used by millions of businesses. PlankMarket never stores your payment card information. Funds are held in escrow after payment and only released to the seller once carrier pickup is confirmed.",
                },
                {
                  question: "How is this different from buying through a broker?",
                  answer:
                    "Brokers charge 8-15% commission, control what inventory you see, and add weeks to the process. On PlankMarket, you see every available lot from every verified seller, with transparent pricing and a 3% buyer fee. You contact sellers directly. You negotiate directly. No middleman.",
                },
              ].map((faq, index) => (
                <details
                  key={index}
                  className="group rounded-xl border border-border bg-card shadow-elevation-xs open:shadow-elevation-sm transition-shadow duration-200"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-semibold text-sm select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl">
                    <span>{faq.question}</span>
                    {/* Chevron icon rotates when open */}
                    <svg
                      aria-hidden="true"
                      className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </summary>
                  <div className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border pt-4">
                    {faq.answer}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 9: Final CTA ─────────────────────────────────────── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="rounded-3xl bg-gradient-to-br from-primary to-secondary p-12 text-white relative overflow-hidden">
            {/* Decorative elements */}
            <div aria-hidden="true" className="absolute top-0 right-0 w-72 h-72 bg-accent/20 rounded-full blur-3xl" />
            <div aria-hidden="true" className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
            {/* Wood grain texture overlay */}
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-[0.03] rounded-3xl"
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

            <div className="text-center relative z-10">
              <h2 className="font-display text-3xl mb-4 sm:text-4xl">
                Surplus flooring moves fast. The best lots sell in days.
              </h2>
              <p className="text-white/80 mb-8 max-w-xl mx-auto">
                Create your free buyer account and start sourcing closeout
                inventory from verified sellers. Full specs. Transparent
                pricing. Integrated freight. While your competitors are still
                dialing distributors.
              </p>
              <Link href="/register?role=buyer">
                <Button
                  size="xl"
                  variant="gold"
                >
                  Create Your Free Buyer Account
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <p className="mt-5 text-sm text-white/60">
                No subscription. Browse free. Pay 3% only when you buy.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
