"use client";

import { useEffect, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertOctagon,
  CircleDot,
  ClipboardCheck,
  Loader2,
  UserCheck,
} from "lucide-react";
import { QueryErrorState } from "@/components/ui/state-panel";
import {
  DataTable,
  DataTableColumnHeader,
} from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const actor = useAuthStore((state) => state.user);
  if (actor?.role !== "admin")
    return <p role="status">Checking administrator access…</p>;
  return <ReconciliationQueue key={actor.id} actorId={actor.id} />;
}
function ReconciliationQueue({ actorId }: { actorId: string }) {
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
  const { user } = useAuthStore();
  const [status, setStatus] = useState<CaseStatus | "active">("active");
  const [severity, setSeverity] = useState<CaseSeverity | "all">("all");
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);
  const [nextStatus, setNextStatus] = useState<CaseStatus | "">("");
  const [resolution, setResolution] = useState("");
  const [note, setNote] = useState("");

  const listQuery = trpc.reconciliation.list.useQuery({
    page,
    limit: 50,
    status,
    severity: severity === "all" ? undefined : severity,
  });
  const detailQuery = trpc.reconciliation.getById.useQuery(
    {
      caseId: selectedCase?.id ?? "00000000-0000-4000-8000-000000000000",
    },
    { enabled: Boolean(selectedCase) },
  );
  const updateStatus = trpc.reconciliation.updateStatus.useMutation({
    retry: false,
  });
  const assign = trpc.reconciliation.assign.useMutation({ retry: false });
  const addNote = trpc.reconciliation.addNote.useMutation({ retry: false });

  const queueUnavailable = listQuery.isError || readFailed;
  const detailHealthy =
    !!selectedCase &&
    !!detailQuery.data &&
    detailQuery.data.id === selectedCase.id &&
    !detailQuery.isError &&
    !detailFailed &&
    !detailQuery.isFetching;
  const activeProblem =
    problem ??
    (uncertain[selectedCase?.id ?? ""]
      ? "Action result unconfirmed. Refresh detail before another attempt."
      : null);
  const decisionsBlocked =
    busy || !detailHealthy || !!uncertain[selectedCase?.id ?? ""];
  if (
    listQuery.isSuccess &&
    !listQuery.isFetching &&
    page > Math.max(listQuery.data.totalPages, 1)
  )
    setPage(Math.max(listQuery.data.totalPages, 1));
  const refreshQueue = async () => {
    if (!current()) return;
    try {
      // Keep visited pages stale so a clamped page reads current rows.
      await utils.reconciliation.list.invalidate(undefined, {
        refetchType: "none",
      });
      if (!current()) return;
      const result = await listQuery.refetch({ throwOnError: true });
      if (!current()) return;
      setReadFailed(false);
      return result.data;
    } catch {
      if (current()) setReadFailed(true);
    }
  };
  const refreshDetail = async () => {
    const selectedId = selectedCase?.id;
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
    const selectedId = selectedCase?.id;
    if (!selectedId || working.current || decisionsBlocked || !current())
      return;
    working.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await Promise.all([
        utils.reconciliation.list.cancel(),
        utils.reconciliation.getById.cancel(),
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
          "CONFLICT",
        ].includes(code ?? "");
        setProblem(
          known
            ? getErrorMessage(error)
            : "Action result unconfirmed. Refresh detail before another attempt.",
        );
        if (!known)
          setUncertain((previous) => ({ ...previous, [selectedId]: true }));
        return;
      }
      if (!current()) return;
      setNotice(typeof message === "function" ? message(result) : message);
      accepted?.();
      // Invalidate all visited page/filter inputs, then read the active queue.
      await utils.reconciliation.list.invalidate(undefined, {
        refetchType: "none",
      });
      if (!current()) return;
      await refreshQueue();
      if (!current()) return;
      await utils.reconciliation.getById.invalidate(undefined, {
        refetchType: "none",
      });
      if (!current()) return;
      try {
        await detailQuery.refetch({ throwOnError: true });
        if (current()) setDetailFailed(false);
      } catch {
        if (current()) setDetailFailed(true);
      }
    } catch {
      if (current()) {
        setReadFailed(true);
        setDetailFailed(true);
      }
    } finally {
      if (current()) {
        working.current = false;
        setBusy(false);
      }
    }
  }

  const rows = (
    queueUnavailable ? [] : (listQuery.data?.items ?? [])
  ) as CaseRow[];

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
          className="h-auto min-h-11 max-w-full whitespace-normal py-2"
          disabled={busy}
          onClick={() => {
            if (busy || queueUnavailable) return;
            setDetailFailed(false);
            setProblem(null);
            selection.current = row.original.id;
            setNotice(null);
            setSelectedCase(row.original);
            setNextStatus(row.original.status);
            setResolution("");
            setNote("");
          }}
        >
          Review
        </Button>
      ),
    },
  ];

  const detail = detailQuery.data;
  const terminal = nextStatus === "resolved" || nextStatus === "dismissed";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reconciliation control plane</h1>
        <p className="mt-1 text-muted-foreground">
          Durable ownership and audit history for money, provider, shipment,
          webhook, and data-integrity exceptions.
        </p>
      </div>

      {notice && !selectedCase ? <p role="status">{notice}</p> : null}
      <Button
        variant="outline"
        className="h-auto min-h-11 max-w-full whitespace-normal py-2"
        disabled={busy || listQuery.isFetching}
        onClick={() => void refreshQueue()}
      >
        Refresh queue
      </Button>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CircleDot className="h-4 w-4" />
              Active cases
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {queueUnavailable ? "—" : (listQuery.data?.openCount ?? "—")}
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
            {queueUnavailable
              ? "—"
              : (listQuery.data?.criticalOpenCount ?? "—")}
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
            {queueUnavailable
              ? "—"
              : rows.filter((item) => !item.assignedTo).length}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="w-52 space-y-1">
          <Label htmlFor="caseStatusFilter">Status</Label>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as CaseStatus | "active");
              setPage(1);
            }}
          >
            <SelectTrigger id="caseStatusFilter">
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
          <Label htmlFor="caseSeverityFilter">Severity</Label>
          <Select
            value={severity}
            onValueChange={(value) => {
              setSeverity(value as CaseSeverity | "all");
              setPage(1);
            }}
          >
            <SelectTrigger id="caseSeverityFilter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {(["critical", "high", "medium", "low"] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {queueUnavailable ? (
        <QueryErrorState
          title="Reconciliation unavailable"
          onRetry={() => void refreshQueue()}
          isRetrying={listQuery.isFetching}
        />
      ) : listQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : listQuery.data ? (
        <DataTable
          columns={columns}
          data={rows}
          serverPagination={{
            page,
            pageSize: 50,
            total: listQuery.data.total,
            totalPages: listQuery.data.totalPages,
            onPageChange: setPage,
            isFetching: listQuery.isFetching || busy,
          }}
          renderMobileRow={(row) => (
            <div className="min-w-0 space-y-2">
              <p className="break-words font-medium">{row.title}</p>
              <p className="text-sm">
                {row.caseKey} · {STATUS_LABELS[row.status]}
              </p>
              <Badge variant={SEVERITY_VARIANT[row.severity]}>
                {row.severity}
              </Badge>
              <div>
                <Button
                  variant="outline"
                  className="h-auto min-h-11 max-w-full whitespace-normal py-2"
                  disabled={busy}
                  onClick={() => {
                    setDetailFailed(false);
                    setProblem(null);
                    selection.current = row.id;
                    setNotice(null);
                    setSelectedCase(row);
                    setNextStatus(row.status);
                    setResolution("");
                    setNote("");
                  }}
                >
                  Review
                </Button>
              </div>
            </div>
          )}
        />
      ) : (
        <div className="rounded-lg border py-12 text-center text-muted-foreground">
          No reconciliation cases match these filters.
        </div>
      )}

      <Dialog
        open={Boolean(selectedCase)}
        onOpenChange={(open) =>
          !open && !busy && ((selection.current = null), setSelectedCase(null))
        }
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail?.title ?? selectedCase?.title}</DialogTitle>
            <DialogDescription>
              {detail?.caseKey ?? selectedCase?.caseKey}
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
                Current case detail could not be loaded. Review the latest
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
          ) : detail && detail.id === selectedCase?.id ? (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant={SEVERITY_VARIANT[detail.severity]}>
                  {detail.severity}
                </Badge>
                <Badge variant="outline">{STATUS_LABELS[detail.status]}</Badge>
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
                  className="h-auto min-h-11 max-w-full whitespace-normal py-2"
                  onClick={() =>
                    void runDecision(
                      () =>
                        assign.mutateAsync({
                          caseId: detail.id,
                          assigneeId: detail.assignedTo
                            ? null
                            : (user?.id ?? null),
                        }),
                      "Case assignment updated.",
                    )
                  }
                  disabled={
                    decisionsBlocked ||
                    assign.isPending ||
                    (!detail.assignedTo && !user?.id)
                  }
                >
                  {detail.assignedTo ? "Return to queue" : "Assign to me"}
                </Button>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label htmlFor="caseNextStatus" className="font-semibold">
                  Update status
                </Label>
                <Select
                  value={nextStatus}
                  onValueChange={(value) => setNextStatus(value as CaseStatus)}
                >
                  <SelectTrigger
                    id="caseNextStatus"
                    disabled={decisionsBlocked}
                  >
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
                    aria-label="Resolution and evidence considered"
                    disabled={decisionsBlocked}
                    value={resolution}
                    onChange={(event) => setResolution(event.target.value)}
                    placeholder="Document the evidence, corrective action, provider state, and final verification."
                    rows={4}
                    maxLength={5000}
                  />
                )}
                <Button
                  size="sm"
                  className="h-auto min-h-11 max-w-full whitespace-normal py-2"
                  disabled={
                    decisionsBlocked ||
                    !nextStatus ||
                    updateStatus.isPending ||
                    (terminal && resolution.trim().length < 10)
                  }
                  onClick={() =>
                    void runDecision(
                      () =>
                        updateStatus.mutateAsync({
                          caseId: detail.id,
                          status: nextStatus as CaseStatus,
                          ...(terminal
                            ? { resolution: resolution.trim() }
                            : {}),
                        }),
                      "Reconciliation case updated.",
                      () => {
                        setNextStatus("");
                        setResolution("");
                      },
                    )
                  }
                >
                  Save status
                </Button>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label htmlFor="caseNote" className="font-semibold">
                  Case note
                </Label>
                <Textarea
                  id="caseNote"
                  disabled={decisionsBlocked}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Record a provider call, reconciliation check, or next action."
                  rows={3}
                  maxLength={5000}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-11 max-w-full whitespace-normal py-2"
                  disabled={
                    decisionsBlocked ||
                    note.trim().length < 2 ||
                    addNote.isPending
                  }
                  onClick={() =>
                    void runDecision(
                      () =>
                        addNote.mutateAsync({
                          caseId: detail.id,
                          message: note.trim(),
                        }),
                      "Case note added.",
                      () => setNote(""),
                    )
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
                    <div key={event.id} className="border-l-2 pl-3 text-sm">
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
            <Button
              variant="outline"
              className="h-auto min-h-11 max-w-full whitespace-normal py-2"
              disabled={busy}
              onClick={() => {
                selection.current = null;
                setSelectedCase(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
