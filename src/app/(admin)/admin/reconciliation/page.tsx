"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertOctagon,
  CircleDot,
  ClipboardCheck,
  Loader2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { DataTable, DataTableColumnHeader } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { formatCurrency, formatDate, getErrorMessage } from "@/lib/utils";

type CaseStatus =
  | "open"
  | "in_progress"
  | "waiting_external"
  | "resolved"
  | "dismissed";
type CaseSeverity = "low" | "medium" | "high" | "critical";

interface CaseRow {
  id: string;
  caseKey: string;
  title: string;
  summary: string;
  status: CaseStatus;
  severity: CaseSeverity;
  type: string;
  source: string;
  amountCents: number | null;
  firstDetectedAt: Date | string;
  updatedAt: Date | string;
  assignedTo: string | null;
  assignee: { id: string; name: string; email: string } | null;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string | null;
    escrowStatus: string;
  } | null;
}

const STATUS_LABELS: Record<CaseStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_external: "Waiting external",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

const SEVERITY_VARIANT: Record<
  CaseSeverity,
  "outline" | "secondary" | "warning" | "destructive"
> = {
  low: "outline",
  medium: "secondary",
  high: "warning",
  critical: "destructive",
};

export default function ReconciliationCasesPage() {
  const utils = trpc.useUtils();
  const { user } = useAuthStore();
  const [status, setStatus] = useState<CaseStatus | "active">("active");
  const [severity, setSeverity] = useState<CaseSeverity | "all">("all");
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);
  const [nextStatus, setNextStatus] = useState<CaseStatus | "">("");
  const [resolution, setResolution] = useState("");
  const [note, setNote] = useState("");

  const listQuery = trpc.reconciliation.list.useQuery({
    page: 1,
    limit: 50,
    status,
    severity: severity === "all" ? undefined : severity,
  });
  const detailQuery = trpc.reconciliation.getById.useQuery(
    {
      caseId:
        selectedCase?.id ?? "00000000-0000-4000-8000-000000000000",
    },
    { enabled: Boolean(selectedCase) },
  );
  const updateStatus = trpc.reconciliation.updateStatus.useMutation({
    onSuccess: async () => {
      toast.success("Reconciliation case updated.");
      setNextStatus("");
      setResolution("");
      await Promise.all([
        utils.reconciliation.list.invalidate(),
        utils.reconciliation.getById.invalidate(),
      ]);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const assign = trpc.reconciliation.assign.useMutation({
    onSuccess: async () => {
      toast.success("Case assignment updated.");
      await Promise.all([
        utils.reconciliation.list.invalidate(),
        utils.reconciliation.getById.invalidate(),
      ]);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const addNote = trpc.reconciliation.addNote.useMutation({
    onSuccess: async () => {
      setNote("");
      toast.success("Case note added.");
      await Promise.all([
        utils.reconciliation.list.invalidate(),
        utils.reconciliation.getById.invalidate(),
      ]);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const rows = (listQuery.data?.items ?? []) as CaseRow[];

  const columns: ColumnDef<CaseRow>[] = [
    {
      accessorKey: "severity",
      header: "Severity",
      cell: ({ row }) => (
        <Badge variant={SEVERITY_VARIANT[row.original.severity]}>
          {row.original.severity}
        </Badge>
      ),
    },
    {
      accessorKey: "title",
      header: "Operational exception",
      cell: ({ row }) => (
        <div className="max-w-[380px]">
          <p className="truncate font-medium">{row.original.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.original.type.replaceAll("_", " ")} · {row.original.source}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "order.orderNumber",
      header: "Order",
      cell: ({ row }) =>
        row.original.order ? (
          <span className="font-mono text-sm">
            {row.original.order.orderNumber}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant="outline">{STATUS_LABELS[row.original.status]}</Badge>
      ),
    },
    {
      accessorKey: "assignee",
      header: "Owner",
      cell: ({ row }) =>
        row.original.assignee?.name ?? (
          <span className="text-amber-700">Unassigned</span>
        ),
    },
    {
      accessorKey: "firstDetectedAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Detected" />
      ),
      cell: ({ row }) => formatDate(row.original.firstDetectedAt),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSelectedCase(row.original);
            setNextStatus(row.original.status);
          }}
        >
          Open
        </Button>
      ),
    },
  ];

  const detail = detailQuery.data;
  const terminal =
    nextStatus === "resolved" || nextStatus === "dismissed";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reconciliation control plane</h1>
        <p className="mt-1 text-muted-foreground">
          Durable ownership and audit history for money, provider, shipment,
          webhook, and data-integrity exceptions.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CircleDot className="h-4 w-4" />
              Active cases
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {listQuery.data?.openCount ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertOctagon className="h-4 w-4" />
              Critical active
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-destructive">
            {listQuery.data?.criticalOpenCount ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <UserCheck className="h-4 w-4" />
              Unassigned shown
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {rows.filter((item) => !item.assignedTo).length}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="w-52 space-y-1">
          <Label>Status</Label>
          <Select
            value={status}
            onValueChange={(value) =>
              setStatus(value as CaseStatus | "active")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">All active</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-52 space-y-1">
          <Label>Severity</Label>
          <Select
            value={severity}
            onValueChange={(value) =>
              setSeverity(value as CaseSeverity | "all")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {(["critical", "high", "medium", "low"] as const).map(
                (value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {listQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : rows.length > 0 ? (
        <DataTable columns={columns} data={rows} />
      ) : (
        <div className="rounded-lg border py-12 text-center text-muted-foreground">
          No reconciliation cases match these filters.
        </div>
      )}

      <Dialog
        open={Boolean(selectedCase)}
        onOpenChange={(open) => !open && setSelectedCase(null)}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail?.title ?? selectedCase?.title}</DialogTitle>
            <DialogDescription>
              {detail?.caseKey ?? selectedCase?.caseKey}
            </DialogDescription>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : detail ? (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant={SEVERITY_VARIANT[detail.severity]}>
                  {detail.severity}
                </Badge>
                <Badge variant="outline">
                  {STATUS_LABELS[detail.status]}
                </Badge>
                <Badge variant="secondary">
                  {detail.type.replaceAll("_", " ")}
                </Badge>
              </div>

              <p className="whitespace-pre-wrap text-sm">{detail.summary}</p>
              <div className="grid gap-3 rounded-md border p-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Order
                  </p>
                  <p>{detail.order?.orderNumber ?? "Not linked"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Amount
                  </p>
                  <p>
                    {detail.amountCents === null
                      ? "Not recorded"
                      : formatCurrency(detail.amountCents / 100)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Owner
                  </p>
                  <p>{detail.assignee?.name ?? "Unassigned"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Attempts
                  </p>
                  <p>{detail.attemptCount}</p>
                </div>
              </div>

              {Object.keys(detail.details).length > 0 && (
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Structured diagnostic context
                  </summary>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(detail.details, null, 2)}
                  </pre>
                </details>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    assign.mutate({
                      caseId: detail.id,
                      assigneeId: detail.assignedTo ? null : (user?.id ?? null),
                    })
                  }
                  disabled={assign.isPending || (!detail.assignedTo && !user?.id)}
                >
                  {detail.assignedTo ? "Return to queue" : "Assign to me"}
                </Button>
              </div>

              <Separator />

              <div className="space-y-3">
                <h3 className="font-semibold">Update status</h3>
                <Select
                  value={nextStatus}
                  onValueChange={(value) =>
                    setNextStatus(value as CaseStatus)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose status" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {terminal && (
                  <Textarea
                    value={resolution}
                    onChange={(event) => setResolution(event.target.value)}
                    placeholder="Document the evidence, corrective action, provider state, and final verification."
                    rows={4}
                    maxLength={5000}
                  />
                )}
                <Button
                  size="sm"
                  disabled={
                    !nextStatus ||
                    updateStatus.isPending ||
                    (terminal && resolution.trim().length < 10)
                  }
                  onClick={() =>
                    updateStatus.mutate({
                      caseId: detail.id,
                      status: nextStatus as CaseStatus,
                      ...(terminal
                        ? { resolution: resolution.trim() }
                        : {}),
                    })
                  }
                >
                  Save status
                </Button>
              </div>

              <Separator />

              <div className="space-y-3">
                <h3 className="font-semibold">Case notes</h3>
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Record a provider call, reconciliation check, or next action."
                  rows={3}
                  maxLength={5000}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={note.trim().length < 2 || addNote.isPending}
                  onClick={() =>
                    addNote.mutate({
                      caseId: detail.id,
                      message: note.trim(),
                    })
                  }
                >
                  Add note
                </Button>
              </div>

              <div>
                <h3 className="mb-3 flex items-center gap-2 font-semibold">
                  <ClipboardCheck className="h-4 w-4" />
                  Audit history
                </h3>
                <div className="space-y-3">
                  {detail.events.map((event) => (
                    <div
                      key={event.id}
                      className="border-l-2 pl-3 text-sm"
                    >
                      <p>{event.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(event.createdAt)} ·{" "}
                        {event.actor?.name ?? "System"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="py-8 text-sm text-destructive">
              Case detail could not be loaded.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedCase(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
