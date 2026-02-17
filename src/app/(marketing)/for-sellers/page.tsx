import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  Shield,
  CreditCard,
  Zap,
  Camera,
  Users,
  MessageSquare,
  BarChart2,
  CheckCircle2,
  XCircle,
  Quote,
  Warehouse,
  PackageX,
  TrendingDown,
  UserX,
  Globe,
  Clock,
  Database,
  Percent,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Sell Surplus Flooring B2B — Liquidate Faster, Recover More | PlankMarket",
  description:
    "PlankMarket is the dedicated B2B marketplace for flooring manufacturers, distributors, and wholesalers to move overstock, discontinued, and closeout inventory. 2% commission, no listing fees.",
  openGraph: {
    title: "Sell Surplus Flooring B2B | PlankMarket",
    description:
      "Move overstock, discontinued, and closeout flooring inventory to verified buyers across all 50 states. 2% commission only on completed sales — no listing fees, no monthly costs.",
    type: "website",
  },
};

export const revalidate = 3600;

const PAIN_POINTS = [
  {
    icon: Warehouse,
    title: "Warehouse space isn't free — and overstock fills it fast.",
    description:
      "You're paying per square foot to store inventory that isn't moving. A 5,000 sq ft lot of discontinued engineered oak sitting on pallets for six months isn't just lost revenue — it's active overhead. That rack space has a price tag, and it compounds every week the inventory stays.",
  },
  {
    icon: PackageX,
    title: "Your sales channels weren't built for liquidation.",
    description:
      "Your wholesale accounts don't want last year's closeout SKUs. Your reps are focused on active product lines. And posting lots on general classifieds or calling around to liquidators means weeks of low-ball offers, no-shows, and time your team doesn't have. You need a channel built specifically for surplus flooring.",
  },
  {
    icon: TrendingDown,
    title: "Capital tied up in inventory is capital you can't use.",
    description:
      "That $200,000 in overstock sitting in your warehouse looks like an asset on paper — but it's not working for you. Every month it doesn't move, depreciation and storage eat into your recovery. The longer it sits, the less you'll get for it.",
  },
  {
    icon: UserX,
    title: "Unverified buyers waste everyone's time.",
    description:
      "Posting on open marketplaces brings in hobbyists, flippers, and low-ball offers from people who aren't serious buyers. You field inquiries for weeks, share detailed photos and specs, and then the deal falls apart. You need access to verified flooring professionals with real purchasing budgets and the intent to close.",
  },
] as const;

const VALUE_PROPS = [
  {
    number: "01",
    title: "Reach a network of verified flooring buyers across all 50 states.",
    description:
      "PlankMarket's buyer network consists exclusively of verified businesses — flooring contractors, retail stores, builders, and purchasing managers — who have registered specifically to source surplus inventory. They're not browsing casually. They have projects to fill and budgets to spend.",
    detail:
      "Buyers set up saved search alerts for specific products. When your lot matches their criteria, they're notified immediately — driving faster inquiries from buyers who already want what you're selling.",
  },
  {
    number: "02",
    title: "List in minutes. Our AI does the heavy lifting.",
    description:
      "PlankMarket's AI-assisted listing tool drafts your product description from the specs you enter — material type, dimensions, condition, lot size. Upload your photos, set your price, review the draft, and publish. No copywriting, no formatting, no hours of admin work per lot.",
    detail:
      "AI-powered listing creation, up to 20 photos per listing, and 44 flooring-specific fields ensure your lots are presented with the detail buyers need to commit — which means faster, more confident offers.",
  },
  {
    number: "03",
    title: "Get paid fast. No cash flow surprises.",
    description:
      "Buyers pay through Stripe at checkout. Your funds are held securely until the carrier picks up the shipment — then payment is released to your Stripe Connect account automatically. No chasing invoices, no net-30 terms, no collections calls.",
    detail:
      "Funds typically arrive in your bank within 3–5 business days after carrier pickup. Your seller dashboard shows real-time earnings, payout status, and full transaction history.",
  },
] as const;

