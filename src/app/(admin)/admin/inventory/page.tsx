"use client";

import { AlertTriangle, CheckCircle2, Database, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  QueryErrorState,
  StatePanelLoading,
} from "@/components/ui/state-panel";
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
  const inventoryQuery = trpc.inventoryIntegration.adminOverview.useQuery(
    undefined,
    {
      refetchInterval: 60_000,
      retry: false,
    },
  );
  const data = inventoryQuery.data;
  const header = (
    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:flex-wrap">
      <div className="min-w-0 w-full space-y-2 sm:flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Database
            className="h-7 w-7 shrink-0 text-primary"
            aria-hidden="true"
          />
          <h1 className="text-3xl font-bold">Inventory operations</h1>
        </div>
        <p className="text-muted-foreground">
          Source freshness, feed failures, and stock discrepancies that were
          intentionally kept out of live marketplace inventory.
        </p>
        <p className="text-sm text-muted-foreground">
          Showing up to 500 sources, 250 most recent open mismatches, and 100
          most recent failed runs. Each is a separate snapshot; counts describe
          only the rows shown in that section.
        </p>
        <Link
          href="/admin/reconciliation"
          className="inline-flex min-h-11 items-center text-sm underline"
        >
          Open reconciliation queue
        </Link>
      </div>
      <Button
        variant="outline"
        className="h-auto min-h-11 max-w-full whitespace-normal"
        onClick={() => void inventoryQuery.refetch()}
        disabled={inventoryQuery.isFetching}
      >
        Refresh queue
      </Button>
    </div>
  );

  if (inventoryQuery.isLoading) {
    return (
      <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
        {header}
        <StatePanelLoading label="Loading inventory overview" rows={3} />
      </div>
    );
  }
  if (inventoryQuery.isError || !data) {
    return (
      <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
        {header}
        <QueryErrorState
          title="Inventory overview unavailable"
          description="Source freshness and inventory exceptions could not be loaded. Try again before treating the queue as clear."
          onRetry={() => void inventoryQuery.refetch()}
          isRetrying={inventoryQuery.isFetching}
        />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Sources shown", data.totals.sources],
          ["Active sources shown", data.totals.activeSources],
          ["Stale active sources shown", data.totals.staleSources],
          ["Open mismatches shown", data.totals.openMismatches],
          ["Failed runs shown", data.totals.recentFailures],
        ].map(([label, value]) => (
          <Card key={label} role="group" aria-label={String(label)}>
            <CardContent className="p-5">
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-sm text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Open inventory mismatches
          </CardTitle>
          <CardDescription>
            Up to 250 most recent open mismatches are shown here. Review related
            data-integrity cases in the reconciliation queue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.openMismatches.length ? (
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
                  <Badge
                    variant="warning"
                    className="max-w-full whitespace-normal"
                  >
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
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              No open inventory mismatches in this snapshot.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Source freshness</CardTitle>
            <CardDescription>
              Up to 500 sources ordered by last successful sync. Stale marks
              active sources past their configured freshness interval;
              never-synced sources use their creation time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.sources.length ? (
              data.sources.map((source) => (
                <div
                  key={source.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="font-medium [overflow-wrap:anywhere]">
                      {source.sellerName ?? source.sellerEmail} · {source.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Last good sync: {dateLabel(source.lastSuccessfulIngestAt)}
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
                No sources in this snapshot.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <RefreshCw className="h-5 w-5 shrink-0" aria-hidden="true" />
              Recent failed runs
            </CardTitle>
            <CardDescription>
              Up to 100 most recent failed runs, across all sources. This is not
              a time-window total.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.batchFailures.length ? (
              data.batchFailures.map((batch) => (
                <div
                  key={batch.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"
                >
                  <div>
                    <div className="font-medium">{batch.sourceName}</div>
                    <div className="text-xs text-muted-foreground">
                      {batch.itemCount} items · {dateLabel(batch.startedAt)}
                    </div>
                  </div>
                  <Badge
                    variant="destructive"
                    className="max-w-full whitespace-normal"
                  >
                    {batch.errorCode ?? "UnknownError"}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No failed inventory runs in this snapshot.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
