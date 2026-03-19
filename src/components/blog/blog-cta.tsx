import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const CTA_CONFIG = {
  Sellers: {
    heading: "Ready to move surplus inventory?",
    description:
      "List your closeout flooring on PlankMarket and reach verified buyers across the country.",
    href: "/for-sellers",
    label: "Start Selling",
  },
  Buyers: {
    heading: "Find closeout flooring deals",
    description:
      "Browse verified closeout lots from distributors and manufacturers. New inventory added daily.",
    href: "/listings",
    label: "Browse Listings",
  },
  Both: {
    heading: "Join the B2B flooring marketplace",
    description:
      "PlankMarket connects flooring professionals to move surplus inventory faster, with transparent pricing and verified transactions.",
    href: "/register",
    label: "Get Started Free",
  },
};

export function BlogCta({ audience }: { audience: "Sellers" | "Buyers" | "Both" }) {
  const config = CTA_CONFIG[audience];

  return (
    <section className="rounded-2xl bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/10 border border-border p-8 md:p-12 text-center">
      <h2 className="font-display text-2xl sm:text-3xl mb-3">
        {config.heading}
      </h2>
      <p className="text-muted-foreground max-w-lg mx-auto mb-6">
        {config.description}
      </p>
      <Link href={config.href}>
        <Button size="lg" className="gap-2">
          {config.label}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </section>
  );
}
