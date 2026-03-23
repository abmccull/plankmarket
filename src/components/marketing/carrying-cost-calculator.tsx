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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Clock,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const INVENTORY_TYPES = [
  { value: "overstock", label: "Overstock (current product)", rate: "2", description: "Still in production, just excess quantity. Loses ~1.5-3% per month from carrying costs and market pressure." },
  { value: "slow-moving", label: "Slow-moving", rate: "4", description: "Current but low velocity signals buyer hesitation. Typically 60-80 cents on the dollar by 6 months." },
  { value: "end-of-line", label: "End of line", rate: "5", description: "Manufacturer phasing out. Loses pricing floor and matching availability. Initial demand spike, then sharp drop." },
  { value: "discontinued", label: "Discontinued", rate: "6.5", description: "Out of production, buyer pool shrinking fast. Industry E&O reserves hit 75-90% by 12 months." },
  { value: "damaged-seconds", label: "Damaged / seconds", rate: "1.5", description: "Enter the already-discounted value above (typically 35-65% off first quality). Minimal further decay after grading." },
  { value: "seasonal", label: "Seasonal / trend-sensitive", rate: "6", description: "Style-driven products lose appeal as trends shift. 30-50% value loss within one trend cycle." },
  { value: "custom", label: "Custom rate", rate: "", description: "Set your own monthly depreciation rate." },
] as const;

interface CalculatorInputs {
  inventoryValue: string;
  sqft: string;
  warehouseCostPerSqFt: string;
  insuranceRate: string;
  capitalRate: string;
  depreciationRate: string;
  inventoryType: string;
  months: number;
  liquidationDiscount: string;
  monthlySellThrough: string;
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
  const depRate = parseNum(inputs.depreciationRate) / 100;
  const months = inputs.months;
  const discount = parseNum(inputs.liquidationDiscount);
  const sellThrough = parseNum(inputs.monthlySellThrough) / 100;

  // Month-1 costs (displayed in the breakdown card)
  const monthlyStorage = sqft * warehouseRate;
  const monthlyInsurance = value * (insuranceRate / 100);
  const monthlyDepreciation = value * depRate;
  const monthlyCapitalCost = value * (capitalRate / 100 / 12);
  // Cash costs = what you actually pay out. Depreciation is value erosion, not cash.
  const monthlyCashCosts = monthlyStorage + monthlyInsurance + monthlyCapitalCost;
  const totalMonthly = monthlyCashCosts + monthlyDepreciation;

  // Month-by-month simulation.
  // Each month: inventory value shrinks from depreciation (value erosion) and
  // sell-through (revenue recovered). Cash costs (storage, insurance, capital)
  // are calculated on the current depreciated value and declining sqft.
  // Depreciation is NOT added to cash costs — it shows up as lower remaining value.
  let cumulativeCashCosts = 0;
  let totalDepreciationLoss = 0;
  let remainingValue = value;
  let remainingSqft = sqft;
  let revenueRecovered = 0;

  for (let m = 0; m < months; m++) {
    // Cash costs for this month (on current remaining value/sqft)
    const mStorage = remainingSqft * warehouseRate;
    const mInsurance = remainingValue * (insuranceRate / 100);
    const mCapital = remainingValue * (capitalRate / 100 / 12);
    cumulativeCashCosts += mStorage + mInsurance + mCapital;

    // Depreciation erodes the inventory's market value
    const mDepLoss = remainingValue * depRate;
    totalDepreciationLoss += mDepLoss;
    remainingValue -= mDepLoss;

    // Sell-through: revenue recovered at current (depreciated) value
    if (sellThrough > 0) {
      const sold = remainingValue * sellThrough;
      revenueRecovered += sold;
      remainingValue -= sold;
      remainingSqft *= (1 - sellThrough);
    }
  }

  // Total cost of holding = cash you spent + value you lost to depreciation
  const cumulativeCost = cumulativeCashCosts + totalDepreciationLoss;

  const sellTodayRecovery = value * (1 - discount / 100);
  // Hold scenario: revenue from sell-through + liquidate depreciated remainder - cash costs
  const holdThenSellRecovery =
    revenueRecovered + remainingValue * (1 - discount / 100) - cumulativeCashCosts;
  const costOfWaiting = sellTodayRecovery - holdThenSellRecovery;

  // Break-even: month where total losses (cash costs + depreciation) exceed the
  // discount you'd take by selling today
  const discountLoss = value * (discount / 100);
  let breakEvenMonths = Infinity;
  if (totalMonthly > 0) {
    let cumLoss = 0;
    let remVal = value;
    let remSqft = sqft;
    for (let m = 1; m <= 120; m++) {
      cumLoss += remSqft * warehouseRate
        + remVal * (insuranceRate / 100)
        + remVal * (capitalRate / 100 / 12);
      const dep = remVal * depRate;
      cumLoss += dep;
      remVal -= dep;
      if (sellThrough > 0) {
        remVal *= (1 - sellThrough);
        remSqft *= (1 - sellThrough);
      }
      if (cumLoss >= discountLoss) {
        breakEvenMonths = m;
        break;
      }
    }
  }

  return {
    monthlyStorage,
    monthlyInsurance,
    monthlyDepreciation,
    monthlyCapitalCost,
    monthlyCashCosts,
    totalMonthly,
    cumulativeCost,
    cumulativeCashCosts,
    totalDepreciationLoss,
    sellTodayRecovery,
    holdThenSellRecovery,
    costOfWaiting,
    breakEvenMonths,
    remainingValue,
    revenueRecovered,
    hasSellThrough: sellThrough > 0,
  };
}

