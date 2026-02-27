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
  Timer,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Sell Surplus Flooring B2B — Move Closeouts Before the Margin Disappears | PlankMarket",
  description:
    "Your closeout flooring is losing value right now. PlankMarket connects manufacturers and distributors with verified retailers to liquidate surplus inventory fast. 2% seller fee. No listing costs.",
  openGraph: {
    title: "Your Surplus Flooring Is Depreciating. Move It on PlankMarket.",
    description:
      "The B2B marketplace built for flooring liquidation. Verified buyers across all 50 states. 2% commission only on completed sales. 3-5 day payouts.",
    type: "website",
  },
};

export const revalidate = 3600;

const PAIN_POINTS = [
  {
    icon: Warehouse,
    title: "Warehouse space has a price tag. Your surplus is running up the tab.",
    description:
      "A 5,000 sq ft lot of discontinued engineered oak sitting on pallets for six months is not an asset. It is active overhead. Rack space, insurance, climate control, property tax allocation — those costs compound every week the inventory stays. You are paying to store product that is not generating revenue.",
  },
  {
    icon: PackageX,
    title: "Your sales channels were built to sell active lines. Not liquidate closeouts.",
    description:
      "Your wholesale accounts do not want last year's discontinued SKUs. Your reps are focused on current product lines and commission targets. Posting lots on general classifieds brings weeks of low-ball offers, no-shows, and tire-kickers. You need a channel purpose-built for surplus flooring — not a workaround.",
  },
  {
    icon: TrendingDown,
    title: "$200K in overstock looks like an asset on paper. It is not working for you.",
    description:
      "Capital locked in surplus inventory is capital you cannot deploy. No new product buys. No warehouse improvements. No growth spending. And every month that inventory does not move, depreciation and carrying costs shrink your recovery. The math gets worse, not better.",
  },
  {
    icon: UserX,
    title: "Unverified inquiries are the most expensive time sink in liquidation.",
    description:
      "You field the inquiry. Share detailed specs and photos. Answer follow-up questions. Schedule a call. Then the buyer disappears, counters at 30 cents on the dollar, or turns out to be a hobbyist who wanted five boxes, not five pallets. Hours gone. No sale. You need buyers who have been vetted before they reach you.",
  },
] as const;

const VALUE_PROPS = [
  {
    number: "01",
    title: "A verified buyer network that is actively sourcing surplus flooring.",
    description:
      "Every buyer on PlankMarket has completed business verification — EIN confirmation, document review, admin approval. These are flooring contractors, retail stores, builders, and purchasing managers who registered specifically to source closeout and overstock inventory. They are not browsing. They have projects to fill and budgets allocated.",
    detail:
      "Buyers set up saved search alerts for specific materials, species, grades, and conditions. When your lot matches, they are notified immediately. Your inventory reaches the right buyer the day it goes live — not after weeks of outreach.",
  },
  {
    number: "02",
    title: "List a lot in under five minutes. The AI handles the description.",
    description:
      "Enter your specs — material type, species, dimensions, grade, condition, lot size. Upload photos. Set your price. PlankMarket's AI drafts a complete listing description from your inputs. Review the draft, adjust if needed, and publish. That is it. No copywriting. No formatting. No admin bottleneck.",
    detail:
      "44 flooring-specific data fields. Up to 20 photos per listing. CSV bulk upload for high-volume sellers managing large inventories. Your team lists faster, which means your inventory hits the market faster, which means the depreciation clock stops sooner.",
  },
  {
    number: "03",
    title: "Funds in your bank 3-5 days after carrier pickup. No invoices to chase.",
    description:
      "Buyers pay through Stripe at checkout. Funds are held in escrow until the carrier picks up the shipment. Once pickup is confirmed, payment releases automatically to your Stripe Connect account. No net-30 terms. No collections calls. No accounts receivable friction.",
    detail:
      "Your seller dashboard shows real-time earnings, payout status, and full transaction history. You see exactly when funds clear — no guesswork, no follow-up calls.",
  },
] as const;

