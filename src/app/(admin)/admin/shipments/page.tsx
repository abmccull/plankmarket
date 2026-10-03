"use client";

import { useEffect, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { ColumnDef } from "@tanstack/react-table";
import type { AppRouter } from "@/server/routers/_app";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { DataTable } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  QueryErrorState,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { formatCurrency, getErrorMessage } from "@/lib/utils";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Shipment = RouterOutputs["admin"]["getShipments"]["items"][number];
type ShipmentStatus = Shipment["status"];
type ShipmentInput = { status?: ShipmentStatus; page: number; limit: number };
type ReviewTarget = { shipment: Shipment; input: ShipmentInput };

const PAGE_SIZE = 25;
const controlClassName =
  "h-auto min-h-11 min-w-0 max-w-full whitespace-normal px-3 py-2";
const STATUS_CONFIG: Record<
  ShipmentStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "success" | "warning";
  }
> = {
  pending: { label: "Pending Pickup", variant: "warning" },
  dispatched: { label: "Dispatched", variant: "default" },
  in_transit: { label: "In Transit", variant: "default" },
  out_for_delivery: { label: "Out for Delivery", variant: "default" },
  delivered: { label: "Delivered", variant: "success" },
  exception: { label: "Exception", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "secondary" },
};

function FreightDetails({ shipment }: { shipment: Shipment }) {
  const order = shipment.order;
  const money = (value: number | null) =>
    value == null ? "Not recorded" : formatCurrency(value);
  const values = [
    ["Carrier rate", money(order.carrierRate)],
    ["Full freight", money(order.shippingPrice)],
    ["Buyer shipping", money(order.buyerFreightCharge)],
    ["Seller contribution", money(order.sellerFreightContribution)],
    ["Shipping margin", money(order.shippingMargin)],
    [
      "Funding",
      order.freightFundingMode === "buyer_pays"
        ? "Buyer"
        : order.freightFundingMode === "seller_pays"
          ? "Seller nationwide"
          : "Seller selected state",
    ],
  ];
  return (
    <details className="min-w-0 text-sm">
      <summary className="min-h-11 cursor-pointer py-3 font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Freight details
      </summary>
      <dl className="space-y-2 pb-2">
        {values.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="break-words font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function ShipmentState({ shipment }: { shipment: Shipment }) {
  const config = STATUS_CONFIG[shipment.status];
  return (
    <div className="min-w-0 space-y-2">
      <Badge variant={config.variant} className="whitespace-normal">
        {config.label}
      </Badge>
      <div className="space-y-1 break-words text-sm">
        <p className="font-medium">{shipment.recovery.title}</p>
        <p className="text-muted-foreground">{shipment.recovery.description}</p>
        {shipment.recovery.action && (
          <a
            href={shipment.recovery.action.href}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            {shipment.recovery.action.label}
          </a>
        )}
      </div>
    </div>
  );
}

export default function AdminShipmentsPage() {
  const user = useAuthStore((state) => state.user);
  if (!user || user.role !== "admin") {
    return <StatePanelLoading label="Checking administrator access" rows={2} />;
  }
  return <ShipmentsQueue key={user.id} actorId={user.id} />;
}

function ShipmentsQueue({ actorId }: { actorId: string }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ShipmentStatus | "all">("all");
  const [selected, setSelected] = useState<Shipment | null>(null);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const pending = useRef(false);
  const reviewRequired = useRef(false);
  const input: ShipmentInput = {
    status: status === "all" ? undefined : status,
    page,
    limit: PAGE_SIZE,
  };
  const shipmentsQuery = trpc.admin.getShipments.useQuery(input);
  const statsQuery = trpc.admin.getShippingStats.useQuery();
  const utils = trpc.useUtils();
  const repoll = trpc.admin.repollShipment.useMutation({ retry: false });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function isCurrent() {
    const live = useAuthStore.getState().user;
    return mounted.current && live?.id === actorId && live.role === "admin";
  }

  function openSync(shipment: Shipment) {
    if (
      !isCurrent() ||
      pending.current ||
      reviewRequired.current ||
      shipmentsQuery.isError ||
      shipmentsQuery.isFetching
    )
      return;
    setSelected(shipment);
    setActionError(null);
  }

  async function refreshAfterChange() {
    // Invalidate every page/filter without triggering inactive queue reads.
    // Do not seed a query cache from a departed administrator's direct read.
    if (!isCurrent()) return;
    await utils.admin.getShipments.invalidate(undefined, {
      refetchType: "none",
    });
    if (!isCurrent()) return;
    await utils.admin.getShippingStats.invalidate(undefined, {
      refetchType: "none",
    });
    if (!isCurrent()) return;
    const queueResult = await shipmentsQuery.refetch();
    if (!isCurrent()) return;
    const statsResult = await statsQuery.refetch();
    if (!isCurrent()) return;
    if (queueResult.error || statsResult.error) {
      setRefreshNote(
        "The latest queue or totals could not be loaded. Retry the affected read; do not repeat the carrier sync to refresh the display.",
      );
    } else {
      setRefreshNote(null);
    }
  }

  async function confirmSync() {
    if (
      !selected ||
      !isCurrent() ||
      pending.current ||
      reviewRequired.current ||
      shipmentsQuery.isError ||
      shipmentsQuery.isFetching
    )
      return;
    const target = selected;
    const targetInput = { ...input };
    pending.current = true;
    setBusy(true);
    setActionError(null);
    let accepted = false;
    try {
      const result = await repoll.mutateAsync({ shipmentId: target.id });
      if (!isCurrent()) return;
      if (!result || result.id !== target.id) {
        throw new Error(
          "The carrier sync response did not confirm this shipment.",
        );
      }
      accepted = true;
      setNotice("Carrier status updated for " + target.order.orderNumber + ".");
      setRefreshNote(null);
      setSelected(null);
      await refreshAfterChange();
    } catch (error) {
      if (!isCurrent()) return;
      if (accepted) {
        setRefreshNote(
          "The carrier sync completed, but its queue or totals could not refresh. Retry the affected read; do not repeat the carrier sync.",
        );
      } else {
        reviewRequired.current = true;
        setReviewTarget({ shipment: target, input: targetInput });
        setActionError(
          getErrorMessage(error, "We could not confirm the carrier sync.") +
            " The request may have updated shipment or order records. Read the latest shipment record before deciding on another sync.",
        );
      }
    } finally {
      pending.current = false;
      if (isCurrent()) setBusy(false);
    }
  }

  async function readLatestShipment() {
    if (!reviewTarget || !isCurrent() || pending.current) return;
    const target = reviewTarget;
    pending.current = true;
    setBusy(true);
    try {
      // This is a database read only. It does not replay the carrier operation.
      const result = await utils.client.admin.getShipments.query(target.input);
      if (!isCurrent()) return;
      const fresh = result.items.find(
        (shipment) => shipment.id === target.shipment.id,
      );
      if (!fresh) {
        throw new Error(
          "This shipment is no longer in the selected queue page. Carrier sync remains paused. Review reconciliation for this order before taking further action.",
        );
      }
      await utils.admin.getShipments.invalidate(undefined, {
        refetchType: "none",
      });
      if (!isCurrent()) return;
      await utils.admin.getShippingStats.invalidate(undefined, {
        refetchType: "none",
      });
      if (!isCurrent()) return;
      setSelected((previous) => (previous?.id === fresh.id ? fresh : previous));
      reviewRequired.current = false;
      setReviewTarget(null);
      setActionError(null);
      setNotice(
        "Shipment record reloaded. Review its current status before deciding on another sync. This read does not confirm completion of the earlier carrier request or follow-on processing.",
      );
      const queueResult = await shipmentsQuery.refetch();
      if (!isCurrent()) return;
      const statsResult = await statsQuery.refetch();
      if (!isCurrent()) return;
      setRefreshNote(
        queueResult.error || statsResult.error
          ? "The shipment record was read, but the queue or totals could not refresh. Retry the affected read before another carrier sync."
          : null,
      );
    } catch (error) {
      if (!isCurrent()) return;
      if (reviewRequired.current) {
        setActionError(
          getErrorMessage(
            error,
            "The shipment record could not be read. Carrier sync remains paused.",
          ),
        );
      } else {
        setRefreshNote(
          "The shipment record was read, but the queue or totals could not refresh. Retry the affected read before another carrier sync.",
        );
      }
    } finally {
      pending.current = false;
      if (isCurrent()) setBusy(false);
    }
  }

  const actionsDisabled =
    busy ||
    !!reviewTarget ||
    shipmentsQuery.isError ||
    shipmentsQuery.isFetching;

  function renderActions(shipment: Shipment) {
    return (
      <div className="min-w-0 space-y-2">
        <Button
          type="button"
          variant="outline"
          className={controlClassName}
          aria-label={"Sync carrier status for " + shipment.order.orderNumber}
          disabled={actionsDisabled}
          onClick={() => openSync(shipment)}
        >
          <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">Sync carrier status</span>
        </Button>
        {shipment.bolUrl && (
          <Button asChild variant="ghost" className={controlClassName}>
            <a
              href={shipment.bolUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={
                "View bill of lading for " + shipment.order.orderNumber
              }
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">Bill of lading</span>
            </a>
          </Button>
        )}
      </div>
    );
  }

  function carrierDetails(shipment: Shipment) {
    return (
      <div className="min-w-0 space-y-2 break-words text-sm">
        <p>{shipment.carrierName ?? "Carrier not recorded"}</p>
        <Badge
          variant={shipment.isDryRun ? "warning" : "success"}
          className="whitespace-normal"
        >
          {shipment.isDryRun ? "Dry run / unverified" : "Priority1 live"}
        </Badge>
        <p className="text-xs text-muted-foreground">
          PRO:{" "}
          <span className="break-all">
            {shipment.proNumber ?? "Not recorded"}
          </span>
        </p>
      </div>
    );
  }

  const columns: ColumnDef<Shipment>[] = [
    {
      id: "order",
      header: "Order",
      cell: ({ row }) => (
        <span className="break-all font-medium">
          {row.original.order.orderNumber}
        </span>
      ),
    },
    {
      id: "carrier",
      header: "Carrier",
      cell: ({ row }) => (
        <div className="min-w-0 max-w-44">{carrierDetails(row.original)}</div>
      ),
    },
    {
      id: "status",
      header: "Status and recovery",
      cell: ({ row }) => (
        <div className="min-w-0 max-w-64">
          <ShipmentState shipment={row.original} />
        </div>
      ),
    },
    {
      id: "freight",
      header: "Freight",
      cell: ({ row }) => (
        <div className="min-w-0 max-w-44">
          <FreightDetails shipment={row.original} />
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="min-w-0 max-w-52">{renderActions(row.original)}</div>
      ),
    },
  ];
  const stats = statsQuery.data;
  const statsValues = stats
    ? [
        ["Total shipments", stats.totalShipments.toLocaleString()],
        ["Active shipments", stats.activeShipments.toLocaleString()],
        ["Recorded full freight", formatCurrency(stats.totalFreightBooked)],
        ["Buyer shipping", formatCurrency(stats.totalBuyerFreightCharges)],
        [
          "Seller contributions",
          formatCurrency(stats.totalSellerFreightContributions),
        ],
        ["Recorded shipping margin", formatCurrency(stats.totalMargin)],
      ]
    : [];

  return (
    <div className="min-w-0 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Shipments</h1>
        <p className="max-w-3xl text-muted-foreground">
          Find shipments that need attention, review freight details, and sync
          carrier updates when needed.
        </p>
      </header>

      {notice && (
        <div
          role="status"
          className="space-y-2 rounded-md border bg-muted/30 p-4 text-sm"
        >
          <p>{notice}</p>
          {refreshNote && <p>{refreshNote}</p>}
        </div>
      )}

      {reviewTarget && !selected && (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-destructive/30 p-4 text-sm"
        >
          <p className="font-medium">
            Review carrier sync for {reviewTarget.shipment.order.orderNumber}
          </p>
          <p>
            {actionError ??
              "Carrier sync is paused until the latest shipment record is read."}
          </p>
          <Button
            type="button"
            variant="outline"
            className={controlClassName}
            disabled={busy}
            onClick={() => {
              if (isCurrent() && !pending.current)
                setSelected(reviewTarget.shipment);
            }}
          >
            Review carrier sync
          </Button>
        </div>
      )}

      <section aria-label="Shipment queue" className="min-w-0 space-y-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-2 sm:w-64">
            <Label htmlFor="shipment-status">Shipment status</Label>
            <select
              id="shipment-status"
              value={status}
              disabled={busy || !!reviewTarget}
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              onChange={(event) => {
                if (!isCurrent() || pending.current || reviewRequired.current)
                  return;
                const value = event.target.value;
                if (value !== "all" && !(value in STATUS_CONFIG)) return;
                setStatus(value as ShipmentStatus | "all");
                setPage(1);
              }}
            >
              <option value="all">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([value, config]) => (
                <option key={value} value={value}>
                  {config.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="outline"
            className={controlClassName}
            disabled={busy || shipmentsQuery.isFetching}
            onClick={() => {
              if (isCurrent() && !pending.current)
                void shipmentsQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
            Refresh shipments
          </Button>
        </div>
        {shipmentsQuery.isError ? (
          <QueryErrorState
            title="Shipments unavailable"
            description="The shipment queue could not be loaded. Refresh it before taking carrier action. Shipping totals are loaded separately."
            onRetry={() => {
              if (isCurrent() && !pending.current)
                void shipmentsQuery.refetch();
            }}
            isRetrying={shipmentsQuery.isFetching || busy}
          />
        ) : shipmentsQuery.isLoading || !shipmentsQuery.data ? (
          <StatePanelLoading label="Loading shipments" />
        ) : (
          <DataTable
            columns={columns}
            data={shipmentsQuery.data.items}
            serverPagination={{
              page,
              pageSize: PAGE_SIZE,
              total: shipmentsQuery.data.total,
              totalPages: shipmentsQuery.data.totalPages,
              isFetching: busy || !!reviewTarget || shipmentsQuery.isFetching,
              onPageChange: (nextPage) => {
                if (isCurrent() && !pending.current && !reviewRequired.current)
                  setPage(nextPage);
              },
            }}
            renderMobileRow={(shipment) => (
              <article
                aria-label={"Shipment " + shipment.order.orderNumber}
                className="min-w-0 space-y-3"
              >
                <p className="break-all font-semibold">
                  {shipment.order.orderNumber}
                </p>
                {carrierDetails(shipment)}
                <ShipmentState shipment={shipment} />
                {renderActions(shipment)}
                <FreightDetails shipment={shipment} />
              </article>
            )}
          />
        )}
      </section>

      <section
        aria-label="Shipping totals"
        className="min-w-0 space-y-4 border-t pt-6"
      >
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Shipping totals</h2>
          <p className="text-sm text-muted-foreground">
            All shipment records. Recorded freight amounts include every status
            and are not cash received or settled payouts.
          </p>
        </div>
        {statsQuery.isError ? (
          <div
            role="alert"
            className="space-y-3 rounded-md border border-destructive/30 p-4"
          >
            <h3 className="font-semibold">Shipping totals unavailable</h3>
            <p className="text-sm text-muted-foreground">
              The totals could not be loaded. You can continue using the
              shipment queue.
            </p>
            <Button
              type="button"
              variant="outline"
              className={controlClassName}
              disabled={busy || statsQuery.isFetching}
              onClick={() => {
                if (isCurrent() && !pending.current) void statsQuery.refetch();
              }}
            >
              Retry shipping totals
            </Button>
          </div>
        ) : statsQuery.isLoading || !stats ? (
          <StatePanelLoading label="Loading shipping totals" rows={1} />
        ) : (
          <dl className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            {statsValues.map(([label, value]) => (
              <div key={label} className="min-w-0 border-l-2 pl-3">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="break-words text-xl font-semibold tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <AlertDialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && isCurrent() && !pending.current) setSelected(null);
        }}
      >
        <AlertDialogContent
          className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] min-w-0 overflow-y-auto p-[min(1.5rem,24px)]"
          onEscapeKeyDown={(event) => {
            if (pending.current) event.preventDefault();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Sync carrier status</AlertDialogTitle>
            <AlertDialogDescription>
              Read the carrier&apos;s latest status and apply it to this
              shipment. This may update shipment and order records and start
              existing fulfillment processing. It does not book a new shipment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selected && (
            <div className="min-w-0 space-y-3 text-sm">
              <dl className="space-y-2 rounded-md border p-3">
                <div>
                  <dt className="text-muted-foreground">Order</dt>
                  <dd className="break-all font-semibold">
                    {selected.order.orderNumber}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Carrier</dt>
                  <dd className="break-words">
                    {selected.carrierName ?? "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Current recorded status
                  </dt>
                  <dd>{STATUS_CONFIG[selected.status].label}</dd>
                </div>
              </dl>
              {actionError && (
                <p role="alert" className="break-words text-destructive">
                  {actionError}
                </p>
              )}
              {reviewTarget && (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    className={controlClassName}
                    disabled={busy}
                    onClick={() => void readLatestShipment()}
                  >
                    Read latest shipment record
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    This reads the marketplace record only. It does not contact
                    the carrier or repeat the sync.
                  </p>
                  <a
                    href="/admin/reconciliation"
                    className="inline-flex min-h-11 items-center underline underline-offset-4"
                  >
                    Review reconciliation
                  </a>
                </div>
              )}
            </div>
          )}
          <AlertDialogFooter className="gap-2 sm:flex-wrap sm:space-x-0">
            <AlertDialogCancel className={controlClassName} disabled={busy}>
              Close
            </AlertDialogCancel>
            <AlertDialogAction
              className={controlClassName}
              disabled={actionsDisabled || !selected}
              onClick={(event) => {
                event.preventDefault();
                void confirmSync();
              }}
            >
              {busy && (
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin"
                  aria-hidden="true"
                />
              )}
              <span className="min-w-0 break-words">
                {busy ? "Syncing…" : "Confirm carrier sync"}
              </span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
