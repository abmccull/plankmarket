"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc/client";

function dateLabel(value: Date | string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

const reasonLabels: Record<string, string> = {
  unbound_item: "Unbound feed item",
  binding_conflict: "Conflicting listing mapping",
  listing_not_owned: "Listing unavailable",
  active_reservation: "Active order reservation",
  stale_observation: "Out-of-order observation",
  invalid_observation_time: "Invalid future observation",
};

export default function AdminInventoryOperationsPage() {
  const { data, isLoading } =
    trpc.inventoryIntegration.adminOverview.useQuery(undefined, {
      refetchInterval: 60_000,
    });

  if (isLoading) {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Database className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold">Inventory operations</h1>
        </div>
        <p className="mt-1 text-muted-foreground">
          Source freshness, feed failures, and stock discrepancies that were
          intentionally kept out of live marketplace inventory.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["All sources", data?.totals.sources ?? 0],
          ["Active", data?.totals.activeSources ?? 0],
          ["Stale", data?.totals.staleSources ?? 0],
          ["Open mismatches", data?.totals.openMismatches ?? 0],
          ["Recent failures", data?.totals.recentFailures ?? 0],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-sm text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Open inventory mismatches
          </CardTitle>
          <CardDescription>
            Each item also opens or refreshes a durable data-integrity case in
            the main reconciliation queue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.openMismatches.length ? (
            data.openMismatches.map((mismatch) => (
              <div key={mismatch.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {mismatch.sellerName ?? "Seller"} ·{" "}
                      {mismatch.externalItemId}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {mismatch.sourceName} ·{" "}
                      {mismatch.listingTitle ?? "No listing mapped"}
                    </div>
                  </div>
                  <Badge variant="warning">
                    {reasonLabels[mismatch.reason] ?? mismatch.reason}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <span className="text-muted-foreground">Feed: </span>
                    {mismatch.reportedQuantity.toLocaleString()} sq ft
                  </div>
                  <div>
                    <span className="text-muted-foreground">Marketplace: </span>
                    {mismatch.marketplaceQuantity == null
                      ? "—"
                      : `${mismatch.marketplaceQuantity.toLocaleString()} sq ft`}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Reserved: </span>
                    {mismatch.reservedQuantity.toLocaleString()} sq ft
                  </div>
                  <div>
                    <span className="text-muted-foreground">Detected: </span>
                    {dateLabel(mismatch.detectedAt)}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
              No inventory mismatches are waiting for review.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Source freshness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.sources.length ? (
              data.sources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between gap-3 border-b py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {source.sellerName ?? source.sellerEmail} · {source.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Last good sync:{" "}
                      {dateLabel(source.lastSuccessfulIngestAt)}
                    </div>
                  </div>
                  <Badge
                    variant={
                      source.status !== "active"
                        ? "secondary"
                        : source.stale
                          ? "warning"
                          : "success"
                    }
                  >
                    {source.status === "active" && source.stale
                      ? "stale"
                      : source.status}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No seller sources configured.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Recent failed runs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.batchFailures.length ? (
              data.batchFailures.map((batch) => (
                <div
                  key={batch.id}
                  className="flex items-center justify-between gap-3 border-b py-3 last:border-0"
                >
                  <div>
                    <div className="font-medium">{batch.sourceName}</div>
                    <div className="text-xs text-muted-foreground">
                      {batch.itemCount} items · {dateLabel(batch.startedAt)}
                    </div>
                  </div>
                  <Badge variant="destructive">
                    {batch.errorCode ?? "UnknownError"}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No failed inventory runs.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
