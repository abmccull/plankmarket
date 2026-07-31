import {
  Activity,
  Boxes,
  Clock3,
  Handshake,
  PackageCheck,
  ShieldAlert,
  ShoppingBasket,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MarketplaceHealth } from "@/server/services/marketplace-health";

interface MarketplaceHealthPanelProps {
  health: MarketplaceHealth;
}

function formatPercent(value: number | null): string {
  return value === null ? "Not enough data" : `${value.toFixed(1)}%`;
}

function formatHours(value: number | null): string {
  return value === null ? "Not enough data" : `${value.toFixed(1)} hours`;
}

export function MarketplaceHealthPanel({ health }: MarketplaceHealthPanelProps) {
  const metrics = [
    {
      title: "Active supply",
      value: `${health.activeSupplySqFt.toLocaleString()} sq ft`,
      detail: `${health.activeListings.toLocaleString()} active listings`,
      icon: Boxes,
    },
    {
      title: "Open demand",
      value: `${health.openDemandSqFt.toLocaleString()} sq ft`,
      detail: `${health.openBuyerRequests.toLocaleString()} buyer requests`,
      icon: ShoppingBasket,
    },
    {
      title: "Supply coverage",
      value:
        health.supplyCoverage === null
          ? "No open demand"
          : `${health.supplyCoverage.toFixed(2)}x`,
      detail: "Active sq ft divided by requested minimum sq ft",
      icon: Target,
    },
    {
      title: "Request response",
      value: formatPercent(health.requestResponseRate),
      detail: `Matched ${formatPercent(health.requestMatchRate)}; first response ${formatHours(health.averageHoursToRequestResponse)}`,
      icon: Handshake,
    },
    {
      title: "Listings with offers",
      value: formatPercent(health.listingOfferRate),
      detail: `Last ${health.windowDays} days`,
      icon: Activity,
    },
    {
      title: "Offer response",
      value: formatPercent(health.offerResponseRate),
      detail: `Average response: ${formatHours(health.averageHoursToOfferResponse)}`,
      icon: Clock3,
    },
    {
      title: "Paid order completion",
      value: formatPercent(health.orderCompletionRate),
      detail: `${health.paidOrders.toLocaleString()} paid orders in cohort`,
      icon: PackageCheck,
    },
    {
      title: "Transaction issue rate",
      value: formatPercent(health.transactionIssueRate),
      detail: `Refunded or disputed; pickup average ${formatHours(health.averageHoursToPickup)}`,
      icon: ShieldAlert,
    },
  ];

  return (
    <section aria-labelledby="marketplace-health-heading" className="space-y-4">
      <div>
        <h2 id="marketplace-health-heading" className="text-xl font-semibold">
          Marketplace health
        </h2>
        <p className="text-sm text-muted-foreground">
          Database-measured liquidity and operating outcomes for the last {health.windowDays} days.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
              <metric.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
