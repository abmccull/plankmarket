"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

function parseNum(val: string): number {
  const n = parseFloat(val.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

export function CarryingCostCalculatorCompact() {
  const [inventoryValue, setInventoryValue] = useState("200,000");
  const [months, setMonths] = useState(12);
  const [discount, setDiscount] = useState("25");

  const value = parseNum(inventoryValue);
  const discountPct = parseNum(discount);

  // Simplified calculation using defaults for compact version
  const warehouseCost = 0; // No sqft input in compact
  const insuranceRate = 0.5;
  const capitalRate = 12;
  const depreciationRate = 4;

  const monthlyInsurance = value * (insuranceRate / 100);
  const monthlyDepreciation = value * (depreciationRate / 100);
  const monthlyCapitalCost = value * (capitalRate / 100 / 12);
  const totalMonthly = warehouseCost + monthlyInsurance + monthlyDepreciation + monthlyCapitalCost;

  const cumulativeCost = totalMonthly * months;
  const sellTodayRecovery = value * (1 - discountPct / 100);

  const hasValue = value > 0;

  return (
    <Card className="border-destructive/20 bg-card">
      <CardContent className="pt-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="compact-value" className="text-sm">
              Inventory value
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="compact-value"
                type="text"
                inputMode="numeric"
                placeholder="200,000"
                value={inventoryValue}
                onChange={(e) => setInventoryValue(e.target.value)}
                className="pl-7"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Months holding</Label>
              <span className="text-xs font-semibold tabular-nums text-primary">{months}mo</span>
            </div>
            <Slider
              value={[months]}
              onValueChange={([v]) => setMonths(v)}
              min={1}
              max={24}
              step={1}
              className="mt-3"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="compact-discount" className="text-sm">
              Liquidation discount
            </Label>
            <div className="relative">
              <Input
                id="compact-discount"
                type="text"
                inputMode="numeric"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="pr-7"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
            </div>
          </div>
        </div>

        {hasValue ? (
          <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">
                Holding {months} {months === 1 ? "month" : "months"} costs you{" "}
                <strong className="text-destructive tabular-nums">
                  {formatCurrency(cumulativeCost)}
                </strong>{" "}
                in carrying costs alone. Sell today and recover{" "}
                <strong className="text-secondary tabular-nums">
                  {formatCurrency(sellTodayRecovery)}
                </strong>.
              </p>
            </div>
            <Link
              href="/tools/carrying-cost-calculator"
              className="shrink-0 inline-flex items-center text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              See full breakdown
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">
            Enter your inventory value to see how much holding costs you.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
