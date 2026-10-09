"use client";
import { useAuthStore } from "@/lib/stores/auth-store";

import Link from "next/link";
import { getRefundEligibility } from "@/lib/refund-eligibility";
import { useEffect, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileWarning, Loader2, Paperclip } from "lucide-react";
import { QueryErrorState } from "@/components/ui/state-panel";
import {
  DataTable,
  DataTableColumnHeader,
} from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency, formatDate, getErrorMessage } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  under_review: "Under review",
  resolved_buyer: "Resolved for buyer",
  resolved_seller: "Resolved for seller",
  closed: "Closed",
};

type DisputeStatus =
  | "open"
  | "under_review"
  | "resolved_buyer"
  | "resolved_seller"
  | "closed";

interface DisputeRow {
  refundEligibility: {
    canRefund: boolean;
    canPartialRefund: boolean;
    remainingCents: number;
    reason: string | null;
  };
  id: string;
  reason: string;
  reasonCode: string;
  status: DisputeStatus;
  reportedLate: boolean;
  reportingDeadlineAt: Date | string | null;
  createdAt: Date | string;
  evidence: Array<{ id: string; evidenceType: string }>;
  reconciliationCases: Array<{
    id: string;
    status: string;
    severity: string;
  }>;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    totalPrice: number;
    refundedAmount: number | null;
    paymentStatus: string | null;
    escrowStatus: string;
  };
  initiator: {
    id: string;
    name: string;
    businessName: string | null;
  };
}
function DisputeStatusBadge({ status }: { status: string }) {
  const variant =
    status === "open"
      ? "destructive"
      : status === "under_review"
        ? "warning"
        : status === "resolved_buyer" || status === "resolved_seller"
          ? "success"
          : "secondary";
  return (
    <Badge
      variant={variant as "default" | "destructive" | "secondary" | "outline"}
    >
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

// Parse operator-entered USD without truncation, exponent acceptance, or rounding.
function parseRefundCents(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export default function AdminDisputesPage() {
  const actor = useAuthStore((state) => state.user);
  if (actor?.role !== "admin")
    return <p role="status">Checking administrator access…</p>;
  return <DisputesQueue key={actor.id} actorId={actor.id} />;
}
function DisputesQueue({ actorId }: { actorId: string }) {
  const mounted = useRef(false);
  const working = useRef(false);
  const selection = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [detailFailed, setDetailFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState<Record<string, boolean>>({});
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

  const [page, setPage] = useState(1);
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<DisputeStatus | "all">(
    "all",
  );
  const [selectedDispute, setSelectedDispute] = useState<DisputeRow | null>(
    null,
  );
  const [resolution, setResolution] = useState("");
  const [outcome, setOutcome] = useState<
    "resolved_buyer" | "resolved_seller" | "closed" | ""
  >("");
  const [refundDollars, setRefundDollars] = useState("");
  const [confirmPartialSettlement, setConfirmPartialSettlement] =
    useState(false);

  const disputesQuery = trpc.dispute.getAllDisputes.useQuery({
    page,
    limit: 50,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const detailQuery = trpc.dispute.getDispute.useQuery(
    {
      disputeId: selectedDispute?.id ?? "00000000-0000-4000-8000-000000000000",
    },
    { enabled: Boolean(selectedDispute) },
  );
  const resolveMutation = trpc.dispute.resolve.useMutation({ retry: false });
  const currentEligibility = detailQuery.data?.order
    ? getRefundEligibility(detailQuery.data.order)
    : {
        canRefund: false,
        canPartialRefund: false,
        remainingCents: 0,
        reason: null,
      };
  const remainingRefundCents = currentEligibility?.remainingCents ?? 0;

  const queueUnavailable = disputesQuery.isError || readFailed;
  const detailHealthy =
    !!selectedDispute &&
    !!detailQuery.data &&
    detailQuery.data.id === selectedDispute.id &&
    !detailQuery.isError &&
    !detailFailed &&
    !detailQuery.isFetching;
  const activeProblem =
    problem ??
    (uncertain[selectedDispute?.id ?? ""]
      ? "Action result unconfirmed. Refresh detail before another attempt."
      : null);
  const decisionsBlocked =
    busy || !detailHealthy || !!uncertain[selectedDispute?.id ?? ""];
  if (
    disputesQuery.isSuccess &&
    !disputesQuery.isFetching &&
    page > Math.max(disputesQuery.data.totalPages, 1)
  )
    setPage(Math.max(disputesQuery.data.totalPages, 1));
  const refreshQueue = async () => {
    if (!current()) return;
    try {
      // Keep visited pages stale so a clamped page reads current rows.
      await utils.dispute.getAllDisputes.invalidate(undefined, {
        refetchType: "none",
      });
      if (!current()) return;
      const result = await disputesQuery.refetch({ throwOnError: true });
      if (!current()) return;
      setReadFailed(false);
      return result.data;
    } catch {
      if (current()) setReadFailed(true);
    }
  };
  const refreshDetail = async () => {
    const selectedId = selectedDispute?.id;
    if (!selectedId || busy || !current()) return;
    try {
      const result = await detailQuery.refetch({ throwOnError: true });
      if (
        !current() ||
        selection.current !== selectedId ||
        result.data?.id !== selectedId
      )
        return;
      setDetailFailed(false);
      setUncertain((previous) => {
        const next = { ...previous };
        delete next[selectedId];
        return next;
      });
      setProblem(null);
    } catch {
      if (current() && selection.current === selectedId) setDetailFailed(true);
    }
  };
  async function runDecision<T>(
    request: () => Promise<T>,
    message: string | ((result: T) => string),
    accepted?: () => void,
  ) {
    const selectedId = selectedDispute?.id;
    if (!selectedId || working.current || decisionsBlocked || !current())
      return;
    working.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await Promise.all([
        utils.dispute.getAllDisputes.cancel(),
        utils.dispute.getDispute.cancel(),
      ]);
      if (!current()) return;
      let result: T;
      try {
        result = await request();
      } catch (error) {
        if (!current()) return;
        const code = (error as { data?: { code?: string } }).data?.code;
        const known = [
          "BAD_REQUEST",
          "FORBIDDEN",
          "UNAUTHORIZED",
          "NOT_FOUND",
        ].includes(code ?? "");
        setProblem(
          known
            ? getErrorMessage(error)
            : code === "CONFLICT"
              ? "Action result unconfirmed. " +
                getErrorMessage(error) +
                " Refresh detail before another attempt."
              : "Action result unconfirmed. Refresh detail before another attempt.",
        );
        if (!known)
          setUncertain((previous) => ({ ...previous, [selectedId]: true }));
        return;
      }
      if (!current()) return;
      setNotice(typeof message === "function" ? message(result) : message);
      accepted?.();
      // A reconnect read started during the mutation must not restore old detail as fresh.
      await utils.dispute.getDispute.cancel({ disputeId: selectedId });
      if (!current()) return;
      await utils.reconciliation.list.invalidate(undefined, {
        refetchType: "none",
      });
      if (!current()) return;
      // Invalidate all visited page/filter inputs, then read the active queue.
      await utils.dispute.getAllDisputes.invalidate(undefined, {
        refetchType: "none",
      });
      if (!current()) return;
      await refreshQueue();
      if (!current()) return;
      await utils.dispute.getDispute.invalidate(undefined, {
        refetchType: "none",
      });
    } catch {
      if (current()) {
        setReadFailed(true);
      }
    } finally {
      if (current()) {
        working.current = false;
        setBusy(false);
      }
    }
  }

  function openReview(dispute: DisputeRow) {
    if (busy || queueUnavailable || !current()) return;
    setDetailFailed(false);
    setProblem(null);
    setNotice(null);
    selection.current = dispute.id;
    setSelectedDispute(dispute);
    setOutcome("");
    setResolution("");
    setConfirmPartialSettlement(false);
    const remaining = Math.max(
      0,
      Math.round(
        (dispute.order.totalPrice - Number(dispute.order.refundedAmount ?? 0)) *
          100,
      ),
    );
    setRefundDollars((remaining / 100).toFixed(2));
  }

  function closeReview() {
    selection.current = null;
    setSelectedDispute(null);
    setOutcome("");
    setResolution("");
    setRefundDollars("");
    setConfirmPartialSettlement(false);
  }

  const columns: ColumnDef<DisputeRow>[] = [
    {
      accessorKey: "order.orderNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Order" />
      ),
      cell: ({ row }) => (
        <Link
          className="font-mono text-sm text-primary underline"
          href={`/admin/orders?order=${row.original.order.id}`}
        >
          {row.original.order.orderNumber}
        </Link>
      ),
    },
    {
      accessorKey: "reason",
      header: "Claim",
      cell: ({ row }) => (
        <div className="max-w-[240px]">
          <p className="truncate text-sm font-medium">{row.original.reason}</p>
          <p className="text-xs text-muted-foreground">
            {row.original.evidence.length} evidence item
            {row.original.evidence.length === 1 ? "" : "s"}
            {row.original.reportedLate ? " · Late override" : ""}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "initiator",
      header: "Buyer",
      cell: ({ row }) =>
        row.original.initiator.businessName || row.original.initiator.name,
    },
    {
      accessorKey: "order.totalPrice",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Order amount" />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <p>{formatCurrency(row.original.order.totalPrice)}</p>
          {Number(row.original.order.refundedAmount ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">
              {formatCurrency(row.original.order.refundedAmount ?? 0)} refunded
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="space-y-1">
          <DisputeStatusBadge status={row.original.status} />
          {row.original.reconciliationCases.length > 0 && (
            <Badge variant="destructive" className="block w-fit">
              Ops case open
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Reported" />
      ),
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          className="h-auto min-h-11 max-w-full whitespace-normal py-2"
          disabled={busy}
          onClick={() => openReview(row.original)}
        >
          Review
        </Button>
      ),
    },
  ];

  const detail = detailQuery.data;
  const effectiveRefundDollars = currentEligibility.canPartialRefund
    ? refundDollars
    : (remainingRefundCents / 100).toFixed(2);
  const refundCents = parseRefundCents(effectiveRefundDollars);
  const isPartial =
    outcome === "resolved_buyer" &&
    refundCents !== null &&
    refundCents > 0 &&
    refundCents < remainingRefundCents;
  const canResolve =
    selectedDispute &&
    detailHealthy &&
    !["resolved_buyer", "resolved_seller", "closed"].includes(
      detailQuery.data?.status ?? selectedDispute.status,
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Claims and disputes</h1>
          <p className="mt-1 text-muted-foreground">
            Review delivery evidence, payment state, and final settlement from
            one record.
          </p>
        </div>
        <div className="w-52 space-y-1">
          <Label htmlFor="claimStatusFilter">Status</Label>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as DisputeStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger id="claimStatusFilter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All claims</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {notice && !selectedDispute ? <p role="status">{notice}</p> : null}
      <Button
        variant="outline"
        className="h-auto min-h-11 max-w-full whitespace-normal py-2"
        disabled={busy || disputesQuery.isFetching}
        onClick={() => void refreshQueue()}
      >
        Refresh queue
      </Button>
      {queueUnavailable ? (
        <QueryErrorState
          title="Claims unavailable"
          onRetry={() => void refreshQueue()}
          isRetrying={disputesQuery.isFetching}
        />
      ) : disputesQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : disputesQuery.data ? (
        <DataTable
          columns={columns}
          data={disputesQuery.data.disputes as DisputeRow[]}
          serverPagination={{
            page,
            pageSize: 50,
            total: disputesQuery.data.total,
            totalPages: disputesQuery.data.totalPages,
            onPageChange: setPage,
            isFetching: disputesQuery.isFetching || busy,
          }}
          renderMobileRow={(row) => (
            <div className="min-w-0 space-y-2">
              <Link
                href={`/admin/orders?order=${row.order.id}`}
                className="font-mono text-sm underline"
              >
                {row.order.orderNumber}
              </Link>
              <p className="break-words font-medium">{row.reason}</p>
              <p className="text-sm">
                {row.initiator.businessName || row.initiator.name} ·{" "}
                {formatCurrency(row.order.totalPrice)}
              </p>
              <DisputeStatusBadge status={row.status} />
              <div>
                <Button
                  variant="outline"
                  className="h-auto min-h-11 max-w-full whitespace-normal py-2"
                  disabled={busy}
                  onClick={() => openReview(row)}
                >
                  Review
                </Button>
              </div>
            </div>
          )}
        />
      ) : (
        <div className="rounded-lg border py-12 text-center">
          <FileWarning className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">No claims match this status.</p>
        </div>
      )}

      <Dialog
        open={Boolean(selectedDispute)}
        onOpenChange={(open) => !open && !busy && closeReview()}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Claim for order {selectedDispute?.order.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Review the buyer report, carrier documents, uploaded evidence,
              prior refunds, and any operational exception before resolving.
            </DialogDescription>
          </DialogHeader>

          {notice ? (
            <p role="status" className="text-sm font-medium">
              {notice}
            </p>
          ) : null}
          {activeProblem ? (
            <p role="alert" className="text-sm text-destructive">
              {activeProblem}
            </p>
          ) : null}
          <Button
            variant="outline"
            className="h-auto min-h-11 max-w-full whitespace-normal py-2"
            disabled={busy || detailQuery.isFetching}
            onClick={() => void refreshDetail()}
          >
            Refresh detail
          </Button>
          {detailQuery.isError || detailFailed ? (
            <div role="alert" className="space-y-2">
              <p>
                Current claim detail could not be loaded. Review the latest
                detail before acting.
              </p>
              <Button
                variant="outline"
                className="h-auto min-h-11 max-w-full whitespace-normal py-2"
                disabled={busy || detailQuery.isFetching}
                onClick={() => void refreshDetail()}
              >
                Retry detail
              </Button>
            </div>
          ) : detailQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : detail ? (
            <div className="space-y-5 py-2">
              <div className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Issue
                  </p>
                  <p className="font-medium">{detail.reason}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Claim window
                  </p>
                  <p className="text-sm">
                    {detail.reportedLate ? "Admin late override" : "On time"}
                    {detail.reportingDeadlineAt
                      ? ` · deadline ${formatDate(detail.reportingDeadlineAt)}`
                      : ""}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs uppercase text-muted-foreground">
                    Buyer description
                  </p>
                  <p className="whitespace-pre-wrap text-sm">
                    {detail.description}
                  </p>
                </div>
                {detail.reasonCode === "freight_damage" && (
                  <>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">
                        Visible at delivery
                      </p>
                      <p className="text-sm">
                        {detail.damageVisibleAtDelivery ? "Yes" : "No"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">
                        Noted on BOL
                      </p>
                      <p className="text-sm">
                        {detail.bolDamageNoted ? "Yes" : "No"}
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div>
                <h3 className="mb-2 font-semibold">
                  Evidence ({detail.evidence.length})
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {detail.evidence.map((item) => (
                    <a
                      key={item.id}
                      href={`/api/disputes/evidence/${item.media.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted"
                    >
                      <Paperclip className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">
                        {item.media.fileName || item.evidenceType}
                      </span>
                      <Badge variant="outline" className="ml-auto">
                        {item.evidenceType.replaceAll("_", " ")}
                      </Badge>
                    </a>
                  ))}
                </div>
              </div>

              <Separator />

              {canResolve && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="claimOutcome">Outcome</Label>
                    <Select
                      value={outcome}
                      onValueChange={(value) =>
                        setOutcome(
                          value as
                            | "resolved_buyer"
                            | "resolved_seller"
                            | "closed",
                        )
                      }
                    >
                      <SelectTrigger
                        id="claimOutcome"
                        disabled={decisionsBlocked}
                      >
                        <SelectValue placeholder="Choose a final outcome" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value="resolved_buyer"
                          disabled={!currentEligibility.canRefund}
                        >
                          Buyer remedy — refund and close
                        </SelectItem>
                        <SelectItem value="resolved_seller">
                          Seller favor — close and recheck payout
                        </SelectItem>
                        <SelectItem value="closed">
                          Administrative closure — no money movement
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {outcome === "resolved_buyer" && (
                    <div className="space-y-3 rounded-md border p-4">
                      <div className="space-y-2">
                        <Label htmlFor="claimRefundAmount">
                          Final refund amount
                        </Label>
                        <Input
                          id="claimRefundAmount"
                          type="text"
                          inputMode="decimal"
                          aria-describedby="claimRefundHelp"
                          aria-invalid={
                            refundCents === null ||
                            refundCents > remainingRefundCents
                          }
                          disabled={decisionsBlocked}
                          readOnly={!currentEligibility.canPartialRefund}
                          value={effectiveRefundDollars}
                          onChange={(event) =>
                            setRefundDollars(event.target.value)
                          }
                        />
                        <p
                          id="claimRefundHelp"
                          className="text-xs text-muted-foreground"
                        >
                          Enter USD with at most two decimal places. Remaining
                          refundable balance:{" "}
                          {formatCurrency(remainingRefundCents / 100)}.
                        </p>
                      </div>
                      {currentEligibility.reason && (
                        <p
                          role="status"
                          className="text-sm text-muted-foreground"
                        >
                          {currentEligibility.reason}
                        </p>
                      )}
                      {isPartial && currentEligibility.canPartialRefund && (
                        <div className="flex items-center justify-between gap-4 rounded-md bg-amber-50 p-3 dark:bg-amber-950/30">
                          <div>
                            <Label htmlFor="confirmPartial">
                              Confirm final partial settlement
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              The claim will close even though part of the order
                              remains paid.
                            </p>
                          </div>
                          <Switch
                            id="confirmPartial"
                            disabled={decisionsBlocked}
                            checked={confirmPartialSettlement}
                            onCheckedChange={setConfirmPartialSettlement}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="claimResolution">
                      Resolution and evidence considered
                    </Label>
                    <Textarea
                      disabled={decisionsBlocked}
                      id="claimResolution"
                      value={resolution}
                      onChange={(event) => setResolution(event.target.value)}
                      rows={5}
                      maxLength={5000}
                      placeholder="Document the evidence reviewed, decision, money movement, carrier responsibility, and follow-up."
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="py-8 text-sm text-destructive">
              Claim detail could not be loaded.
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              className="h-auto min-h-11 max-w-full whitespace-normal py-2"
              disabled={busy}
              onClick={closeReview}
            >
              Close
            </Button>
            {canResolve && (
              <Button
                className="h-auto min-h-11 max-w-full whitespace-normal py-2"
                disabled={
                  decisionsBlocked ||
                  !outcome ||
                  resolution.trim().length < 10 ||
                  resolveMutation.isPending ||
                  (outcome === "resolved_buyer" &&
                    (!currentEligibility.canRefund ||
                      (isPartial && !currentEligibility.canPartialRefund) ||
                      refundCents === null ||
                      refundCents <= 0 ||
                      refundCents > remainingRefundCents ||
                      (isPartial && !confirmPartialSettlement)))
                }
                onClick={() => {
                  if (!selectedDispute || !outcome || decisionsBlocked) return;
                  if (
                    outcome === "resolved_buyer" &&
                    (refundCents === null ||
                      refundCents > remainingRefundCents ||
                      refundCents <= 0 ||
                      (isPartial && !confirmPartialSettlement))
                  )
                    return;
                  if (
                    outcome === "resolved_buyer" &&
                    (!currentEligibility.canRefund ||
                      (isPartial && !currentEligibility.canPartialRefund))
                  )
                    return;
                  void runDecision(
                    () =>
                      resolveMutation.mutateAsync({
                        disputeId: selectedDispute.id,
                        resolution: resolution.trim(),
                        outcome,
                        ...(outcome === "resolved_buyer"
                          ? {
                              refundAmountCents: refundCents!,
                              ...(isPartial
                                ? { confirmPartialSettlement: true as const }
                                : {}),
                            }
                          : {}),
                      }),
                    (result) =>
                      result.payoutRequeued
                        ? "Claim resolved and seller payout requeued."
                        : "Claim resolved successfully.",
                    closeReview,
                  );
                }}
              >
                {resolveMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Resolve claim
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
