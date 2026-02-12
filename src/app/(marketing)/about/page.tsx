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
} from "lucide-react";

export const metadata: Metadata = {
  title: "About Us",
};

export default function AboutPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-20">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
              Our Mission
            </Badge>
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Reducing Waste in the{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Flooring Industry
              </span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              PlankMarket creates a transparent, efficient marketplace that makes it easy to buy and sell surplus flooring materials — reducing waste while helping businesses recover value from excess inventory.
            </p>
          </div>
        </div>
      </section>

      {/* The Problem */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
            <div>
              <Badge variant="outline" className="mb-4">The Problem</Badge>
              <h2 className="font-display text-3xl font-bold mb-4">
                Billions in Wasted Inventory
              </h2>
              <p className="text-muted-foreground mb-4">
                Every year, billions of dollars in flooring inventory sits unused in warehouses across the country. Overstock from builders, discontinued product lines, slight seconds, and closeout materials all represent perfectly usable flooring that deserves a second chance.
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
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Industry Waste", value: "$B+", subtitle: "Surplus inventory annually" },
                { label: "Limited Options", value: "3", subtitle: "Liquidate, donate, or dispose" },
                { label: "Fragmented", value: "0", subtitle: "Centralized B2B platforms before us" },
                { label: "Lost Revenue", value: "80%+", subtitle: "Value lost on surplus materials" },
              ].map((stat) => (
                <Card key={stat.label} className="text-center">
                  <CardHeader className="pb-2">
                    <div className="font-display text-2xl font-bold text-primary">{stat.value}</div>
                    <CardTitle className="text-sm">{stat.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Our Solution */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-bold">Our Solution</h2>
            <p className="mt-3 text-muted-foreground">
              A purpose-built B2B marketplace for surplus and closeout flooring
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-16 items-start max-w-5xl mx-auto">
            <div>
              <Badge variant="outline" className="mb-4">For Sellers</Badge>
              <h3 className="font-display text-xl font-bold mb-4">
                Reach Buyers Nationwide
              </h3>
              <ul className="space-y-3">
                {[
                  { icon: Users, text: "Nationwide platform reaching thousands of qualified buyers" },
                  { icon: Zap, text: "Simple listing tools with photos and detailed specs" },
                  { icon: CreditCard, text: "Secure payment processing with Stripe escrow" },
                  { icon: MessageSquare, text: "Built-in messaging and order management" },
                  { icon: DollarSign, text: "Fast, reliable payouts after successful delivery" },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center shrink-0">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm text-muted-foreground mt-1">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Badge variant="outline" className="mb-4">For Buyers</Badge>
              <h3 className="font-display text-xl font-bold mb-4">
                Source Materials Below Cost
              </h3>
              <ul className="space-y-3">
                {[
                  { icon: Search, text: "Searchable database across all major material types" },
                  { icon: Eye, text: "Advanced filters by material, color, finish, lot size, location" },
                  { icon: DollarSign, text: "Transparent pricing with no hidden fees" },
                  { icon: Shield, text: "Verified sellers you can trust" },
                  { icon: CreditCard, text: "Secure transactions with buyer protection" },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center shrink-0">
                      <item.icon className="h-4 w-4 text-secondary" />
                    </div>
                    <span className="text-sm text-muted-foreground mt-1">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Sustainability */}
      <section className="relative py-16 bg-gradient-to-br from-primary to-secondary text-primary-foreground overflow-hidden">
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-bold">Sustainability & Impact</h2>
            <p className="mt-3 text-white/80">
              Every transaction represents materials saved from waste
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { icon: Recycle, title: "Divert from Landfills", description: "Redirect usable materials from disposal" },
              { icon: TrendingDown, title: "Reduce Production", description: "Lower demand for new manufacturing" },
              { icon: Leaf, title: "Cut Emissions", description: "Reduce carbon from manufacturing and disposal" },
              { icon: Heart, title: "Extend Lifecycles", description: "Give quality materials a second life" },
            ].map((item) => (
              <div key={item.title} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold mb-1">{item.title}</h3>
                <p className="text-sm text-white/70">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who We Serve */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-bold">Who We Serve</h2>
            <p className="mt-3 text-muted-foreground">
              Designed for flooring professionals across the supply chain
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: HardHat,
                title: "Builders & Contractors",
                description: "Source affordable materials for projects or liquidate surplus from completed jobs",
              },
              {
                icon: Warehouse,
                title: "Distributors & Wholesalers",
                description: "Clear out discontinued inventory and overstock efficiently",
              },
              {
                icon: Store,
                title: "Retailers & Showrooms",
                description: "Sell floor models, samples, and previous season inventory",
              },
              {
                icon: Building,
                title: "Manufacturers",
                description: "Move closeout inventory and slight seconds to qualified buyers",
              },
              {
                icon: Paintbrush,
                title: "Property Managers",
                description: "Find affordable materials for renovations and repairs",
              },
              {
                icon: Hammer,
                title: "Flooring Installers",
                description: "Source materials for clients or sell leftover inventory from jobs",
              },
            ].map((item) => (
              <Card key={item.title} className="card-hover-lift">
                <CardHeader>
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-2">
                    <item.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="font-display text-lg">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-bold">Our Values</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-4xl mx-auto">
            {[
              { icon: Eye, title: "Transparency", description: "Clear pricing and honest policies" },
              { icon: Shield, title: "Security", description: "Verified sellers and escrow protection" },
              { icon: Zap, title: "Efficiency", description: "Simple tools that save time" },
              { icon: Leaf, title: "Sustainability", description: "Circular economy in flooring" },
              { icon: Heart, title: "Support", description: "Responsive customer service" },
            ].map((item) => (
              <Card key={item.title} className="card-hover-lift text-center">
                <CardHeader className="items-center">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-1">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-sm font-semibold">{item.title}</CardTitle>
                  <CardDescription className="text-xs">{item.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="rounded-3xl bg-gradient-to-br from-primary to-secondary p-12 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
            <div className="text-center relative z-10">
              <h2 className="font-display text-3xl font-bold mb-4">
                Join the Marketplace
              </h2>
              <p className="text-white/80 mb-8 max-w-xl mx-auto">
                Whether you have surplus flooring to sell or are looking for affordable materials, PlankMarket is here to help. Together, we can make the flooring industry more sustainable.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/register?role=seller">
                  <Button
                    size="xl"
                    className="bg-gradient-to-b from-amber-400 to-amber-500 text-amber-950 shadow-md hover:shadow-lg hover:brightness-110"
                  >
                    Start Selling <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/register?role=buyer">
                  <Button
                    size="xl"
                    variant="secondary"
                    className="bg-white/20 text-white border-white/30 hover:bg-white/30"
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