export function CarryingCostCalculator() {
  const [inputs, setInputs] = useState<CalculatorInputs>({
    inventoryValue: "",
    sqft: "",
    warehouseCostPerSqFt: "0.75",
    insuranceRate: "0.5",
    capitalRate: "12",
    depreciationRate: "4",
    inventoryType: "slow-moving",
    months: 6,
    liquidationDiscount: "40",
    monthlySellThrough: "",
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
            <Label>Inventory type</Label>
            <Select
              value={inputs.inventoryType}
              onValueChange={(val) => {
                update("inventoryType", val);
                const preset = INVENTORY_TYPES.find((t) => t.value === val);
                if (preset && preset.rate) {
                  update("depreciationRate", preset.rate);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVENTORY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <span>{type.label}</span>
                    {type.rate && (
                      <span className="text-muted-foreground ml-1">({type.rate}%/mo)</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {INVENTORY_TYPES.find((t) => t.value === inputs.inventoryType)?.description}
            </p>
            {inputs.inventoryType === "custom" && (
              <div className="relative mt-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 3"
                  value={inputs.depreciationRate}
                  onChange={(e) => update("depreciationRate", e.target.value)}
                  className="pr-14"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%/mo</span>
              </div>
            )}
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

          {/* Hold time estimator */}
          <details className="group">
            <summary className="text-sm font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors">
              Not sure how long you&apos;ll hold?
              <span className="ml-1 text-xs group-open:hidden">▸</span>
              <span className="ml-1 text-xs hidden group-open:inline">▾</span>
            </summary>
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="calc-sellthrough">Monthly sell-through rate</Label>
                <div className="relative">
                  <Input
                    id="calc-sellthrough"
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 5"
                    value={inputs.monthlySellThrough}
                    onChange={(e) => {
                      const newVal = e.target.value;
                      update("monthlySellThrough", newVal);
                      const rate = parseNum(newVal);
                      if (rate > 0 && rate < 100) {
                        // Months to sell 90% of remaining inventory
                        // remaining = (1 - rate/100)^n, solve for remaining = 0.1
                        const estimated = Math.ceil(
                          Math.log(0.1) / Math.log(1 - rate / 100)
                        );
                        update("months", Math.min(Math.max(estimated, 1), 24));
                      }
                    }}
                    className="pr-7"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  What percent of this inventory moves through normal sales each month?
                </p>
              </div>
              {parseNum(inputs.monthlySellThrough) > 0 && parseNum(inputs.monthlySellThrough) < 100 && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-start gap-2">
                  <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    At <strong>{inputs.monthlySellThrough}%/month</strong>, it will take roughly{" "}
                    <strong className="text-foreground">
                      {Math.ceil(Math.log(0.1) / Math.log(1 - parseNum(inputs.monthlySellThrough) / 100))} months
                    </strong>{" "}
                    to clear 90% of this inventory. The slider has been updated.
                  </p>
                </div>
              )}
            </div>
          </details>

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
              {results.hasSellThrough ? "Month 1 Carrying Cost" : "Monthly Carrying Cost"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasValue ? (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Cash costs</p>
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
                    <DollarSign className="h-4 w-4" aria-hidden="true" />
                    Cost of capital
                  </span>
                  <span className="tabular-nums">{formatCurrency(results.monthlyCapitalCost)}</span>
                </div>
                <Separator />
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Value erosion</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <TrendingDown className="h-4 w-4" aria-hidden="true" />
                    Depreciation
                  </span>
                  <span className="tabular-nums">{formatCurrency(results.monthlyDepreciation)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your inventory loses {inputs.depreciationRate}% of its value each month. This compounds: after {inputs.months} {inputs.months === 1 ? "month" : "months"}, your{" "}
                  {formatCurrency(parseNum(inputs.inventoryValue))} inventory is worth{" "}
                  <strong className="text-destructive">{formatCurrency(results.remainingValue + results.revenueRecovered > 0 ? results.remainingValue : parseNum(inputs.inventoryValue) * Math.pow(1 - parseNum(inputs.depreciationRate) / 100, inputs.months))}</strong>.
                </p>
                <Separator />
                <div className="flex items-center justify-between font-semibold">
                  <span>Total month 1</span>
                  <span className="text-lg tabular-nums text-destructive">
                    {formatCurrency(results.totalMonthly)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground pt-1 space-y-1">
                  <p>
                    Over {inputs.months} {inputs.months === 1 ? "month" : "months"}: <strong className="text-destructive">{formatCurrency(results.cumulativeCashCosts)}</strong> in cash costs + <strong className="text-destructive">{formatCurrency(results.totalDepreciationLoss)}</strong> in lost value.
                  </p>
                  {(results.hasSellThrough || parseNum(inputs.depreciationRate) > 0) && (
                    <p>
                      All costs decline monthly as inventory value shrinks.
                    </p>
                  )}
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
                  Hold {inputs.months} {inputs.months === 1 ? "month" : "months"}, then liquidate remainder at {inputs.liquidationDiscount}% off
                </div>
                <div className="text-2xl font-bold tabular-nums">
                  {formatCurrency(results.holdThenSellRecovery)}
                </div>
                <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                  <div>Cash costs paid: {formatCurrency(results.cumulativeCashCosts)}</div>
                  <div>Value lost to depreciation: {formatCurrency(results.totalDepreciationLoss)}</div>
                  {results.hasSellThrough && (
                    <div>Sold through normal channels: {formatCurrency(results.revenueRecovered)}</div>
                  )}
                  <div>Remaining inventory value: {formatCurrency(results.remainingValue)}</div>
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
                  combined cash costs and depreciation exceed what you would lose
                  on the {inputs.liquidationDiscount}% discount. Every month past
                  that point, you are paying more to hold than the discount costs you.
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
