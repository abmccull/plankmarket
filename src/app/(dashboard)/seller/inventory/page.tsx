"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Database,
  KeyRound,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";
import { getErrorMessage } from "@/lib/utils";

type RevealedCredential = {
  sourceName: string;
  apiKey: string;
};

const reasonLabels: Record<string, string> = {
  unbound_item: "Needs a listing",
  binding_conflict: "Listing mapping conflict",
  listing_not_owned: "Listing is unavailable",
  active_reservation: "Protected by an active order",
  stale_observation: "Older than the latest accepted update",
  invalid_observation_time: "Observation time is too far in the future",
};

function dateLabel(value: Date | string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default function SellerInventoryIntegrationsPage() {
  const utils = trpc.useUtils();
  const { data, isLoading } =
    trpc.inventoryIntegration.sellerOverview.useQuery();
  const [name, setName] = useState("");
  const [externalSourceId, setExternalSourceId] = useState("");
  const [revealedCredential, setRevealedCredential] =
    useState<RevealedCredential | null>(null);
  const [listingSelections, setListingSelections] = useState<
    Record<string, string>
  >({});

  const refresh = () => utils.inventoryIntegration.sellerOverview.invalidate();
  const createSource = trpc.inventoryIntegration.createSource.useMutation({
    onSuccess: async (result) => {
      setRevealedCredential({
        sourceName: result.source.name,
        apiKey: result.apiKey,
      });
      setName("");
      setExternalSourceId("");
      await refresh();
      toast.success("Inventory source created");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const rotateKey = trpc.inventoryIntegration.rotateKey.useMutation({
    onSuccess: async (result, variables) => {
      const source = data?.sources.find(
        (candidate) => candidate.id === variables.sourceId,
      );
      setRevealedCredential({
        sourceName: source?.name ?? "Inventory source",
        apiKey: result.apiKey,
      });
      await refresh();
      toast.success("Credential rotated. The previous key no longer works.");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const setSourceStatus =
    trpc.inventoryIntegration.setSourceStatus.useMutation({
      onSuccess: async () => {
        await refresh();
        toast.success("Inventory source updated");
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    });
  const bindItem = trpc.inventoryIntegration.bindItem.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("External item mapped to the listing");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const applyReconciliation =
    trpc.inventoryIntegration.applyReconciliation.useMutation({
      onSuccess: async () => {
        await refresh();
        toast.success("Feed quantity applied");
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    });
  const dismissReconciliation =
    trpc.inventoryIntegration.dismissReconciliation.useMutation({
      onSuccess: async () => {
        await refresh();
        toast.success("Mismatch dismissed with an audit record");
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    });

  const openReconciliations = useMemo(
    () =>
      data?.reconciliations.filter(
        (reconciliation) => reconciliation.status === "open",
      ) ?? [],
    [data?.reconciliations],
  );

  async function copyCredential() {
    if (!revealedCredential) return;
    try {
      await navigator.clipboard.writeText(revealedCredential.apiKey);
      toast.success("API key copied");
    } catch {
      toast.error("Copy failed. Select the key and copy it manually.");
    }
  }

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
          <h1 className="text-3xl font-bold">Inventory connections</h1>
        </div>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Keep marketplace quantities aligned with your ERP or warehouse
          system. Feed values are never allowed to overwrite inventory reserved
          by an active order.
        </p>
      </div>

      {revealedCredential && (
        <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5" />
              Save this key now
            </CardTitle>
            <CardDescription>
              This is the only time the credential for{" "}
              {revealedCredential.sourceName} will be shown. PlankMarket stores
              only its SHA-256 hash.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-background p-3 text-sm">
                {revealedCredential.apiKey}
              </code>
              <Button type="button" variant="outline" onClick={copyCredential}>
                <Clipboard className="h-4 w-4" />
                Copy key
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => setRevealedCredential(null)}
            >
              I saved it
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Sources", data?.totals.sources ?? 0],
          ["Connected items", data?.totals.connectedItems ?? 0],
          ["Needs mapping", data?.totals.unboundItems ?? 0],
          ["Open mismatches", data?.totals.openMismatches ?? 0],
          ["Stale sources", data?.totals.staleSources ?? 0],
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
          <CardTitle>Add a source</CardTitle>
          <CardDescription>
            Create one bearer-key connection per warehouse, ERP tenant, or
            automation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              createSource.mutate({
                name,
                externalSourceId,
                staleAfterMinutes: 1440,
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="source-name">Connection name</Label>
              <Input
                id="source-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Denver warehouse ERP"
                minLength={2}
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="external-source-id">External source ID</Label>
              <Input
                id="external-source-id"
                value={externalSourceId}
                onChange={(event) => setExternalSourceId(event.target.value)}
                placeholder="denver-warehouse"
                pattern="[A-Za-z0-9][A-Za-z0-9._:/-]*"
                maxLength={128}
                required
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={
                  createSource.isPending ||
                  name.trim().length < 2 ||
                  !externalSourceId.trim()
                }
              >
                {createSource.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create source
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Connected sources</h2>
          <p className="text-sm text-muted-foreground">
            Pause a source before maintenance. Revoking is permanent and
            immediately invalidates its credential.
          </p>
        </div>
        {data?.sources.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.sources.map((source) => (
              <Card key={source.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{source.name}</CardTitle>
                      <CardDescription>
                        {source.externalSourceId} ·{" "}
                        {source.authMode === "bearer"
                          ? "bearer key"
                          : "legacy signed (unsupported)"}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        source.status === "active"
                          ? source.stale
                            ? "warning"
                            : "success"
                          : source.status === "paused"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {source.stale && source.status === "active"
                        ? "stale"
                        : source.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Items</dt>
                      <dd className="font-medium">{source.itemCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Open mismatches</dt>
                      <dd className="font-medium">
                        {source.openMismatchCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last good sync</dt>
                      <dd className="font-medium">
                        {dateLabel(source.lastSuccessfulIngestAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Credential</dt>
                      <dd className="font-mono text-xs">
                        {source.apiKeyHint}
                      </dd>
                    </div>
                  </dl>
                  {source.lastErrorCode && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      Last ingest failed: {source.lastErrorCode}
                    </div>
                  )}
                  {source.authMode !== "bearer" && (
                    <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                      Legacy signed credentials are disabled. Create a new
                      bearer source, update your connector, then revoke this
                      source.
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {source.status === "active" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={setSourceStatus.isPending}
                        onClick={() =>
                          setSourceStatus.mutate({
                            sourceId: source.id,
                            status: "paused",
                          })
                        }
                      >
                        <Pause className="h-4 w-4" />
                        Pause
                      </Button>
                    )}
                    {source.status === "paused" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={setSourceStatus.isPending}
                        onClick={() =>
                          setSourceStatus.mutate({
                            sourceId: source.id,
                            status: "active",
                          })
                        }
                      >
                        <Play className="h-4 w-4" />
                        Resume
                      </Button>
                    )}
                    {source.status !== "revoked" && (
                      <>
                        {source.authMode === "bearer" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={rotateKey.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Rotate this credential now? The current key will stop working immediately.",
                                )
                              ) {
                                rotateKey.mutate({ sourceId: source.id });
                              }
                            }}
                          >
                            <RefreshCw className="h-4 w-4" />
                            Rotate key
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={setSourceStatus.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Permanently revoke this source? It cannot be resumed.",
                              )
                            ) {
                              setSourceStatus.mutate({
                                sourceId: source.id,
                                status: "revoked",
                              });
                            }
                          }}
                        >
                          <Unplug className="h-4 w-4" />
                          Revoke
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No inventory sources yet.
            </CardContent>
          </Card>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Reconciliation queue
          </CardTitle>
          <CardDescription>
            Nothing in this queue changed marketplace availability. Map new
            items, wait for reservations to clear, then explicitly apply or
            dismiss the reported value.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {openReconciliations.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
              All feed observations are reconciled.
            </div>
          ) : (
            openReconciliations.map((reconciliation) => {
              const selectedListing =
                listingSelections[reconciliation.sourceItemId] ?? "";
              return (
                <div
                  key={reconciliation.id}
                  className="rounded-lg border p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {reconciliation.externalItemId}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {reconciliation.sourceName} ·{" "}
                        {reasonLabels[reconciliation.reason] ??
                          reconciliation.reason}
                      </div>
                    </div>
                    <Badge variant="warning">
                      Feed {reconciliation.reportedQuantity.toLocaleString()} sq
                      ft
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <span className="text-muted-foreground">Listing: </span>
                      {reconciliation.listingTitle ?? "Not mapped"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        Marketplace:{" "}
                      </span>
                      {reconciliation.marketplaceQuantity == null
                        ? "—"
                        : `${reconciliation.marketplaceQuantity.toLocaleString()} sq ft`}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Reserved: </span>
                      {reconciliation.reservedQuantity.toLocaleString()} sq ft
                    </div>
                  </div>
                  {!reconciliation.listingId && (
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <label
                        className="sr-only"
                        htmlFor={`listing-${reconciliation.id}`}
                      >
                        Listing for {reconciliation.externalItemId}
                      </label>
                      <select
                        id={`listing-${reconciliation.id}`}
                        value={selectedListing}
                        onChange={(event) =>
                          setListingSelections((current) => ({
                            ...current,
                            [reconciliation.sourceItemId]: event.target.value,
                          }))
                        }
                        className="h-9 min-w-72 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">Choose a listing…</option>
                        {data?.listings.map((listing) => (
                          <option key={listing.id} value={listing.id}>
                            {listing.title} · {listing.totalSqFt.toLocaleString()}{" "}
                            sq ft
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!selectedListing || bindItem.isPending}
                        onClick={() =>
                          bindItem.mutate({
                            sourceItemId: reconciliation.sourceItemId,
                            listingId: selectedListing,
                          })
                        }
                      >
                        <Link2 className="h-4 w-4" />
                        Map item
                      </Button>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={
                        !reconciliation.listingId ||
                        reconciliation.reservedQuantity > 0 ||
                        applyReconciliation.isPending
                      }
                      onClick={() =>
                        applyReconciliation.mutate({
                          reconciliationId: reconciliation.id,
                        })
                      }
                    >
                      Apply feed quantity
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={dismissReconciliation.isPending}
                      onClick={() => {
                        const reason = window.prompt(
                          "Why should this feed observation be dismissed? This note is retained in the audit history.",
                        );
                        if (reason && reason.trim().length >= 10) {
                          dismissReconciliation.mutate({
                            reconciliationId: reconciliation.id,
                            reason,
                          });
                        } else if (reason !== null) {
                          toast.error(
                            "Please provide at least 10 characters of context.",
                          );
                        }
                      }}
                    >
                      Dismiss with note
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent ingest runs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.batches.length ? (
              data.batches.map((batch) => (
                <div
                  key={batch.id}
                  className="flex items-center justify-between gap-3 border-b py-3 last:border-0"
                >
                  <div>
                    <div className="font-medium">{batch.sourceName}</div>
                    <div className="text-xs text-muted-foreground">
                      {dateLabel(batch.startedAt)} · {batch.itemCount} items
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant={
                        batch.status === "completed"
                          ? batch.mismatchCount || batch.unboundCount
                            ? "warning"
                            : "success"
                          : batch.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {batch.status}
                    </Badge>
                    {batch.status === "completed" && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {batch.appliedCount} applied · {batch.mismatchCount}{" "}
                        mismatched
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No ingest runs yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API contract</CardTitle>
            <CardDescription>
              POST JSON to the inventory endpoint in batches of 100 items or
              fewer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs">
              POST /api/inventory/ingest
              <br />
              Authorization: Bearer $PLANKMARKET_INVENTORY_KEY
              <br />
              Idempotency-Key: warehouse-run-2026-07-30T12:00Z
            </div>
            <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 text-xs">
{`{
  "items": [{
    "externalItemId": "SKU-123",
    "listingId": "optional-listing-uuid",
    "availableSqFt": 2400,
    "observedAt": "2026-07-30T18:00:00Z"
  }]
}`}
            </pre>
            <div className="flex gap-2 rounded-md bg-blue-50 p-3 text-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Inventory ingest is bearer-only. Send the key in the{" "}
                <code>Authorization</code> header and a stable{" "}
                <code>Idempotency-Key</code> per feed batch. Legacy signed
                headers are rejected.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
