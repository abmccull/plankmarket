"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { PUBLIC_COMMERCIAL_COPY } from "@/lib/public-commercial-copy";
import {
  calculateCarryingCost,
  DEFAULT_CARRYING_INPUTS,
  type CarryingCostField,
  type CarryingCostInputs,
} from "@/lib/carrying-cost";

export function CarryingCostCalculator({
  compact = false,
  initialInputs,
}: {
  compact?: boolean;
  initialInputs?: CarryingCostInputs;
}) {
  const [inputs, setInputs] = useState<CarryingCostInputs>(() => ({
    ...DEFAULT_CARRYING_INPUTS,
    ...initialInputs,
  }));
  const result = calculateCarryingCost(inputs);
  const prefix = compact ? "compact" : "calc";
  const update = (field: CarryingCostField, value: string) =>
    setInputs((previous) => ({ ...previous, [field]: value }));
  const input = (
    field: CarryingCostField,
    suffix: string,
    label: string,
    hint?: string,
  ) => {
    const id = `${prefix}-${suffix}`;
    const error = result.errors[field];
    return (
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          inputMode="decimal"
          value={inputs[field]}
          onChange={(event) => update(field, event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={
            [hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        {hint && (
          <p
            id={`${id}-hint`}
            className="text-xs leading-relaxed text-muted-foreground"
          >
            {hint}
          </p>
        )}
        {error && (
          <p id={`${id}-error`} className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  };
  const visibleMonths = Number(inputs.months);
  const safeMonths =
    Number.isInteger(visibleMonths) && visibleMonths >= 1 && visibleMonths <= 24
      ? visibleMonths
      : 6;
  const breakdownLink = `/tools/carrying-cost-calculator?${new URLSearchParams(inputs).toString()}`;
  const row = (label: string, value: number, key?: string) => (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
      <dt className="min-w-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums" data-carrying-result={key}>
        {formatCurrency(value)}
      </dd>
    </div>
  );

  return (
    <div
      className={
        compact
          ? "rounded-xl border bg-card p-5 sm:p-6"
          : "grid items-start gap-6 lg:grid-cols-2"
      }
    >
      <section
        aria-label="Carrying-cost assumptions"
        className={compact ? "" : "rounded-xl border bg-card p-5 sm:p-6"}
      >
        <h2 className="font-display text-xl">
          {compact ? "Compare a holding scenario" : "Your assumptions"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Illustrative only. Enter your estimate of the lot&apos;s current
          value, then adjust the assumptions. This tool does not predict a sale
          or set a listing price.
        </p>
        <div
          className={
            compact ? "mt-5 grid gap-5 sm:grid-cols-3" : "mt-5 space-y-5"
          }
        >
          {input(
            "inventoryValue",
            "value",
            "Current inventory value ($)",
            "Use your current estimate, which may differ from original cost.",
          )}
          <div className="min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label id={`${prefix}-months-label`}>Months holding</Label>
              <span className="text-sm tabular-nums">{safeMonths} months</span>
            </div>
            <input
              type="range"
              className="block h-11 w-full cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-labelledby={`${prefix}-months-label`}
              aria-invalid={Boolean(result.errors.months)}
              aria-describedby={
                result.errors.months ? `${prefix}-months-error` : undefined
              }
              value={safeMonths}
              onChange={(event) => update("months", event.target.value)}
              min={1}
              max={24}
              step={1}
            />
            {result.errors.months && (
              <p
                id={`${prefix}-months-error`}
                className="text-sm text-destructive"
              >
                {result.errors.months}
              </p>
            )}
          </div>
          {input(
            "liquidationDiscount",
            "discount",
            "Sale discount (%)",
            "Apply the same discount to the value at each sale date.",
          )}
        </div>
        {!compact && (
          <div className="mt-6 space-y-5 border-t pt-5">
            <h3 className="font-semibold">Holding assumptions</h3>
            <p className="text-sm text-muted-foreground">
              Zero is a starting assumption, not an industry average. Replace it
              with your own figures.
            </p>
            {input(
              "monthlyStorage",
              "storage",
              "Monthly storage allocation ($)",
              "The amount assigned to this lot each month, not its flooring square footage.",
            )}
            {input(
              "monthlyInsurance",
              "insurance",
              "Monthly insurance allocation ($)",
            )}
            {input(
              "annualCapitalRate",
              "capital",
              "Annual capital or opportunity cost (%)",
              "Applied monthly to remaining estimated value. This may be an opportunity cost rather than cash paid.",
            )}
            {input(
              "monthlyValueLossRate",
              "loss",
              "Estimated monthly value loss (%)",
              "A scenario assumption that compounds monthly, not a forecast of market prices.",
            )}
          </div>
        )}
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          Assumes no sales or price appreciation while holding, followed by one
          sale of the whole lot. Storage and insurance stay constant. Freight
          contributions, tax, returns, and other operating costs are excluded.
        </p>
        {compact && (
          <p className="mt-2 text-xs text-muted-foreground">
            Storage, insurance, capital cost and value loss start at zero. Edit
            them in the full breakdown.
          </p>
        )}
      </section>

      {result.status === "ready" ? (
        <section
          aria-label="Illustrative carrying-cost results"
          data-carrying-results
          className={
            compact
              ? "mt-5 border-t pt-5"
              : "rounded-xl border bg-card p-5 sm:p-6"
          }
        >
          <h2 className="font-display text-xl">Estimated recovery</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Under these assumptions, using one sale and today&apos;s published
            fees.
          </p>
          <dl className="mt-3 divide-y">
            {row(
              "Sell now: estimated seller net",
              result.sellNow.net,
              "sell-now-net",
            )}
            {row(
              `Hold ${result.values.months} months: net after holding costs`,
              result.holdNet,
              "hold-net",
            )}
          </dl>
          {!compact && (
            <>
              <details className="mt-4 border-t pt-4">
                <summary className="cursor-pointer rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Sale amounts and fee deductions
                </summary>
                <h3 className="mt-4 text-sm font-semibold">Sell now</h3>
                <dl className="divide-y">
                  {row("Gross sale amount", result.sellNow.gross)}
                  {row(
                    PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel,
                    result.sellNow.sellerFee,
                  )}
                  {row(
                    `Processing (${PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel})`,
                    result.sellNow.processingFee,
                  )}
                  {row(
                    "Total fee deductions",
                    result.sellNow.sellerFee + result.sellNow.processingFee,
                    "sell-now-fees",
                  )}
                </dl>
                <h3 className="mt-4 text-sm font-semibold">
                  Sell after holding
                </h3>
                <dl className="divide-y">
                  {row("Gross sale amount", result.sellLater.gross)}
                  {row(
                    PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel,
                    result.sellLater.sellerFee,
                  )}
                  {row(
                    `Processing (${PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel})`,
                    result.sellLater.processingFee,
                  )}
                  {row("Seller net before holding costs", result.sellLater.net)}
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  A zero-dollar result assumes no sale and no processing charge.
                  A positive sale uses the published fixed processing charge,
                  even for a very small amount. These are estimates, not a
                  transfer confirmation.
                </p>
              </details>
              <h3 className="mt-5 border-t pt-4 font-semibold">
                During the holding period
              </h3>
              <dl className="mt-2 divide-y">
                {row(
                  "Storage + insurance cash costs",
                  result.cashCosts,
                  "cash-costs",
                )}
                {row(
                  "Capital or opportunity cost",
                  result.capitalCost,
                  "capital-cost",
                )}
                {row("Estimated value loss", result.valueLoss, "value-loss")}
                {row(
                  "Estimated inventory value at end",
                  result.endingValue,
                  "ending-value",
                )}
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                The later sale uses the reduced inventory value. Value loss is
                not deducted a second time. Capital cost is the annual rate
                divided by 12, applied to each month&apos;s opening value.
              </p>
            </>
          )}
          <div className="mt-5 rounded-lg bg-muted/50 p-4">
            <p className="text-sm font-medium">
              {Math.abs(result.difference) < 0.005
                ? "Both scenarios have the same estimated recovery."
                : result.difference > 0
                  ? "Selling now has higher estimated recovery by"
                  : "Holding has higher estimated recovery by"}
            </p>
            {Math.abs(result.difference) >= 0.005 && (
              <p
                className="mt-1 break-words text-2xl font-semibold tabular-nums"
                data-carrying-result="difference"
              >
                {formatCurrency(Math.abs(result.difference))}
              </p>
            )}
          </div>
          {compact ? (
            <Link
              href={breakdownLink}
              prefetch={false}
              className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              Edit assumptions and see breakdown
              <ArrowRight
                className="ml-2 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
            </Link>
          ) : (
            <div className="mt-5 border-t pt-5">
              <Button asChild className="w-full">
                <Link href="/register?role=seller">
                  Create a seller account
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                No listing fee. The{" "}
                {PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel} and{" "}
                {PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel} processing apply
                to completed inventory sales. Business approval is required
                before creating listings.
              </p>
              <Link
                href="/pricing"
                className="mt-2 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
              >
                Review pricing and payment details
              </Link>
            </div>
          )}
        </section>
      ) : (
        <div
          className={
            compact
              ? "mt-5 border-t pt-4"
              : "rounded-xl border border-dashed p-6"
          }
          role="status"
        >
          <p className="text-sm text-muted-foreground">
            {result.status === "invalid"
              ? "Check the highlighted assumptions to see an estimate."
              : "Enter an inventory value greater than zero to compare scenarios."}
          </p>
        </div>
      )}
    </div>
  );
}