const STEPS = [
  {
    number: "1",
    title: "Register and complete business verification.",
    description:
      "Create a seller account with your business name, EIN, and company details. Our team reviews applications within 1–3 business days. Verified status is displayed on your listings — it builds buyer trust and accelerates deals.",
  },
  {
    number: "2",
    title: "List your surplus inventory.",
    description:
      "Use our step-by-step listing flow. Enter material specs, upload up to 20 photos, set your asking price, and choose whether to accept offers or Buy Now only. Our AI drafts your listing description — you review and publish.",
  },
  {
    number: "3",
    title: "Negotiate and close.",
    description:
      "Buyers can purchase at your listed price or submit an offer. You accept, counter, or decline — all within the platform. Once a deal is agreed, the buyer pays via Stripe and your order appears in your seller dashboard.",
  },
  {
    number: "4",
    title: "Ship it. Get paid.",
    description:
      "Coordinate LTL freight through the platform's integrated carrier network. Once the carrier picks up the shipment, payment is automatically released. Funds arrive in your bank within 3–5 business days.",
  },
] as const;

const FEATURES = [
  {
    icon: Zap,
    title: "AI-Powered Listing Creation",
    description:
      "Enter your specs and let the AI draft a complete, detailed listing description. Reduce listing time from 30 minutes to under 5. Publish faster, move inventory faster.",
  },
  {
    icon: Camera,
    title: "Up to 20 Photos Per Listing",
    description:
      "Upload high-resolution photos showing material, finish, texture, packaging, and condition. Detailed visual documentation reduces buyer hesitation, drives higher offer rates, and reduces post-sale disputes.",
  },
  {
    icon: Users,
    title: "Verified Buyer Network",
    description:
      "Every buyer on PlankMarket has completed business verification. You're dealing with flooring professionals, contractors, retailers, and builders — not tire-kickers or flippers. Serious buyers close faster.",
  },
  {
    icon: MessageSquare,
    title: "Built-In Messaging and Offer Negotiation",
    description:
      "All communication happens on-platform. Buyers can ask questions via direct messaging or submit offers through the built-in negotiation tool. Identity masking protects contact information until an order is placed — keeping deals on the platform.",
  },
  {
    icon: CreditCard,
    title: "Secure Stripe Payments with Escrow",
    description:
      "Buyers pay via Stripe at checkout. Funds are held in escrow until carrier pickup is confirmed — then automatically released to your Stripe Connect account. No net terms, no payment chasing, no wire transfer friction.",
  },
  {
    icon: BarChart2,
    title: "Seller Dashboard and Analytics",
    description:
      "Track active listings, pending orders, completed sales, and total revenue in one place. Monitor offer activity, respond to inquiries, and manage your inventory portfolio from a single dashboard.",
  },
] as const;

const TESTIMONIALS = [
  {
    quote:
      "We had 18,000 sq ft of discontinued engineered hickory taking up three rack bays for almost a year. Listed it on PlankMarket on a Tuesday — had four offers by Friday and it was sold and scheduled for pickup the following week. That's faster than anything our sales team had managed in months.",
    name: "Kevin M.",
    role: "Inventory Manager",
    company: "Regional flooring distributor, Texas",
  },
  {
    quote:
      "The AI listing tool is the part I wasn't expecting to care about — but it saves my team real time. We have closeouts cycling through constantly and listing each one used to be a full admin task. Now we upload photos, enter the specs, review the draft, and publish. It's genuinely quick.",
    name: "Sandra L.",
    role: "Operations Director",
    company: "Flooring manufacturer, Southeast US",
  },
  {
    quote:
      "The verified buyer network is worth it on its own. I was spending hours responding to inquiries from people who weren't serious. Every buyer on PlankMarket has been through verification — they're actual businesses with actual projects. Conversations move to offers much faster.",
    name: "Tom H.",
    role: "Owner",
    company: "Flooring wholesale and distribution, Midwest",
  },
] as const;

