"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileWarning, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { DataTable, DataTableColumnHeader } from "@/components/admin/data-table";
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
import {
  formatCurrency,
  formatDate,
  getErrorMessage,
} from "@/lib/utils";

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
      variant={
        variant as
          | "default"
          | "destructive"
          | "secondary"
          | "outline"
      }
    >
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

export default function AdminDisputesPage() {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<DisputeStatus | "all">(
    "all",
  );
  const [selectedDispute, setSelectedDispute] =
    useState<DisputeRow | null>(null);
  const [resolution, setResolution] = useState("");
  const [outcome, setOutcome] = useState<
    "resolved_buyer" | "resolved_seller" | "closed" | ""
  >("");
  const [refundDollars, setRefundDollars] = useState("");
  const [confirmPartialSettlement, setConfirmPartialSettlement] =
    useState(false);

  const disputesQuery = trpc.dispute.getAllDisputes.useQuery({
    page: 1,
    limit: 50,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const detailQuery = trpc.dispute.getDispute.useQuery(
    { disputeId: selectedDispute?.id ?? "00000000-0000-4000-8000-000000000000" },
    { enabled: Boolean(selectedDispute) },
  );
  const resolveMutation = trpc.dispute.resolve.useMutation({
    onSuccess: async (result) => {
      toast.success(
        result.payoutRequeued
          ? "Claim resolved and seller payout requeued."
          : "Claim resolved successfully.",
      );
      await Promise.all([
        utils.dispute.getAllDisputes.invalidate(),
        utils.dispute.getDispute.invalidate(),
        utils.reconciliation.list.invalidate(),
      ]);
      closeReview();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const remainingRefundCents = useMemo(() => {
    if (!selectedDispute) return 0;
    return Math.max(
      0,
      Math.round(
        (selectedDispute.order.totalPrice -
          Number(selectedDispute.order.refundedAmount ?? 0)) *
          100,
      ),
    );
  }, [selectedDispute]);

  function openReview(dispute: DisputeRow) {
    setSelectedDispute(dispute);
    setOutcome("");
    setResolution("");
    setRefundDollars((remainingRefundCents / 100).toFixed(2));
    setConfirmPartialSettlement(false);
    const remaining = Math.max(
      0,
      Math.round(
        (dispute.order.totalPrice -
          Number(dispute.order.refundedAmount ?? 0)) *
          100,
      ),
    );
    setRefundDollars((remaining / 100).toFixed(2));
  }

  function closeReview() {
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
          onClick={() => openReview(row.original)}
        >
          Review
        </Button>
      ),
    },
  ];

  const detail = detailQuery.data;
  const refundCents = Math.round(Number(refundDollars || 0) * 100);
  const isPartial =
    outcome === "resolved_buyer" &&
    refundCents > 0 &&
    refundCents < remainingRefundCents;
  const canResolve =
    selectedDispute &&
    !["resolved_buyer", "resolved_seller", "closed"].includes(
      selectedDispute.status,
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
            onValueChange={(value) =>
              setStatusFilter(value as DisputeStatus | "all")
            }
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

      {disputesQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : disputesQuery.data?.disputes.length ? (
        <DataTable
          columns={columns}
          data={disputesQuery.data.disputes as DisputeRow[]}
        />
      ) : (
        <div className="rounded-lg border py-12 text-center">
          <FileWarning className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">
            No claims match this status.
          </p>
        </div>
      )}

      <Dialog
        open={Boolean(selectedDispute)}
        onOpenChange={(open) => !open && closeReview()}
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

          {detailQuery.isLoading ? (
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
                      href={item.media.url}
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
                    <Label>Outcome</Label>
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
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a final outcome" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="resolved_buyer">
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
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={(remainingRefundCents / 100).toFixed(2)}
                          value={refundDollars}
                          onChange={(event) =>
                            setRefundDollars(event.target.value)
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Remaining refundable balance:{" "}
                          {formatCurrency(remainingRefundCents / 100)}.
                        </p>
                      </div>
                      {isPartial && (
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
            <Button variant="outline" onClick={closeReview}>
              Close
            </Button>
            {canResolve && (
              <Button
                disabled={
                  !outcome ||
                  resolution.trim().length < 10 ||
                  resolveMutation.isPending ||
                  (outcome === "resolved_buyer" &&
                    (refundCents <= 0 ||
                      refundCents > remainingRefundCents ||
                      (isPartial && !confirmPartialSettlement)))
                }
                onClick={() => {
                  if (!selectedDispute || !outcome) return;
                  resolveMutation.mutate({
                    disputeId: selectedDispute.id,
                    resolution: resolution.trim(),
                    outcome,
                    ...(outcome === "resolved_buyer"
                      ? {
                          refundAmountCents: refundCents,
                          ...(isPartial
                            ? { confirmPartialSettlement: true as const }
                            : {}),
                        }
                      : {}),
                  });
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
