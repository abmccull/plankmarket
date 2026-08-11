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
import {
  ArrowRight,
  Store,
  Warehouse,
  HardHat,
  Building,
  Paintbrush,
  Hammer,
  Leaf,
  Recycle,
  TrendingDown,
  Eye,
  Shield,
  Zap,
  Heart,
  Users,
  Search,
  CreditCard,
  MessageSquare,
  DollarSign,
  Package,
  Globe,
} from "lucide-react";

export const metadata: Metadata = {
  title: "About Us - Our Mission to Reduce Flooring Waste",
  description:
    "Learn about PlankMarket's mission to create a transparent, efficient B2B marketplace for surplus flooring materials, reducing waste while helping businesses recover value.",
  openGraph: {
    title: "About PlankMarket",
    description:
      "Reducing waste in the flooring industry by connecting buyers and sellers of surplus materials.",
  },
};

export const revalidate = 3600;

const PROBLEM_CARDS = [
  {
    icon: TrendingDown,
    label: "Fragmented",
    subtitle: "Liquidation Channels",
    description:
      "Surplus flooring still moves through a mix of calls, broker relationships, and ad hoc liquidation paths.",
  },
  {
    icon: Package,
    label: "Limited",
    subtitle: "Recovery Options",
    description:
      "Sellers often choose between discounting harder, holding inventory longer, using brokers, or disposing of material.",
  },
  {
    icon: Globe,
    label: "Rare",
    subtitle: "Purpose-Built Workflows",
    description:
      "Specialized flooring resale workflows exist, but the market is still fragmented and inconsistent for buyers and sellers.",
  },
  {
    icon: TrendingDown,
    label: "Time",
    subtitle: "Erodes Value",
    description:
      "The longer closeout inventory sits, the harder it is to recover value and reclaim warehouse capacity.",
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-20">
        <div className="absolute top-20 left-10 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute bottom-10 right-10 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />

        <div className="container relative z-10 mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
              Our Mission
            </Badge>
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
              Reducing Waste in the{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Flooring Industry
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              PlankMarket creates a transparent, efficient marketplace that
              makes it easier to buy and sell surplus flooring materials -
              reducing waste while helping businesses recover value from excess
              inventory.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto grid max-w-5xl items-center gap-12 md:grid-cols-2">
            <div>
              <Badge variant="outline" className="mb-4">
                The Problem
              </Badge>
              <h2 className="mb-4 font-display text-3xl">
                Surplus Inventory Still Moves Through Fragmented Channels
              </h2>
              <p className="mb-4 text-muted-foreground">
                Overstock from builders, discontinued product lines, slight
                seconds, and closeout materials all represent usable flooring
                that often sits longer than it should. The category still leans
                on manual liquidation paths that make recovery slower and less
                predictable than it needs to be.
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {[
                  "Builders over-order materials for large projects",
                  "Manufacturers discontinue product lines",
                  "Retailers clear showroom samples and old inventory",
                  "Production runs create cosmetically imperfect but sound materials",
                  "Project cancellations leave contractors with unreturnable stock",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {PROBLEM_CARDS.map((stat) => (
                <Card key={stat.label} className="text-center">
                  <CardHeader className="pb-2">
                    <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-secondary/10">
                      <stat.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="font-display text-2xl text-primary">
                      {stat.label}
                    </div>
                    <CardTitle className="text-sm">{stat.subtitle}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground">
                      {stat.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/30 py-20">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl">Our Solution</h2>
            <p className="mt-3 text-muted-foreground">
              A purpose-built B2B marketplace for surplus and closeout flooring
            </p>
          </div>
          <div className="mx-auto grid max-w-5xl items-start gap-16 md:grid-cols-2">
            <div>
              <Badge variant="outline" className="mb-4">
                For Sellers
              </Badge>
              <h3 className="mb-4 font-display text-xl">
                Reach Qualified Buyers
              </h3>
              <ul className="space-y-3">
                {[
                  { icon: Users, text: "Business marketplace built for qualified buyers and sellers" },
                  { icon: Zap, text: "Simple listing tools with photos and detailed specs" },
                  {
                    icon: CreditCard,
                    text: "Stripe-processed payments with seller transfer after carrier pickup",
                  },
                  {
                    icon: MessageSquare,
                    text: "Built-in messaging and order management",
                  },
                  {
                    icon: DollarSign,
                    text: "Projected seller transfer shown before acceptance",
                  },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-secondary/10">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="mt-1 text-sm text-muted-foreground">
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Badge variant="outline" className="mb-4">
                For Buyers
              </Badge>
              <h3 className="mb-4 font-display text-xl">
                Source Surplus Materials with More Clarity
              </h3>
              <ul className="space-y-3">
                {[
                  {
                    icon: Search,
                    text: "Searchable database across major material types",
                  },
                  {
                    icon: Eye,
                    text: "Advanced filters by material, color, finish, lot size, and location",
                  },
                  {
                    icon: DollarSign,
                    text: "Transparent pricing with no hidden inventory fees",
                  },
                  {
                    icon: Shield,
                    text: "Seller verification status shown on each listing",
                  },
                  {
                    icon: CreditCard,
                    text: "Stripe-processed payments with tracked shipping and dispute reporting",
                  },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-secondary/10">
                      <item.icon className="h-4 w-4 text-secondary" />
                    </div>
                    <span className="mt-1 text-sm text-muted-foreground">
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-gradient-to-br from-primary to-secondary py-16 text-primary-foreground">
        <Image
          src="https://images.unsplash.com/photo-1688127145963-1063f22622a5?w=1400&q=80&fit=crop"
          alt=""
          fill
          className="object-cover opacity-[0.08] mix-blend-overlay"
          aria-hidden="true"
          loading="lazy"
        />
        <div className="container relative z-10 mx-auto px-4">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl">Sustainability & Impact</h2>
            <p className="mt-3 text-white/80">
              Every transaction represents materials saved from waste
            </p>
          </div>
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Recycle,
                title: "Divert from Landfills",
                description: "Redirect usable materials from disposal",
              },
              {
                icon: TrendingDown,
                title: "Reduce Production",
                description: "Lower demand for new manufacturing",
              },
              {
                icon: Leaf,
                title: "Cut Emissions",
                description:
                  "Reduce carbon from manufacturing and disposal",
              },
              {
                icon: Heart,
                title: "Extend Lifecycles",
                description: "Give quality materials a second life",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl bg-white/10 p-6 text-center backdrop-blur-sm"
              >
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-1 font-semibold">{item.title}</h3>
                <p className="text-sm text-white/70">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl">Who We Serve</h2>
            <p className="mt-3 text-muted-foreground">
              Designed for flooring professionals across the supply chain
            </p>
          </div>
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: HardHat,
                title: "Builders & Contractors",
                description:
                  "Source affordable materials for projects or liquidate surplus from completed jobs",
              },
              {
                icon: Warehouse,
                title: "Distributors & Wholesalers",
                description:
                  "Clear out discontinued inventory and overstock efficiently",
              },
              {
                icon: Store,
                title: "Retailers & Showrooms",
                description:
                  "Sell floor models, samples, and previous season inventory",
              },
              {
                icon: Building,
                title: "Manufacturers",
                description:
                  "Move closeout inventory and slight seconds to qualified buyers",
              },
              {
                icon: Paintbrush,
                title: "Property Managers",
                description:
                  "Find affordable materials for renovations and repairs",
              },
              {
                icon: Hammer,
                title: "Flooring Installers",
                description:
                  "Source materials for clients or sell leftover inventory from jobs",
              },
            ].map((item) => (
              <Card key={item.title} className="card-hover-lift">
                <CardHeader>
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-secondary/20">
                    <item.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="font-display text-lg">
                    {item.title}
                  </CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/30 py-20">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl">Our Values</h2>
          </div>
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-5">
            {[
              {
                icon: Eye,
                title: "Transparency",
                description: "Clear pricing and honest policies",
              },
              {
                icon: Shield,
                title: "Security",
                description:
                  "Visible verification, tracked shipping, and dispute reporting",
              },
              {
                icon: Zap,
                title: "Efficiency",
                description: "Simple tools that save time",
              },
              {
                icon: Leaf,
                title: "Sustainability",
                description: "Circular economy in flooring",
              },
              {
                icon: Heart,
                title: "Support",
                description: "Order-linked support and dispute records",
              },
            ].map((item) => (
              <Card key={item.title} className="card-hover-lift text-center">
                <CardHeader className="items-center">
                  <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-secondary/20">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-sm font-semibold">
                    {item.title}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {item.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-secondary p-12 text-white">
            <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
            <div className="relative z-10 text-center">
              <h2 className="mb-4 font-display text-3xl">Join the Marketplace</h2>
              <p className="mx-auto mb-8 max-w-xl text-white/80">
                Whether you have surplus flooring to sell or are looking for
                affordable materials, PlankMarket is here to help. Together, we
                can make the flooring industry more sustainable.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link href="/register?role=seller">
                  <Button size="xl" variant="gold">
                    Start Selling <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/register?role=buyer">
                  <Button
                    size="xl"
                    variant="secondary"
                    className="border-2 border-white/70 bg-white/10 text-white hover:bg-white/20"
                  >
                    Browse Listings
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