const STATS = [
  {
    icon: Percent,
    value: "2%",
    label: "Seller commission",
    detail: "Only on completed sales. No listing fees.",
  },
  {
    icon: Clock,
    value: "3–5 days",
    label: "Typical payout timeline",
    detail: "After carrier pickup",
  },
  {
    icon: Database,
    value: "44",
    label: "Data fields per listing",
    detail: "Flooring-specific spec fields for buyer confidence",
  },
  {
    icon: Globe,
    value: "All 50",
    label: "States covered",
    detail: "Access to verified buyers coast to coast",
  },
] as const;

const NO_FEES = [
  "No subscription fee.",
  "No listing or insertion fee.",
  "No renewal fee on unsold inventory.",
  "No payout or withdrawal fee.",
  "No featured placement charges.",
] as const;

const ALTERNATIVES = [
  {
    label: "Traditional liquidators",
    detail:
      "Typically pay 30–50 cents on the dollar for your inventory — a fraction of what you'd recover through direct sale.",
  },
  {
    label: "Freight brokers and middlemen",
    detail:
      "Add markup layers, provide no buyer network, and give you no visibility into the transaction.",
  },
  {
    label: "Open classifieds or general marketplaces",
    detail:
      "No flooring-specific tooling, no verified buyers, no freight integration, no payment protection.",
  },
] as const;

const FAQS = [
  {
    question: "What types of inventory can I list?",
    answer:
      "You can list any surplus, overstock, discontinued, or closeout flooring inventory across six material categories: hardwood, engineered wood, laminate, vinyl/LVP, bamboo, and tile. Supported conditions include new overstock, discontinued lines, closeouts, factory seconds, remnants, customer returns, and slightly damaged inventory — as long as condition is accurately described and documented.",
  },
  {
    question: "How does business verification work?",
    answer:
      "When you register as a seller, you submit your business name, EIN, company details, and supporting documentation. Our team reviews your application — including AI-assisted document and website analysis — and typically completes verification within 1–3 business days. Verified status appears on your listings and increases buyer confidence.",
  },
  {
    question: "Can I set a minimum lot size or split lots?",
    answer:
      "Yes. When creating a listing, you can specify whether the lot must be sold as a whole or if you're willing to split. You can also set a minimum order quantity. Buyers will see these terms on the listing before making an offer.",
  },
  {
    question: "When do I get paid?",
    answer:
      "Once the carrier picks up your shipment, payment is automatically released from escrow and transferred to your connected Stripe account. Funds are typically available in your bank within 3–5 business days of pickup. You can view real-time payout status in your seller dashboard.",
  },
  {
    question: "What if a buyer disputes the order?",
    answer:
      "Buyers have 48 hours after delivery to open a dispute, supported by photo evidence and delivery receipt notes. Our support team mediates the dispute. Freight damage must be noted on the Bill of Lading at time of delivery. If no dispute is filed within 5 business days of delivery, the transaction closes automatically and your funds are confirmed.",
  },
  {
    question: "Is there a limit to how many lots I can list?",
    answer:
      "No. Listings are unlimited. List one lot or a hundred — there are no per-listing fees and no inventory caps. For high-volume sellers managing large portfolios, contact our team about CSV bulk upload and enterprise account options.",
  },
] as const;

