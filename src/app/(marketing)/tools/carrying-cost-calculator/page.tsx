import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { CarryingCostCalculator } from "@/components/marketing/carrying-cost-calculator";

export const metadata: Metadata = {
  title: "Inventory Carrying Cost Calculator | PlankMarket",
  description:
    "Calculate the true cost of holding surplus flooring inventory. See warehouse, insurance, depreciation, and opportunity costs vs. selling at liquidation prices today.",
  openGraph: {
    title: "How Much Is Your Surplus Flooring Costing You Each Month?",
    description:
      "Free calculator: see storage, insurance, depreciation, and capital costs for holding surplus flooring inventory. Compare holding vs. selling today.",
    type: "website",
  },
};

export default function CarryingCostCalculatorPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="py-16 md:py-20 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <Badge className="mb-4 border-transparent bg-amber-100 text-amber-800">
              Free Tool
            </Badge>
            <h1 className="font-display text-3xl tracking-tight sm:text-4xl md:text-5xl">
              Inventory Carrying Cost{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Calculator
              </span>
            </h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Every month surplus flooring sits in a warehouse, carrying costs
              eat into your recovery. Plug in your numbers to see how much
              holding is actually costing you — and what you would recover by
              selling today.
            </p>
          </div>
        </div>
      </section>

      {/* ── Calculator ── */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <CarryingCostCalculator />
        </div>
      </section>

      {/* ── Context / Education ── */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto space-y-8">
            <h2 className="font-display text-2xl sm:text-3xl text-center">
              What goes into carrying costs?
            </h2>
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-display text-lg text-foreground mb-2">
                  Warehouse storage
                </h3>
                <p>
                  Rack space, climate control, property tax allocation, and
                  utilities. Industry averages range from $0.50 to $1.25 per
                  square foot per month depending on location and facility type.
                </p>
              </div>
              <div>
                <h3 className="font-display text-lg text-foreground mb-2">
                  Insurance
                </h3>
                <p>
                  Inventory insurance typically runs 0.3% to 0.8% of inventory
                  value per month. The more product sitting in your warehouse,
                  the higher the premium.
                </p>
              </div>
              <div>
                <h3 className="font-display text-lg text-foreground mb-2">
                  Depreciation
                </h3>
                <p>
                  Flooring products lose value over time as styles change,
                  manufacturers discontinue lines, and market conditions shift.
                  Closeout inventory depreciates faster than active product
                  lines.
                </p>
              </div>
              <div>
                <h3 className="font-display text-lg text-foreground mb-2">
                  Cost of capital
                </h3>
                <p>
                  Capital tied up in surplus inventory is capital you cannot
                  deploy. Whether it is loan interest, lost investment returns,
                  or delayed business spending, the opportunity cost is real and
                  compounds monthly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="rounded-3xl bg-gradient-to-br from-primary to-secondary p-12 text-white relative overflow-hidden">
            <div
              aria-hidden="true"
              className="absolute top-0 right-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl"
            />
            <div className="text-center relative z-10">
              <h2 className="font-display text-3xl sm:text-4xl mb-4">
                Stop paying to store inventory that is not working for you.
              </h2>
              <p className="text-white/80 mb-8 max-w-xl mx-auto text-lg leading-relaxed">
                List your surplus on PlankMarket and get it in front of verified
                buyers nationwide. 2% fee only when you sell. No listing costs.
              </p>
              <Link href="/register?role=seller">
                <Button size="xl" variant="gold">
                  List Your Surplus Inventory
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