const STEPS = [
  {
    number: "1",
    title: "Register and verify your business.",
    description:
      "Create a seller account with your business name, EIN, and company details. Our team reviews applications within 1-3 business days. Verified status displays on every listing you publish — it builds buyer confidence and moves deals faster.",
  },
  {
    number: "2",
    title: "List your surplus inventory.",
    description:
      "Enter material specs, upload up to 20 photos, set your asking price. Choose whether to accept offers, Buy Now only, or both. The AI drafts your listing description — you review and publish. Five minutes per lot, not thirty.",
  },
  {
    number: "3",
    title: "Negotiate and close on-platform.",
    description:
      "Buyers purchase at your listed price or submit an offer. You accept, counter, or decline — all within PlankMarket. Once a deal is agreed, the buyer pays through Stripe and the order appears in your dashboard.",
  },
  {
    number: "4",
    title: "Ship it. Get paid.",
    description:
      "Coordinate freight through the platform. Once the carrier picks up the shipment, payment releases automatically. Funds arrive in your bank within 3-5 business days. The inventory is gone. The capital is back.",
  },
] as const;

const FEATURES = [
  {
    icon: Zap,
    title: "AI-Assisted Listing Creation",
    description:
      "Enter your specs. The AI drafts a complete, detailed listing description. What used to take 30 minutes per lot now takes under five. Your inventory gets to market the same day it gets cleared for liquidation.",
  },
  {
    icon: Camera,
    title: "Up to 20 Photos Per Listing",
    description:
      "Upload high-resolution photos showing material, finish, texture, packaging, and condition. Detailed visual documentation reduces buyer hesitation and drives higher offer rates. Fewer questions. Faster closes.",
  },
  {
    icon: Users,
    title: "Verified Buyer Network",
    description:
      "Every buyer has completed business verification — EIN, documentation, admin approval. You are dealing with flooring contractors, retailers, builders, and purchasing managers. Serious buyers with real budgets who close faster.",
  },
  {
    icon: MessageSquare,
    title: "On-Platform Messaging and Negotiation",
    description:
      "Buyers ask questions via direct messaging or submit offers through the built-in negotiation tool. Contact information stays masked until an order is placed. All communication in one place — no scattered email threads.",
  },
  {
    icon: CreditCard,
    title: "Stripe Payments with Escrow Protection",
    description:
      "Buyers pay via Stripe at checkout. Funds hold in escrow until carrier pickup is confirmed, then release automatically to your Stripe Connect account. No net terms. No wire transfer friction. No payment chasing.",
  },
  {
    icon: BarChart2,
    title: "Seller Dashboard and Analytics",
    description:
      "Track active listings, pending orders, completed sales, and total revenue in one view. Monitor offer activity, respond to inquiries, and manage your inventory portfolio from a single dashboard.",
  },
] as const;

const TESTIMONIALS = [
  {
    quote:
      "We had 18,000 sq ft of discontinued engineered hickory taking up three rack bays for almost a year. Listed it on PlankMarket on a Tuesday — had four offers by Friday and it was sold and scheduled for pickup the following week. That is faster than anything our sales team had managed in months.",
    name: "Kevin M.",
    role: "Inventory Manager",
    company: "Regional flooring distributor, Texas",
  },
  {
    quote:
      "The AI listing tool is the part I was not expecting to care about — but it saves my team real time. We have closeouts cycling through constantly and listing each one used to be a full admin task. Now we upload photos, enter the specs, review the draft, and publish. Five minutes, done.",
    name: "Sandra L.",
    role: "Operations Director",
    company: "Flooring manufacturer, Southeast US",
  },
  {
    quote:
      "The verified buyer network is worth it on its own. I was spending hours responding to inquiries from people who were not serious. Every buyer on PlankMarket has been through verification — they are actual businesses with actual projects. Conversations move to offers much faster.",
    name: "Tom H.",
    role: "Owner",
    company: "Flooring wholesale and distribution, Midwest",
  },
] as const;

const STATS = [
  {
    icon: Percent,
    value: "2%",
    label: "Seller fee",
    detail: "Only on completed sales. Zero listing costs.",
  },
  {
    icon: Clock,
    value: "3-5 days",
    label: "Payout timeline",
    detail: "Funds in your bank after carrier pickup",
  },
  {
    icon: Database,
    value: "44",
    label: "Flooring-specific data fields",
    detail: "Buyers get the detail they need to commit",
  },
  {
    icon: Globe,
    value: "All 50",
    label: "US states covered",
    detail: "Verified buyers coast to coast",
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
      "Pay 30-50 cents on the dollar for your inventory. You are leaving recovery on the table to avoid the hassle of selling direct.",
  },
  {
    label: "Freight brokers and middlemen",
    detail:
      "Add markup layers, provide no buyer network, and give you zero visibility into the end transaction.",
  },
  {
    label: "Open classifieds or general marketplaces",
    detail:
      "No flooring-specific tooling, no verified buyers, no freight integration, no payment protection. You spend more time filtering than selling.",
  },
] as const;

