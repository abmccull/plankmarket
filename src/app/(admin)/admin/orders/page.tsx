"use client";

import { useEffect, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import type { ColumnDef } from "@tanstack/react-table";
import type { OrderStatus } from "@/types";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { DataTable } from "@/components/admin/data-table";
import { OrderStatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  QueryErrorState,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { formatCurrency, formatDate, getErrorMessage } from "@/lib/utils";

type Order =
  inferRouterOutputs<AppRouter>["admin"]["getOrders"]["orders"][number];
type Action = { kind: "refund" | "cancel"; order: Order };
const TERMINAL_STATUSES: OrderStatus[] = ["cancelled", "refunded", "delivered"];
const LIMIT = 25;

function paymentLabel(status: string | null): string {
  return (
    (
      {
        refund_pending: "Refund pending",
        partially_refunded: "Partially refunded",
        reconciliation_required: "Needs reconciliation",
        succeeded: "Paid",
      } as Record<string, string>
    )[status ?? ""] ??
    status ??
    "Unknown"
  );
}

// Parse operator-entered USD without truncation, exponent acceptance, or rounding.
function refundCents(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export default function AdminOrdersPage() {
  const user = useAuthStore((state) => state.user);
  return user?.role === "admin" ? (
    <OrdersQueue key={user.id} actorId={user.id} />
  ) : (
    <StatePanelLoading label="Checking administrator access" rows={2} />
  );
}

function OrdersQueue({ actorId }: { actorId: string }) {
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const query = trpc.admin.getOrders.useQuery({
    page,
    limit: LIMIT,
    orderNumber: orderNumber || undefined,
  });
  const utils = trpc.useUtils();
  const refund = trpc.admin.refundOrder.useMutation({ retry: false });
  const cancel = trpc.admin.forceCancelOrder.useMutation({ retry: false });
  const mounted = useRef(false);
  const working = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () =>
    mounted.current &&
    useAuthStore.getState().user?.id === actorId &&
    useAuthStore.getState().user?.role === "admin";
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [uncertainOrderIds, setUncertainOrderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [receipt, setReceipt] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const parsedCents = refundCents(amount);
  const amountValid =
    parsedCents !== null &&
    !!action &&
    parsedCents <= Math.round(action.order.totalPrice * 100);
  const stillEligible =
    !!action &&
    (action.kind === "refund"
      ? action.order.paymentStatus === "succeeded"
      : !TERMINAL_STATUSES.includes(action.order.status));

  function openAction(kind: Action["kind"], order: Order) {
    if (working.current || query.isError || !current()) return;
    setAction({ kind, order });
    setReason("");
    setAmount(order.totalPrice.toFixed(2));
    setActionError(
      uncertainOrderIds.has(order.id)
        ? "The previous result is unconfirmed. Refresh order status before another attempt."
        : null,
    );
    setReviewRequired(uncertainOrderIds.has(order.id));
  }

  async function refreshQueue(invalidateAll = false) {
    try {
      if (!current()) return;
      if (invalidateAll) {
        await utils.admin.getOrders.invalidate(undefined, {
          refetchType: "none",
        });
        if (!current()) return;
      }
      const result = await query.refetch();
      if (current()) setRefreshFailed(result.isError);
    } catch {
      if (current()) setRefreshFailed(true);
    }
  }

  async function refreshSelected() {
    if (!action || working.current || !current()) return;
    const selected = action;
    working.current = true;
    setBusy(true);
    try {
      const result = await utils.client.admin.getOrders.query({
        page: 1,
        limit: 100,
        orderNumber: selected.order.orderNumber,
      });
      if (!current()) return;
      const latest = result.orders.find(
        (order) => order.id === selected.order.id,
      );
      if (!latest)
        throw new Error(
          "This order could not be found. Keep this action on hold.",
        );
      setAction({ ...selected, order: latest });
      setReviewRequired(false);
      setUncertainOrderIds((ids) => {
        const next = new Set(ids);
        next.delete(selected.order.id);
        return next;
      });
      setActionError(
        "Order status refreshed. Review its payment status and Stripe refund history before confirming another attempt.",
      );
      await refreshQueue(true);
    } catch (error) {
      if (current())
        setActionError(
          getErrorMessage(
            error,
            "Order status is unavailable. Keep this action on hold.",
          ),
        );
    } finally {
      working.current = false;
      if (current()) setBusy(false);
    }
  }

  async function submitAction() {
    if (
      !action ||
      working.current ||
      query.isError ||
      reviewRequired ||
      !stillEligible ||
      !reason.trim() ||
      reason.length > 500 ||
      (action.kind === "refund" && !amountValid) ||
      !current()
    )
      return;
    const selected = action;
    const submittedReason = reason.trim();
    working.current = true;
    setBusy(true);
    setActionError(null);
    try {
      let message: string;
      if (selected.kind === "refund") {
        const result = await refund.mutateAsync({
          orderId: selected.order.id,
          amountCents: parsedCents!,
          reason: submittedReason,
        });
        message =
          result.refundState === "refund_pending"
            ? `Refund of ${formatCurrency(result.amountRefunded)} submitted; pending Stripe confirmation.`
            : result.refundState === "reconciliation_required"
              ? `Refund of ${formatCurrency(result.amountRefunded)} requires manual reconciliation.`
              : `Refund of ${formatCurrency(result.amountRefunded)} processed.`;
      } else {
        const result = await cancel.mutateAsync({
          orderId: selected.order.id,
          reason: submittedReason,
        });
        message =
          result.refundState === "refund_pending"
            ? "Cancellation requested; refund pending Stripe confirmation."
            : result.refundState === "reconciliation_required"
              ? "Cancellation refund requires manual reconciliation."
              : "Order cancellation completed.";
      }
      if (!current()) return;
      setReceipt(`${selected.order.orderNumber}: ${message}`);
      setAction(null);
      setReason("");
      setAmount("");
      // A failed follow-up read cannot undo an accepted operation or resubmit it.
      await refreshQueue(true);
    } catch (error) {
      if (current()) {
        setActionError(
          `${getErrorMessage(error)} The result is not confirmed here. Refresh the order status and review Stripe refund history before another attempt.`,
        );
        setReviewRequired(true);
        setUncertainOrderIds((ids) => new Set(ids).add(selected.order.id));
      }
    } finally {
      working.current = false;
      if (current()) setBusy(false);
    }
  }

  function actions(order: Order) {
    const canRefund = order.paymentStatus === "succeeded";
    const canCancel = !TERMINAL_STATUSES.includes(order.status);
    if (!canRefund && !canCancel)
      return (
        <span className="text-sm text-muted-foreground">
          No available actions
        </span>
      );
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="min-h-11"
            aria-label={`Actions for ${order.orderNumber}`}
            disabled={busy || query.isError}
          >
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canRefund && (
            <DropdownMenuItem onSelect={() => openAction("refund", order)}>
              Refund
            </DropdownMenuItem>
          )}
          {canCancel && (
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => openAction("cancel", order)}
            >
              Force cancel
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const columns: ColumnDef<Order>[] = [
    {
      accessorKey: "orderNumber",
      header: "Order #",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.orderNumber}</span>
      ),
    },
    {
      id: "buyer",
      header: "Buyer",
      cell: ({ row }) =>
        row.original.buyer.businessName || row.original.buyer.name,
    },
    {
      id: "seller",
      header: "Seller",
      cell: ({ row }) =>
        row.original.seller.businessName || row.original.seller.name,
    },
    {
      accessorKey: "totalPrice",
      header: "Amount",
      cell: ({ row }) => formatCurrency(row.original.totalPrice),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "paymentStatus",
      header: "Payment",
      cell: ({ row }) => paymentLabel(row.original.paymentStatus),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => actions(row.original),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Order Management</h1>
        <p className="mt-1 text-muted-foreground">
          Review orders and manage cancellations and refunds.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (working.current || !current()) return;
          setPage(1);
          setOrderNumber(searchDraft.trim());
        }}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="order-search">Search order number</Label>
          <Input
            id="order-search"
            disabled={busy}
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
        </div>
        <Button type="submit" className="min-h-11" disabled={busy}>
          Search
        </Button>
      </form>
      {receipt && (
        <div role="status" className="space-y-2 rounded-md border p-4">
          <p>{receipt}</p>
          {refreshFailed && (
            <>
              <p>
                The action was accepted, but the order list could not be
                refreshed.
              </p>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => void refreshQueue()}
                disabled={query.isFetching}
              >
                Refresh orders
              </Button>
            </>
          )}
        </div>
      )}
      {query.isError ? (
        <QueryErrorState
          title="Orders unavailable"
          description="Order status could not be checked. Refresh the list before taking action."
          onRetry={() => void refreshQueue()}
          isRetrying={query.isFetching}
        />
      ) : query.isLoading ? (
        <StatePanelLoading label="Loading orders" />
      ) : query.data ? (
        <DataTable
          columns={columns}
          data={query.data.orders}
          serverPagination={{
            page,
            pageSize: LIMIT,
            total: query.data.total,
            totalPages: query.data.totalPages,
            onPageChange: (next) => {
              if (!working.current && current()) setPage(next);
            },
            isFetching: query.isFetching || busy,
          }}
          renderMobileRow={(order) => (
            <article
              className="min-w-0 space-y-3"
              aria-label={`Order ${order.orderNumber}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="break-all font-mono font-semibold">
                  {order.orderNumber}
                </h2>
                <span className="font-semibold">
                  {formatCurrency(order.totalPrice)}
                </span>
              </div>
              <dl className="space-y-1 text-sm">
                <div>
                  <dt className="inline text-muted-foreground">Buyer: </dt>
                  <dd className="inline break-words">
                    {order.buyer.businessName || order.buyer.name}
                  </dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Seller: </dt>
                  <dd className="inline break-words">
                    {order.seller.businessName || order.seller.name}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-center gap-2">
                <OrderStatusBadge status={order.status} />
                <span className="text-sm">
                  {paymentLabel(order.paymentStatus)}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">
                  {formatDate(order.createdAt)}
                </span>
                {actions(order)}
              </div>
            </article>
          )}
        />
      ) : null}
      <AlertDialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !working.current) setAction(null);
        }}
      >
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {action?.kind === "refund"
                ? "Refund order"
                : "Force cancel order"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {action?.order.orderNumber} ·{" "}
              {action?.order.buyer.businessName || action?.order.buyer.name}
              <br />
              {action?.kind === "refund"
                ? "Submit this amount to Stripe. Buyer and seller confirmation is sent only after Stripe confirms success. Refund eligibility and the remaining balance are checked before processing."
                : "Cancel this order and notify the buyer and seller. Paid orders require a refund; a pending refund is not a completed cancellation."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            {action?.kind === "refund" && (
              <div className="space-y-2">
                <Label htmlFor="refundAmount">Refund amount (USD)</Label>
                <Input
                  id="refundAmount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={busy}
                  aria-invalid={!amountValid}
                  aria-describedby="refund-amount-help"
                />
                <p
                  id="refund-amount-help"
                  className="text-sm text-muted-foreground"
                >
                  {amountValid
                    ? `Confirm ${formatCurrency(parsedCents! / 100)} refund.`
                    : "Enter a positive dollar amount with at most two decimal places, no greater than the order total."}{" "}
                  Order total: {formatCurrency(action.order.totalPrice)}.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="order-action-reason">Reason</Label>
              <Textarea
                id="order-action-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                disabled={busy}
                rows={3}
              />
              <p className="text-sm text-muted-foreground">
                The reason may appear in the buyer and seller notification.
              </p>
            </div>
            {actionError && (
              <div role="alert" className="space-y-2 text-sm">
                <p>{actionError}</p>
                {reviewRequired && (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => void refreshSelected()}
                    disabled={busy}
                  >
                    Refresh order status
                  </Button>
                )}
              </div>
            )}
            {!stillEligible && action && (
              <p role="status" className="text-sm">
                The current order status does not allow this action.
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={busy}>
              Close
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              disabled={
                busy ||
                query.isError ||
                reviewRequired ||
                !stillEligible ||
                !reason.trim() ||
                reason.length > 500 ||
                (action?.kind === "refund" && !amountValid)
              }
              onClick={(event) => {
                event.preventDefault();
                void submitAction();
              }}
            >
              {busy
                ? "Submitting…"
                : action?.kind === "refund"
                  ? "Confirm refund"
                  : "Confirm cancellation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
