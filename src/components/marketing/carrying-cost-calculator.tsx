"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Warehouse,
  Shield,
  TrendingDown,
  DollarSign,
  Calculator,
  ArrowRight,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface CalculatorInputs {
  inventoryValue: string;
  sqft: string;
  warehouseCostPerSqFt: string;
  insuranceRate: string;
  capitalRate: string;
  depreciationRate: string;
  months: number;
  liquidationDiscount: string;
}

function parseNum(val: string): number {
  const n = parseFloat(val.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function calculate(inputs: CalculatorInputs) {
  const value = parseNum(inputs.inventoryValue);
  const sqft = parseNum(inputs.sqft);
  const warehouseRate = parseNum(inputs.warehouseCostPerSqFt);
  const insuranceRate = parseNum(inputs.insuranceRate);
  const capitalRate = parseNum(inputs.capitalRate);
  const depreciationRate = parseNum(inputs.depreciationRate);
  const months = inputs.months;
  const discount = parseNum(inputs.liquidationDiscount);

  const monthlyStorage = sqft * warehouseRate;
  const monthlyInsurance = value * (insuranceRate / 100);
  const monthlyDepreciation = value * (depreciationRate / 100);
  const monthlyCapitalCost = value * (capitalRate / 100 / 12);
  const totalMonthly =
    monthlyStorage + monthlyInsurance + monthlyDepreciation + monthlyCapitalCost;

  const cumulativeCost = totalMonthly * months;
  const sellTodayRecovery = value * (1 - discount / 100);
  const holdThenSellRecovery = sellTodayRecovery - cumulativeCost;
  const costOfWaiting = cumulativeCost;

  const breakEvenMonths =
    totalMonthly > 0
      ? Math.ceil((value * (discount / 100)) / totalMonthly)
      : Infinity;

  return {
    monthlyStorage,
    monthlyInsurance,
    monthlyDepreciation,
    monthlyCapitalCost,
    totalMonthly,
    cumulativeCost,
    sellTodayRecovery,
    holdThenSellRecovery,
    costOfWaiting,
    breakEvenMonths,
  };
}

export function CarryingCostCalculator() {
  const [inputs, setInputs] = useState<CalculatorInputs>({
    inventoryValue: "",
    sqft: "",
    warehouseCostPerSqFt: "0.75",
    insuranceRate: "0.5",
    capitalRate: "8",
    depreciationRate: "1.5",
    months: 6,
    liquidationDiscount: "40",
  });

  const update = (field: keyof CalculatorInputs, value: string | number) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
  };

  const results = calculate(inputs);
  const hasValue = parseNum(inputs.inventoryValue) > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Inputs */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" aria-hidden="true" />
            Your Inventory Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Primary inputs */}
          <div className="space-y-1.5">
            <Label htmlFor="calc-value">Inventory value (at cost)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="calc-value"
                type="text"
                inputMode="numeric"
                placeholder="200,000"
                value={inputs.inventoryValue}
                onChange={(e) => update("inventoryValue", e.target.value)}
                className="pl-7"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="calc-sqft">Square footage of inventory</Label>
            <Input
              id="calc-sqft"
              type="text"
              inputMode="numeric"
              placeholder="5,000"
              value={inputs.sqft}
              onChange={(e) => update("sqft", e.target.value)}
            />
          </div>

          <Separator />

          {/* Months slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Months holding</Label>
              <span className="text-sm font-semibold tabular-nums text-primary">
                {inputs.months} {inputs.months === 1 ? "month" : "months"}
              </span>
            </div>
            <Slider
              value={[inputs.months]}
              onValueChange={([v]) => update("months", v)}
              min={1}
              max={24}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 mo</span>
              <span>12 mo</span>
              <span>24 mo</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="calc-discount">Liquidation discount (%)</Label>
            <div className="relative">
              <Input
                id="calc-discount"
                type="text"
                inputMode="numeric"
                value={inputs.liquidationDiscount}
                onChange={(e) => update("liquidationDiscount", e.target.value)}
                className="pr-7"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Typical closeout discount off original cost
            </p>
          </div>

          <Separator />

          {/* Advanced inputs */}
          <details className="group">
            <summary className="text-sm font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors">
              Advanced cost assumptions
              <span className="ml-1 text-xs group-open:hidden">▸</span>
              <span className="ml-1 text-xs hidden group-open:inline">▾</span>
            </summary>
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="calc-warehouse">Warehouse cost ($/sq ft/month)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    id="calc-warehouse"
                    type="text"
                    inputMode="decimal"
                    value={inputs.warehouseCostPerSqFt}
                    onChange={(e) => update("warehouseCostPerSqFt", e.target.value)}
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="calc-insurance">Insurance rate (monthly %)</Label>
                <div className="relative">
                  <Input
                    id="calc-insurance"
                    type="text"
                    inputMode="decimal"
                    value={inputs.insuranceRate}
                    onChange={(e) => update("insuranceRate", e.target.value)}
                    className="pr-7"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="calc-capital">Cost of capital (annual %)</Label>
                <div className="relative">
                  <Input
                    id="calc-capital"
                    type="text"
                    inputMode="decimal"
                    value={inputs.capitalRate}
                    onChange={(e) => update("capitalRate", e.target.value)}
                    className="pr-7"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="calc-depreciation">Depreciation rate (monthly %)</Label>
                <div className="relative">
                  <Input
                    id="calc-depreciation"
                    type="text"
                    inputMode="decimal"
                    value={inputs.depreciationRate}
                    onChange={(e) => update("depreciationRate", e.target.value)}
                    className="pr-7"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="space-y-6">
        {/* Monthly breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg">
              Monthly Carrying Cost
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasValue ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Warehouse className="h-4 w-4" aria-hidden="true" />
                    Storage
                  </span>
                  <span className="tabular-nums">{formatCurrency(results.monthlyStorage)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Shield className="h-4 w-4" aria-hidden="true" />
                    Insurance
                  </span>
                  <span className="tabular-nums">{formatCurrency(results.monthlyInsurance)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <TrendingDown className="h-4 w-4" aria-hidden="true" />
                    Depreciation
                  </span>
                  <span className="tabular-nums">{formatCurrency(results.monthlyDepreciation)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign className="h-4 w-4" aria-hidden="true" />
                    Cost of capital
                  </span>
                  <span className="tabular-nums">{formatCurrency(results.monthlyCapitalCost)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between font-semibold">
                  <span>Total monthly burn</span>
                  <span className="text-lg tabular-nums text-destructive">
                    {formatCurrency(results.totalMonthly)}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Enter your inventory value to see the breakdown.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recovery comparison */}
        {hasValue && (
          <Card className="border-destructive/20">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-lg">
                Recovery Comparison
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Sell today */}
              <div className="rounded-lg border border-secondary/30 bg-secondary/5 p-4">
                <div className="text-sm font-medium text-secondary mb-1">
                  Sell today at {inputs.liquidationDiscount}% off
                </div>
                <div className="text-2xl font-bold tabular-nums">
                  {formatCurrency(results.sellTodayRecovery)}
                </div>
              </div>

              {/* Hold then sell */}
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <div className="text-sm font-medium text-destructive mb-1">
                  Hold {inputs.months} {inputs.months === 1 ? "month" : "months"}, then sell at {inputs.liquidationDiscount}% off
                </div>
                <div className="text-2xl font-bold tabular-nums">
                  {formatCurrency(results.holdThenSellRecovery)}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  After {formatCurrency(results.cumulativeCost)} in carrying costs
                </div>
              </div>

              {/* Delta */}
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-center">
                <div className="text-sm font-medium text-destructive mb-1">
                  Holding costs you
                </div>
                <div className="text-3xl font-bold tabular-nums text-destructive">
                  {formatCurrency(results.costOfWaiting)}
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  over {inputs.months} {inputs.months === 1 ? "month" : "months"}
                </div>
              </div>

              {/* Break-even insight */}
              {results.breakEvenMonths < Infinity && results.breakEvenMonths > 0 && (
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                  After <strong>{results.breakEvenMonths} months</strong>, your
                  carrying costs exceed what you would lose on the{" "}
                  {inputs.liquidationDiscount}% discount. Every month past that
                  point, you are paying more to hold than the discount costs you.
                </p>
              )}

              {/* CTA */}
              <div className="pt-2">
                <Link href="/register?role=seller">
                  <Button variant="gold" size="lg" className="w-full">
                    List Your Surplus Inventory
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Free to list. 2% fee only when you sell.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