export default function ForSellersPage() {
  return (
    <>
      {/* ── Section 1: Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-20 md:py-32">
        {/* Wood grain texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          aria-hidden="true"
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
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" aria-hidden="true" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" aria-hidden="true" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="mx-auto max-w-5xl">
            {/* Two-column layout: photo left, copy right */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Hero image — stack of wooden planks */}
              <div className="hidden lg:block relative h-[480px] rounded-2xl overflow-hidden shadow-elevation-lg order-last lg:order-first">
                <Image
                  src="https://images.unsplash.com/photo-1681752972950-6229ca099fbc?w=800&q=80&fit=crop"
                  alt="Stacked wooden flooring planks ready for liquidation"
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent" aria-hidden="true" />
              </div>

              <div className="text-center lg:text-left">
                <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
                  Liquidate Faster. Recover More.
                </Badge>
                <h1 className="font-display text-4xl tracking-tight sm:text-5xl md:text-6xl">
                  Your Surplus Flooring Has a Buyer.{" "}
                  <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    Find Them Here.
                  </span>
                </h1>
                <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto lg:mx-0">
                  PlankMarket is the dedicated B2B marketplace where flooring manufacturers, distributors, and retailers move overstock, discontinued, and closeout inventory — directly to verified buyers who are actively looking for it.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                  <Link href="/register?role=seller">
                    <Button
                      size="xl"
                      variant="gold"
                    >
                      List Your First Lot Free
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/how-it-works">
                    <Button variant="outline" size="xl">
                      See How It Works
                    </Button>
                  </Link>
                </div>

                {/* Trust signals */}
                <div className="mt-10 flex flex-wrap items-center justify-center lg:justify-start gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-elevation-sm">
                    <Shield className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                    <span>Verified buyers only — no tire-kickers</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-elevation-sm">
                    <CreditCard className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                    <span>Stripe payments, funds held securely until pickup</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-elevation-sm">
                    <Zap className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                    <span>2% commission, no listing fees, no monthly costs</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: Problem Agitation ── */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl sm:text-4xl">
              Every day that surplus sits,{" "}
              <span className="text-primary">it&apos;s costing you.</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto stagger-grid">
            {PAIN_POINTS.map((point) => (
              <Card key={point.title} className="card-hover-lift border-destructive/10 bg-card">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-red-50 flex items-center justify-center mb-3">
                    <point.icon className="h-6 w-6 text-red-500" aria-hidden="true" />
                  </div>
                  <CardTitle className="font-display text-lg leading-snug">{point.title}</CardTitle>
                  <CardDescription className="text-base leading-relaxed">{point.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 3: Solution ── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <Badge variant="outline" className="mb-4 border-secondary text-secondary">
              The Solution
            </Badge>
            <p className="text-xl text-muted-foreground leading-relaxed">
              PlankMarket was built specifically to solve the surplus flooring problem — a dedicated channel that connects your inventory to verified buyers who are ready to purchase, with the tools to make the process fast and friction-free.
            </p>
          </div>

          {/* Warehouse/inventory photo */}
          <div className="relative max-w-4xl mx-auto mb-16 h-56 rounded-2xl overflow-hidden shadow-elevation-md">
            <Image
              src="https://images.unsplash.com/photo-1422246654994-34520d5a0340?w=1200&q=80&fit=crop"
              alt="Brown wood planks stacked in a warehouse, representing surplus flooring inventory"
              fill
              className="object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-secondary/40 to-transparent" aria-hidden="true" />
            <div className="absolute inset-0 flex items-center px-10 relative z-10">
              <p className="text-white font-display text-2xl max-w-xs drop-shadow-lg">
                Turn warehouse space into working capital.
              </p>
            </div>
          </div>

          <div className="max-w-4xl mx-auto space-y-12">
            {VALUE_PROPS.map((prop) => (
              <div key={prop.number} className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 md:gap-10 items-start">
                {/* Number badge */}
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center shrink-0">
                  <span className="font-display text-2xl text-primary" aria-hidden="true">
                    {prop.number}
                  </span>
                </div>
                <div>
                  <h3 className="font-display text-xl mb-3">{prop.title}</h3>
                  <p className="text-muted-foreground mb-4 leading-relaxed">{prop.description}</p>
                  <div className="flex items-start gap-2 bg-secondary/5 border border-secondary/20 rounded-lg p-4">
                    <CheckCircle2 className="h-4 w-4 text-secondary shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground leading-relaxed">{prop.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 4: How It Works ── */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
              For Sellers
            </Badge>
            <h2 className="font-display text-3xl sm:text-4xl">
              From listing to payout in four steps.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto stagger-grid">
            {STEPS.map((step) => (
              <Card key={step.number} className="card-hover-lift relative overflow-hidden">
                {/* Accent bar */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-secondary" aria-hidden="true" />
                <CardHeader>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground flex items-center justify-center mb-3 font-bold text-lg shrink-0">
                    {step.number}
                  </div>
                  <CardTitle className="font-display text-base leading-snug">{step.title}</CardTitle>
                  <CardDescription className="text-base leading-relaxed">{step.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link href="/register?role=seller">
              <Button size="xl" variant="gold">
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Section 5: Features ── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="font-display text-3xl sm:text-4xl">
              Every tool your team needs to move inventory efficiently.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto stagger-grid">
            {FEATURES.map((feature) => (
              <Card key={feature.title} className="card-hover-lift">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mb-3">
                    <feature.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  </div>
                  <CardTitle className="font-display text-base">{feature.title}</CardTitle>
                  <CardDescription className="text-base leading-relaxed">{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 6: Social Proof ── */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="font-display text-3xl sm:text-4xl">
              Sellers who stopped sitting on surplus.
            </h2>
          </div>

          {/* Testimonials */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16 stagger-grid">
            {TESTIMONIALS.map((t) => (
              <Card key={t.name} className="card-hover-lift flex flex-col">
                <CardContent className="pt-6 flex flex-col h-full">
                  <Quote className="h-6 w-6 text-primary/30 mb-4 shrink-0" aria-hidden="true" />
                  <blockquote className="text-sm text-muted-foreground leading-relaxed flex-1 italic">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <div className="mt-6 pt-4 border-t border-border">
                    <p className="font-semibold text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                    <p className="text-xs text-muted-foreground">{t.company}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Stats bar */}
          <div className="relative rounded-2xl bg-gradient-to-br from-primary to-secondary text-primary-foreground overflow-hidden">
            {/* Subtle wood grain texture */}
            <div
              className="absolute inset-0 opacity-[0.02]"
              aria-hidden="true"
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
            <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/10">
              {STATS.map((stat) => (
                <div key={stat.value} className="bg-primary/5 p-8 text-center">
                  <div className="font-display text-4xl tabular-nums">{stat.value}</div>
                  <div className="text-sm font-medium mt-2 opacity-90">{stat.label}</div>
                  <div className="text-xs opacity-70 mt-1">{stat.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 7: Pricing ── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
              Transparent Pricing
            </Badge>
            <h2 className="font-display text-3xl sm:text-4xl">
              2% on what you sell. Zero on what you don&apos;t.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              No listing fees. No monthly subscription. Pay 2% only when a sale completes.
            </p>
          </div>

          <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Fee example card */}
            <Card className="border-primary/30 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-primary/50" aria-hidden="true" />
              <CardHeader>
                <Badge variant="outline" className="w-fit border-primary text-primary mb-1">
                  Example Transaction
                </Badge>
                <CardTitle className="font-display text-xl">$12,000 listed price</CardTitle>
                <CardDescription>
                  PlankMarket charges a 2% commission on completed sales. That commission covers access to the buyer network, payment processing infrastructure, buyer verification, dispute mediation, messaging tools, freight coordination, and platform support. You pay nothing to list, nothing monthly, and nothing on inventory that doesn&apos;t sell.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm font-medium">Your listed price</span>
                    <span className="text-sm font-semibold">$12,000</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Seller commission (2%)</span>
                    <span className="text-sm text-muted-foreground">−$240</span>
                  </div>
                  <div className="flex justify-between items-center py-2 px-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <span className="text-sm font-semibold">Your payout</span>
                    <span className="text-sm font-bold text-primary">$11,760</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Buyer pays</span>
                    <span className="text-sm text-muted-foreground">$12,360</span>
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    Buyer pays listed price + 3% buyer fee — separate from your payout. Transferred to your Stripe Connect account.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Comparison + No hidden fees */}
            <div className="space-y-6">
              {/* Alternatives */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-display text-base">Compared to alternatives</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ALTERNATIVES.map((alt) => (
                    <div key={alt.label} className="flex items-start gap-3">
                      <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-medium">{alt.label}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{alt.detail}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* No hidden fees */}
              <Card className="bg-secondary/5 border-secondary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="font-display text-base text-secondary">No hidden fees — ever</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {NO_FEES.map((fee) => (
                      <li key={fee} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-secondary shrink-0" aria-hidden="true" />
                        <span>{fee}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Volume sellers note */}
          <div className="max-w-4xl mx-auto mt-8">
            <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/30 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-400 to-amber-500" aria-hidden="true" />
              <CardHeader className="md:flex-row md:items-center md:gap-6">
                <div className="shrink-0">
                  <Badge className="border-transparent bg-amber-100 text-amber-800 mb-2 md:mb-0">
                    Volume Sellers
                  </Badge>
                </div>
                <div>
                  <CardDescription className="text-foreground">
                    High-volume sellers with large inventories or frequent transactions may be eligible for reduced commission rates. Contact our partnerships team at{" "}
                    <a
                      href="mailto:partnerships@plankmarket.com"
                      className="text-primary underline-offset-2 hover:underline font-medium"
                    >
                      partnerships@plankmarket.com
                    </a>{" "}
                    to discuss custom pricing.
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* ── Section 8: FAQ ── */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="font-display text-3xl sm:text-4xl">
              Frequently asked questions
            </h2>
          </div>
          <div className="max-w-3xl mx-auto">
            <dl className="space-y-3">
              {FAQS.map((faq) => (
                <details
                  key={faq.question}
                  className="group rounded-xl border border-border bg-card shadow-elevation-xs open:shadow-elevation-sm transition-shadow"
                >
                  <summary
                    className="flex items-center justify-between gap-4 cursor-pointer list-none px-6 py-5 font-semibold text-sm select-none hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
                  >
                    <dt>{faq.question}</dt>
                    {/* Chevron — rotates when open */}
                    <span
                      className="shrink-0 w-5 h-5 rounded-full border border-border flex items-center justify-center text-muted-foreground group-open:rotate-180 transition-transform duration-200"
                      aria-hidden="true"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </summary>
                  <dd className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </dd>
                </details>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── Section 9: Final CTA ── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="rounded-3xl bg-gradient-to-br from-primary to-secondary p-12 md:p-16 text-white relative overflow-hidden">
            {/* Wood grain texture overlay */}
            <div
              className="absolute inset-0 opacity-[0.02]"
              aria-hidden="true"
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

            {/* Decorative blur circles */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-accent/20 rounded-full blur-3xl" aria-hidden="true" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl" aria-hidden="true" />

            <div className="text-center relative z-10">
              <h2 className="font-display text-3xl sm:text-4xl md:text-5xl mb-6">
                Your surplus is sitting.
                <br />
                Your buyers are waiting.
              </h2>
              <p className="text-white/80 mb-10 max-w-xl mx-auto text-lg leading-relaxed">
                Every day your overstock stays in the warehouse is a day it&apos;s costing you. List your first lot free today and put that inventory in front of verified buyers across all 50 states.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/register?role=seller">
                  <Button
                    size="xl"
                    variant="gold"
                  >
                    Create Your Seller Account Free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <p className="mt-6 text-white/60 text-sm">
                No listing fees. No monthly cost. Pay 2% only when you sell.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