const FAQS = [
  {
    question: "What types of inventory can I list?",
    answer:
      "Any surplus, overstock, discontinued, or closeout flooring inventory across six material categories: hardwood, engineered wood, laminate, vinyl/LVP, bamboo, and tile. Supported conditions include new overstock, discontinued lines, closeouts, factory seconds, remnants, customer returns, and slightly damaged inventory — as long as condition is accurately described and documented with photos.",
  },
  {
    question: "How does business verification work?",
    answer:
      "When you register, you submit your business name, EIN, company details, and supporting documentation. Our team reviews your application — including AI-assisted document and website analysis — and typically completes verification within 1-3 business days. Verified status appears on your listings and increases buyer confidence.",
  },
  {
    question: "Can I set a minimum lot size or split lots?",
    answer:
      "Yes. When creating a listing, you specify whether the lot must be sold as a whole or if you are willing to split. You can set a minimum order quantity. Buyers see these terms on the listing before making an offer.",
  },
  {
    question: "When do I get paid?",
    answer:
      "Once the carrier picks up your shipment, payment releases automatically from escrow to your connected Stripe account. Funds are typically available in your bank within 3-5 business days of pickup. Your seller dashboard shows real-time payout status.",
  },
  {
    question: "What if a buyer disputes the order?",
    answer:
      "Buyers have 48 hours after delivery to open a dispute, supported by photo evidence and delivery receipt notes. Our support team mediates. Freight damage must be noted on the Bill of Lading at time of delivery. If no dispute is filed within 5 business days of delivery, the transaction closes automatically and funds are confirmed.",
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
      {/* ── Section 1: Hero — The Depreciation Clock ── */}
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
              {/* Hero image */}
              <div className="hidden lg:block relative h-[480px] rounded-2xl overflow-hidden shadow-elevation-lg order-last lg:order-first">
                <Image
                  src="https://images.unsplash.com/photo-1681752972950-6229ca099fbc?w=800&q=80&fit=crop"
                  alt="Stacked wooden flooring planks in warehouse ready for liquidation"
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent" aria-hidden="true" />
              </div>

              <div className="text-center lg:text-left">
                <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
                  B2B Flooring Liquidation
                </Badge>
                <h1 className="font-display text-4xl tracking-tight sm:text-5xl md:text-6xl">
                  Your Closeout Inventory Is{" "}
                  <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    Losing Value Right Now.
                  </span>
                </h1>
                <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto lg:mx-0">
                  Every week surplus flooring sits in a warehouse, carrying costs eat margin and the product moves closer to obsolete. PlankMarket is the fastest path from excess inventory to verified buyer — before the recovery window closes.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                  <Link href="/register?role=seller">
                    <Button
                      size="xl"
                      variant="gold"
                    >
                      List Your Surplus Inventory
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
                    <span>Verified buyers only</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-elevation-sm">
                    <CreditCard className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                    <span>Stripe escrow — funds held until pickup</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm rounded-full px-5 py-2.5 shadow-elevation-sm">
                    <Zap className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                    <span>2% fee only on completed sales</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: Problem Agitation — The Cost of Inaction ── */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-4">
            <Badge className="mb-4 border-transparent bg-red-50 text-red-700">
              <Timer className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              The Depreciation Clock
            </Badge>
          </div>
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl sm:text-4xl max-w-3xl mx-auto">
              Every day that surplus sits in your warehouse,{" "}
              <span className="text-primary">the recovery shrinks.</span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Carrying costs do not pause. Depreciation does not wait. The flooring market moves on. Here is what inaction actually costs.
            </p>
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

          {/* Bridge to solution */}
          <div className="max-w-2xl mx-auto mt-12 text-center">
            <p className="text-muted-foreground text-lg leading-relaxed">
              The longer surplus sits, the less you recover. The question is not <em>whether</em> to liquidate — it is <em>how fast</em> you can get it in front of the right buyers.
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 3: Solution — PlankMarket as the Fastest Path ── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <Badge variant="outline" className="mb-4 border-secondary text-secondary">
              The Fastest Path to Verified Buyer
            </Badge>
            <h2 className="font-display text-3xl sm:text-4xl">
              PlankMarket was built to stop the depreciation clock.
            </h2>
            <p className="mt-4 text-xl text-muted-foreground leading-relaxed">
              A dedicated liquidation channel that connects your surplus inventory to verified flooring buyers who are actively looking for it. No brokers. No middlemen. No wasted time.
            </p>
          </div>

          {/* Warehouse/inventory photo */}
          <div className="relative max-w-4xl mx-auto mb-16 h-56 rounded-2xl overflow-hidden shadow-elevation-md">
            <Image
              src="https://images.unsplash.com/photo-1422246654994-34520d5a0340?w=1200&q=80&fit=crop"
              alt="Stacked wood planks in a warehouse representing surplus flooring inventory"
              fill
              className="object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-secondary/40 to-transparent" aria-hidden="true" />
            <div className="absolute inset-0 flex items-center px-10 relative z-10">
              <p className="text-white font-display text-2xl max-w-sm drop-shadow-lg">
                Turn warehouse dead weight into working capital. In days, not months.
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
              From surplus to sold in four steps.
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-xl mx-auto">
              No onboarding calls. No account managers. Register, list, sell, get paid.
            </p>
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
                Create Your Seller Account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              Free to register. No listing fees. No monthly costs.
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 5: Features ── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="font-display text-3xl sm:text-4xl max-w-2xl mx-auto">
              Built for the way flooring professionals actually liquidate inventory.
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-xl mx-auto">
              Not a generic marketplace with flooring bolted on. Every feature was designed around how this industry moves surplus.
            </p>
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

      {/* ── Section 6: Social Proof + Stats ── */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="font-display text-3xl sm:text-4xl">
              Sellers who stopped paying to store inventory that was not selling.
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
              2% on completed sales. Zero on everything else.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              No listing fees. No monthly subscription. No setup costs. You pay 2% when inventory sells. If it does not sell, you pay nothing.
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
                <CardTitle className="font-display text-xl">$12,000 lot of engineered hickory</CardTitle>
                <CardDescription>
                  The 2% seller fee covers access to the verified buyer network, payment processing, buyer verification, dispute mediation, messaging tools, and platform support. You pay nothing to list. Nothing monthly. Nothing on inventory that does not sell.
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
                    <span className="text-sm text-muted-foreground">Seller fee (2%)</span>
                    <span className="text-sm text-muted-foreground">-$240</span>
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
                    Buyer pays listed price + 3% buyer fee. Your payout transfers to your Stripe Connect account within 3-5 business days of carrier pickup.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Comparison + No hidden fees */}
            <div className="space-y-6">
              {/* Alternatives */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-display text-base">Compare that to the alternatives</CardTitle>
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
                  <CardTitle className="font-display text-base text-secondary">No hidden fees. Period.</CardTitle>
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
                    Moving large inventories or liquidating on a recurring schedule? High-volume sellers may qualify for reduced commission rates. Contact our partnerships team at{" "}
                    <a
                      href="mailto:partnerships@plankmarket.com"
                      className="text-primary underline-offset-2 hover:underline font-medium"
                    >
                      partnerships@plankmarket.com
                    </a>{" "}
                    to discuss custom pricing and CSV bulk upload access.
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

      {/* ── Section 9: Final CTA — The Clock Is Running ── */}
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
                The margin on that surplus is shrinking.
                <br />
                <span className="text-white/90">Every day it sits, it shrinks more.</span>
              </h2>
              <p className="text-white/80 mb-4 max-w-2xl mx-auto text-lg leading-relaxed">
                That discontinued engineered hardwood in bay 7. The LVP closeout on pallets in the back. The overstock oak that has been there since last quarter. It is all losing value while it waits.
              </p>
              <p className="text-white/80 mb-10 max-w-xl mx-auto text-lg leading-relaxed">
                List it today. Get it in front of verified buyers across all 50 states. Stop the clock.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/register?role=seller">
                  <Button
                    size="xl"
                    variant="gold"
                  >
                    Create Your Seller Account
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <p className="mt-6 text-white/60 text-sm">
                No listing fees. No monthly cost. 2% only when inventory sells.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
