import { type Metadata } from "next";
import Link from "next/link";
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
  title: "For Buyers — Source Premium Flooring Below Wholesale | PlankMarket",
  description:
    "PlankMarket connects flooring contractors, retailers, and builders to verified sellers with overstock, closeout, and discontinued flooring inventory — at 30–60% below standard wholesale prices.",
  openGraph: {
    title: "Stop Calling Around. Source Premium Flooring in One Place.",
    description:
      "Browse hundreds of surplus flooring lots from verified manufacturers and distributors. Transparent pricing, full specs, integrated freight. Free to join.",
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
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
              B2B Flooring Marketplace
            </Badge>
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Stop Calling Around.{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Source Premium Flooring in One Place.
              </span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              PlankMarket connects flooring contractors, retailers, and builders
              directly to verified manufacturers and distributors selling
              overstock, closeout, and discontinued inventory — at 30–60% below
              standard wholesale prices.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/listings">
                <Button size="xl" variant="gold">
                  Browse Available Inventory
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/register?role=buyer">
                <Button size="xl" variant="outline">
                  Create a Free Buyer Account
                </Button>
              </Link>
            </div>

            {/* Trust badges */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-elevation-sm">
                <Shield className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                <span>Every seller is business-verified</span>
              </div>
              <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-elevation-sm">
                <Layers className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                <span>6 flooring categories, all 50 US states</span>
              </div>
              <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-elevation-sm">
                <Lock className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                <span>Secure Stripe payments, buyer protection included</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 2: Problem Agitation ────────────────────────────── */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              You already know how this goes.
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto stagger-grid">
            {[
              {
                title: "The phone-around game wastes your week.",
                description:
                  "You need 4,000 sq ft of engineered oak for a mid-rise project. So you spend two days calling distributors, leaving voicemails, and chasing quotes — only to find out the lot you wanted sold yesterday. There's no central place to see what's actually available and what it costs.",
              },
              {
                title: '"Great deal" turns into a quality nightmare.',
                description:
                  "You bought a pallet of closeout LVP from a contact's contact. It arrived short by 300 sq ft, the dye lots didn't match, and there were no photos or specs to reference in the dispute. When you buy outside a structured marketplace, you have no recourse.",
              },
              {
                title: "Pricing is a black box.",
                description:
                  "Call five distributors for the same product and you'll get five different prices — none of them posted publicly. There's no baseline, no transparency, and no way to know if you're getting a fair deal or being taken advantage of because you asked first.",
              },
              {
                title: "Good lots are gone before you hear about them.",
                description:
                  "Surplus flooring moves fast. The best overstock — mill-direct hardwood, discontinued premium LVP, name-brand engineered clearouts — gets picked up by buyers who are already plugged into the right networks. If you're not in that network, you're always a step behind.",
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
                  <CardDescription className="text-sm leading-relaxed">
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
            <p className="text-lg text-muted-foreground leading-relaxed">
              There&apos;s a better way to source. PlankMarket puts the entire
              surplus flooring market in one place, with transparent pricing,
              verified sellers, and everything you need to buy with confidence.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Value Prop 1 */}
            <div className="flex flex-col gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center shrink-0">
                <Search className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold mb-2">
                  One marketplace for all surplus flooring inventory.
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-3">
                  Stop calling distributors one by one. Browse hundreds of lots
                  — hardwood, engineered, laminate, LVP, bamboo, tile — from
                  verified manufacturers and distributors across all 50 states.
                  Filter by material, species, square footage, condition, price,
                  and location.
                </p>
                <p className="text-sm text-primary font-medium">
                  Set saved search alerts and get notified the moment a matching
                  lot is listed. The best inventory goes fast — alerts give you
                  a real head start.
                </p>
              </div>
            </div>

            {/* Value Prop 2 */}
            <div className="flex flex-col gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center shrink-0">
                <FileText className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold mb-2">
                  Every listing is fully documented. No surprises.
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-3">
                  PlankMarket requires detailed specs on every listing: material
                  type, species, dimensions, grade, finish, condition, pallet
                  count, and up to 20 high-resolution photos. You see exactly
                  what you&apos;re buying before you commit.
                </p>
                <p className="text-sm text-primary font-medium">
                  44 flooring-specific data fields per listing — more detail
                  than any general marketplace or broker call will ever give you.
                </p>
              </div>
            </div>

            {/* Value Prop 3 */}
            <div className="flex flex-col gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center shrink-0">
                <Shield className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold mb-2">
                  Verified sellers. Secure payment. Real buyer protection.
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-3">
                  Every seller on PlankMarket undergoes business verification —
                  EIN verification, document review, and admin approval — before
                  listing a single lot. Payments are processed via Stripe and
                  held in escrow until the carrier picks up your order.
                </p>
                <p className="text-sm text-primary font-medium">
                  If something goes wrong, our dispute resolution team steps in.
                  Buyers have 48 hours post-delivery to report damage or
                  shortage, with photo documentation.
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
              Simple Process
            </Badge>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              Four steps from search to delivery.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto stagger-grid">
            {[
              {
                step: "1",
                title: "Create your free buyer account.",
                description:
                  "Register with your business information. Business verification keeps the marketplace professional — only verified businesses can buy and sell. Approval typically takes 1–3 business days.",
              },
              {
                step: "2",
                title: "Browse or search for the inventory you need.",
                description:
                  "Use advanced filters to narrow by material, species, condition, lot size, price per sq ft, and seller location. Save searches and set alerts so you never miss a matching lot.",
              },
              {
                step: "3",
                title: "Make an offer or buy at the listed price.",
                description:
                  "Found the right lot? Buy now at the listed price or use the built-in offer tool to negotiate directly with the seller. All communication stays on-platform — no sharing contact information until your order is placed.",
              },
              {
                step: "4",
                title: "Pay securely and track your freight shipment.",
                description:
                  "Check out via Stripe. Your payment is held in escrow. Once the seller ships your order via LTL freight, you get a tracking number and can follow delivery through your buyer dashboard. Your funds are only released to the seller after carrier pickup is confirmed.",
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
                  <CardDescription className="text-sm leading-relaxed">
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
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              Built for buyers who move fast and buy smart.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto stagger-grid">
            {[
              {
                icon: Search,
                title: "Advanced Search and Filtering",
                description:
                  "Filter listings across 20+ dimensions — material type, wood species, plank width, finish, condition, sq ft range, price per sq ft, seller state, and more. Find exactly what you need without scrolling through irrelevant inventory.",
              },
              {
                icon: Bell,
                title: "Saved Search Alerts",
                description:
                  "Set up alerts for specific products and get an email the moment a matching lot is listed. If you're looking for 3,000+ sq ft of white oak engineered in Grade A condition, you'll know the second it hits the marketplace.",
              },
              {
                icon: FileText,
                title: "Full Listing Specs — 44 Data Fields",
                description:
                  "Every listing includes material type, species, manufacturer, dimensions, plank width, wear layer, grade, condition, reason for surplus, pallet count, and up to 20 photos. You have everything you need to make a confident purchasing decision without a phone call.",
              },
              {
                icon: MessageSquare,
                title: "Built-In Offer and Negotiation",
                description:
                  "Don't want to pay the asking price? Submit an offer. The seller can accept, counter, or decline. All negotiation happens on-platform with a full audit trail — no side deals, no ambiguity.",
              },
              {
                icon: Truck,
                title: "Integrated LTL Freight with Real-Time Tracking",
                description:
                  "Freight quotes are generated at checkout based on your delivery address, pallet weight, and dimensions. Select a carrier rate, pay once, and track your shipment through delivery — all inside PlankMarket.",
              },
              {
                icon: Shield,
                title: "Buyer Protection and Dispute Resolution",
                description:
                  "Payments are held in escrow until carrier pickup is confirmed. Buyers have 48 hours post-delivery to report damage or shortages with photo evidence. Our support team mediates disputes and protects your purchase.",
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
                  <CardDescription className="text-sm leading-relaxed">
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
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              Buyers who found a better way to source.
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
                  "The listing detail is what sold me. Every lot has photos, specs, pallet dimensions, and a clear condition description. I know exactly what's arriving before I pay for it. Haven't had a single surprise shipment since I switched.",
                name: "Diane R.",
                role: "Owner",
                company: "Flooring retail store, Midwest",
              },
              {
                quote:
                  "We build 80–100 units a year and flooring is a major cost line. PlankMarket has become a consistent sourcing channel for us — especially for engineered hardwood and LVP. The verified sellers give our procurement team confidence, and the freight integration saves a ton of back-and-forth.",
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
                  <dt className="font-display text-3xl font-bold tabular-nums">
                    30–60%
                  </dt>
                  <dd className="text-sm opacity-80 mt-1">
                    Typical savings below standard wholesale prices
                  </dd>
                </div>
                <div>
                  <dt className="font-display text-3xl font-bold tabular-nums">
                    20
                  </dt>
                  <dd className="text-sm opacity-80 mt-1">
                    Photos required on every listing for full visual documentation
                  </dd>
                </div>
                <div>
                  <dt className="font-display text-3xl font-bold tabular-nums">
                    44
                  </dt>
                  <dd className="text-sm opacity-80 mt-1">
                    Flooring-specific data fields captured on every listing
                  </dd>
                </div>
                <div>
                  <dt className="font-display text-3xl font-bold">
                    All 50
                  </dt>
                  <dd className="text-sm opacity-80 mt-1">
                    States covered — nationwide inventory from verified US sellers
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
              <h2 className="font-display text-3xl font-bold sm:text-4xl">
                One fee. No surprises.
              </h2>
              <p className="mt-4 text-xl font-semibold text-primary">
                You pay 3% on top of the listed price. That&apos;s it.
              </p>
              <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
                The 3% buyer fee covers payment processing, buyer protection,
                dispute resolution, platform support, and freight coordination
                tools. There are no membership fees, no listing access fees, and
                no charges to browse.
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
                <h3 className="font-display text-lg font-bold">
                  Compared to alternatives
                </h3>
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="font-semibold text-sm mb-1">
                      Traditional brokers
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Charge 8–15% commission, provide no transparent pricing,
                      and add weeks to the process.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="font-semibold text-sm mb-1">
                      Calling distributors directly
                    </p>
                    <p className="text-sm text-muted-foreground">
                      No central visibility, inconsistent pricing, and no buyer
                      protection on side deals.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="font-semibold text-sm mb-1">
                      General marketplaces (eBay, Craigslist)
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Unverified sellers, no flooring-specific specs, no freight
                      integration, no dispute resolution for commercial freight.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                  <p className="text-sm font-medium text-amber-900">
                    No subscription. No listing access fees. No renewal charges.
                    You pay 3% only when you complete a purchase.
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
              <h2 className="font-display text-3xl font-bold sm:text-4xl">
                Frequently asked questions
              </h2>
            </div>
            <div className="space-y-4">
              {[
                {
                  question: "Who can buy on PlankMarket?",
                  answer:
                    "PlankMarket is a B2B marketplace for flooring professionals. To buy, you need to create an account and complete business verification — your business name, contact information, and EIN are reviewed and approved by our team, typically within 1–3 business days. This keeps the marketplace professional and ensures you're dealing with verified sellers.",
                },
                {
                  question: "What types of flooring are available?",
                  answer:
                    "PlankMarket lists overstock, closeout, discontinued, and surplus inventory across six categories: hardwood, engineered wood, laminate, vinyl/LVP, bamboo, and tile. Inventory includes new overstock, discontinued lines, factory seconds, remnants, customer returns, and slightly damaged lots clearly marked and described.",
                },
                {
                  question: "Can I negotiate on price?",
                  answer:
                    "Yes. Every listing supports direct offers. Submit your offer, and the seller can accept, counter, or decline — all within a 48-hour response window. The offer history is visible to both parties throughout the negotiation.",
                },
                {
                  question: "How does shipping work?",
                  answer:
                    "PlankMarket uses integrated LTL freight. When you check out, you enter your delivery address and we generate freight quotes from our carrier network. You select a rate, and the freight cost is added to your order. The seller ships via LTL, and you can track the shipment in real time through your buyer dashboard.",
                },
                {
                  question: "What happens if my order arrives damaged or short?",
                  answer:
                    "Note any visible damage on the delivery receipt (BOL) at the time of delivery. Then open a dispute in your buyer dashboard within 48 hours with photo evidence. Our support team will mediate the claim. Payments are held in escrow until carrier pickup, providing an additional layer of protection.",
                },
                {
                  question: "Is my payment information secure?",
                  answer:
                    "Yes. All payments are processed through Stripe, which is PCI-compliant and used by millions of businesses worldwide. PlankMarket never stores your payment card information. Your funds are held in escrow after payment and only released to the seller once carrier pickup is confirmed.",
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
              <h2 className="font-display text-3xl font-bold mb-4 sm:text-4xl">
                The best lots sell in days. Start sourcing smarter today.
              </h2>
              <p className="text-white/80 mb-8 max-w-xl mx-auto">
                Create your free buyer account and access hundreds of verified
                surplus flooring lots — with transparent pricing, full specs, and
                integrated freight.
              </p>
              <Link href="/register?role=buyer">
                <Button
                  size="xl"
                  className="bg-gradient-to-b from-amber-400 to-amber-500 text-amber-950 shadow-md hover:shadow-lg hover:brightness-110"
                >
                  Create Your Free Buyer Account
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <p className="mt-5 text-sm text-white/60">
                No subscription fees. Browse free. Pay 3% only when you buy.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
