"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { QueryErrorState } from "@/components/ui/state-panel";
import {
  Loader2,
  FileText,
  Plus,
  MessageSquare,
  MapPin,
  Clock,
  MoreVertical,
  XOctagon,
  Trash2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  open: "default",
  closed: "secondary",
  matched: "secondary",
  expired: "destructive",
};

const URGENCY_LABEL: Record<string, string> = {
  asap: "ASAP",
  "2_weeks": "2 Weeks",
  "4_weeks": "4 Weeks",
  flexible: "Flexible",
};

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuyerRequestsPage() {
  const { user } = useAuthStore();
  return (
    <BuyerRequests key={user?.id ?? "anonymous"} actorId={user?.id ?? null} />
  );
}
function BuyerRequests({ actorId }: { actorId: string | null }) {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const query = trpc.buyerRequest.getMyRequests.useQuery(
    { page, limit: 20 },
    { enabled: !!actorId },
  );
  const { data, isLoading, isError, isFetching } = query;
  const pendingRef = useRef(false),
    mountedRef = useRef(true);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [notice, setNotice] = useState("");
  const isCurrent = () =>
    mountedRef.current && useAuthStore.getState().user?.id === actorId;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (data && !isError && page > Math.max(1, data.totalPages))
      setPage(Math.max(1, data.totalPages));
  }, [data, isError, page]);
  const refresh = async () => {
    const result = await query.refetch();
    if (isCurrent() && !result.error) setActionError(false);
  };

  const [confirmAction, setConfirmAction] = useState<{
    type: "close" | "delete";
    requestId: string;
  } | null>(null);

  const closeMutation = trpc.buyerRequest.close.useMutation();
  const deleteMutation = trpc.buyerRequest.delete.useMutation();
  const performAction = async () => {
    if (
      !confirmAction ||
      pendingRef.current ||
      isError ||
      actionError ||
      !isCurrent()
    )
      return;
    const action = confirmAction;
    pendingRef.current = true;
    setActionPending(true);
    setNotice("");
    try {
      if (action.type === "close")
        await closeMutation.mutateAsync({ requestId: action.requestId });
      else await deleteMutation.mutateAsync({ requestId: action.requestId });
      if (!isCurrent()) return;
      setConfirmAction(null);
      setNotice(
        action.type === "close" ? "Request closed." : "Request deleted.",
      );
      void utils.buyerRequest.getMyRequests.invalidate().catch(() => {});
    } catch {
      if (isCurrent()) {
        setActionError(true);
        setConfirmAction(null);
      }
    } finally {
      pendingRef.current = false;
      if (isCurrent()) setActionPending(false);
    }
  };

  const requests = data?.items ?? [];
  const isPending = actionPending;
  const actionsDisabled = isPending || isError || actionError;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">My Requests</h1>
          <p className="text-muted-foreground mt-1">
            Post what you need and let sellers come to you
          </p>
        </div>
        <Button asChild className="h-auto min-h-11 whitespace-normal">
          <Link href="/buyer/requests/new">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            New Request
          </Link>
        </Button>
      </div>

      {notice && <p role="status">{notice}</p>}
      {(isError || actionError) && (
        <QueryErrorState
          title={
            actionError
              ? "Request update not confirmed"
              : "We couldn't load your requests"
          }
          description={
            actionError
              ? "Refresh the current request list before trying again. The previous action may have completed."
              : "Previously loaded requests may appear below. Refresh before changing a request."
          }
          onRetry={() => void refresh()}
          isRetrying={isFetching}
        />
      )}
      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data && isError ? null : requests.length === 0 &&
        data?.total === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-muted/20">
          <FileText
            className="mx-auto h-12 w-12 text-muted-foreground mb-4"
            aria-hidden="true"
          />
          <h3 className="text-lg font-semibold">No requests yet</h3>
          <p className="text-muted-foreground mt-1 mb-4">
            Post the material and quantity you need so sellers can review it.
          </p>
          <Button asChild className="min-h-11">
            <Link href="/buyer/requests/new">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Post a Request
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const isEditable =
              req.status === "open" || req.status === "matched";

            return (
              <div key={req.id} className="relative">
                <Link href={`/buyer/requests/${req.id}`}>
                  <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                    <CardContent className="p-4 pr-16">
                      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Title + status */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="font-semibold break-words [overflow-wrap:anywhere]">
                              {req.title}
                            </h2>
                            <Badge
                              variant={STATUS_VARIANT[req.status] ?? "outline"}
                              className="capitalize"
                            >
                              {req.status}
                            </Badge>
                          </div>

                          {/* Material badges */}
                          {req.materialTypes &&
                            req.materialTypes.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {req.materialTypes.map((m) => (
                                  <Badge
                                    key={m}
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    {m.replace("_", " ")}
                                  </Badge>
                                ))}
                              </div>
                            )}

                          {/* Key details */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            {req.minTotalSqFt || req.maxTotalSqFt ? (
                              <span>
                                {req.minTotalSqFt?.toLocaleString() ?? "0"}
                                {req.maxTotalSqFt
                                  ? `–${req.maxTotalSqFt.toLocaleString()}`
                                  : "+"}
                                {" sqft"}
                              </span>
                            ) : null}
                            {req.priceMaxPerSqFt && (
                              <span>Up to ${req.priceMaxPerSqFt}/sqft</span>
                            )}
                            {req.destinationZip && (
                              <span className="flex items-center gap-1">
                                <MapPin
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                                {req.destinationZip}
                              </span>
                            )}
                            {req.urgency && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" aria-hidden="true" />
                                {URGENCY_LABEL[req.urgency] ?? req.urgency}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right side metadata */}
                        <div className="flex flex-wrap sm:flex-col sm:items-end gap-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <MessageSquare
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            <span>
                              {req.responseCount ?? 0}{" "}
                              {req.responseCount === 1
                                ? "response"
                                : "responses"}
                            </span>
                          </div>
                          <span>{formatDate(req.createdAt)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                {/* Action menu */}
                <div className="absolute top-3 right-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11"
                        disabled={actionsDisabled}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        aria-label={`Actions for ${req.title}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isEditable && (
                        <DropdownMenuItem
                          disabled={actionsDisabled}
                          onSelect={() => {
                            setConfirmAction({
                              type: "close",
                              requestId: req.id,
                            });
                          }}
                        >
                          <XOctagon className="mr-2 h-4 w-4" />
                          Close Request
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        disabled={actionsDisabled}
                        onSelect={() => {
                          setConfirmAction({
                            type: "delete",
                            requestId: req.id,
                          });
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <nav
          aria-label="Request pages"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <Button
            variant="outline"
            className="min-h-11"
            disabled={page <= 1 || isFetching || isPending}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous requests
          </Button>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Page {page} of {data.totalPages} · {data.total} requests
          </p>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={page >= data.totalPages || isFetching || isPending}
            onClick={() => setPage((value) => value + 1)}
          >
            Next requests
          </Button>
        </nav>
      )}

      {/* Confirmation dialog */}
      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) =>
          !open && !pendingRef.current && setConfirmAction(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "close"
                ? "Close this request?"
                : "Delete this request?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "close"
                ? "Sellers will no longer be able to respond. You can still view responses you've already received."
                : "This will permanently delete the request and all seller responses. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              className={
                confirmAction?.type === "delete"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={(event) => {
                event.preventDefault();
                void performAction();
              }}
            >
              {isPending && (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              )}
              {confirmAction?.type === "close" ? "Close Request" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
