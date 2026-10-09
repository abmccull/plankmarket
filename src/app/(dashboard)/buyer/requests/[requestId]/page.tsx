"use client";

import { use, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { QueryErrorState } from "@/components/ui/state-panel";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Loader2,
  MessageSquare,
  CheckCircle,
  XCircle,
  ExternalLink,
  MapPin,
  Clock,
  ImageIcon,
  Pencil,
  XOctagon,
  Trash2,
} from "lucide-react";
import Image from "next/image";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const URGENCY_LABEL: Record<string, string> = {
  asap: "ASAP",
  "2_weeks": "2 Weeks",
  "4_weeks": "4 Weeks",
  flexible: "Flexible",
};

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Detail Row helper ────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

// ─── Response Card ────────────────────────────────────────────────────────────

type ResponseItem = {
  id: string;
  message: string;
  status: "sent" | "viewed" | "accepted" | "declined";
  sellerId: string;
  listingId: string | null;
  requestId: string;
  conversationId?: string | null;
};

function ResponseCard({
  response,
  onAccept,
  onDecline,
  actingId,
  disabled,
}: {
  response: ResponseItem;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  actingId: string | null;
  disabled: boolean;
}) {
  const isPending = response.status === "sent" || response.status === "viewed";
  const isThisActing = actingId === response.id;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm text-muted-foreground">
            Seller response
          </span>
          <Badge
            variant={
              response.status === "accepted"
                ? "default"
                : response.status === "declined"
                  ? "destructive"
                  : "secondary"
            }
            className="capitalize"
          >
            {response.status}
          </Badge>
        </div>

        <p className="text-sm text-foreground whitespace-pre-line [overflow-wrap:anywhere]">
          {response.message}
        </p>

        {response.listingId && (
          <div>
            <Separator className="mb-3" />
            <Link
              href={`/listings/${response.listingId}`}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink
                className="h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>View attached listing</span>
            </Link>
          </div>
        )}

        {response.status === "accepted" &&
          (response.conversationId ? (
            <Button asChild className="h-auto min-h-11 whitespace-normal">
              <Link href={"/messages/" + response.conversationId}>
                Message selected seller
              </Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              The selected response is saved, but its conversation is
              unavailable.{" "}
              <Link href="/messages" className="underline">
                Open Messages
              </Link>
            </p>
          ))}
        {isPending && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => onAccept(response.id)}
              disabled={!!actingId || disabled}
              aria-label="Accept this response"
            >
              {isThisActing ? (
                <Loader2
                  className="mr-2 h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <CheckCircle className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              )}
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDecline(response.id)}
              disabled={!!actingId || disabled}
              aria-label="Decline this response"
            >
              <XCircle className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Decline
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuyerRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = use(params);
  const { user } = useAuthStore();
  return (
    <BuyerRequestDetail
      key={(user?.id ?? "anonymous") + ":" + requestId}
      requestId={requestId}
      actorId={user?.id ?? null}
    />
  );
}
function BuyerRequestDetail({
  requestId,
  actorId,
}: {
  requestId: string;
  actorId: string | null;
}) {
  const router = useRouter();
  const mountedRef = useRef(true),
    pendingRef = useRef(false);
  const [pending, setPending] = useState(false),
    [actionError, setActionError] = useState(false);
  const [notice, setNotice] = useState("");
  const [acceptTarget, setAcceptTarget] = useState<string | null>(null);
  const [confirmedMatch, setConfirmedMatch] = useState<{
    responseId: string;
    conversationId: string;
  } | null>(null);
  const isCurrent = () =>
    mountedRef.current && useAuthStore.getState().user?.id === actorId;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const [actingResponseId, setActingResponseId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const editPreparedRef = useRef(false);
  const [editNotes, setEditNotes] = useState("");
  const [editUrgency, setEditUrgency] = useState("flexible");

  const utils = trpc.useUtils();
  const {
    data: req,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = trpc.buyerRequest.getRequest.useQuery(
    { requestId },
    { enabled: !!requestId && !!actorId },
  );

  const acceptMutation = trpc.buyerRequest.acceptResponse.useMutation();
  const declineMutation = trpc.buyerRequest.declineResponse.useMutation();

  const closeMutation = trpc.buyerRequest.close.useMutation();
  const deleteMutation = trpc.buyerRequest.delete.useMutation();
  const updateMutation = trpc.buyerRequest.update.useMutation();
  const refresh = async () => {
    const result = await refetch();
    if (isCurrent() && !result.error) setActionError(false);
  };
  const actionsDisabled = pending || isFetching || isError || actionError;
  const runAction = async (
    kind: "accept" | "decline" | "close" | "delete" | "update",
    responseId?: string,
  ) => {
    if (pendingRef.current || actionsDisabled || !isCurrent()) return;
    pendingRef.current = true;
    setPending(true);
    setNotice("");
    setActingResponseId(responseId ?? null);
    try {
      if (kind === "accept" && responseId) {
        const saved = await acceptMutation.mutateAsync({ responseId });
        if (!isCurrent()) return;
        setConfirmedMatch({ responseId, conversationId: saved.conversationId });
        setAcceptTarget(null);
        setNotice("Response selected. Other pending responses were declined.");
      } else if (kind === "decline" && responseId) {
        await declineMutation.mutateAsync({ responseId });
        if (!isCurrent()) return;
        setNotice("Response declined.");
      } else if (kind === "close") {
        await closeMutation.mutateAsync({ requestId });
        if (!isCurrent()) return;
        setNotice("Request closed.");
      } else if (kind === "delete") {
        await deleteMutation.mutateAsync({ requestId });
        if (!isCurrent()) return;
        void utils.buyerRequest.getMyRequests.invalidate().catch(() => {});
        router.push("/buyer/requests");
        return;
      } else if (kind === "update") {
        await updateMutation.mutateAsync({
          id: requestId,
          urgency: editUrgency as "asap" | "2_weeks" | "4_weeks" | "flexible",
          notes: editNotes || undefined,
        });
        if (!isCurrent()) return;
        setEditOpen(false);
        editPreparedRef.current = false;
        setNotice("Request updated.");
      }
      void utils.buyerRequest.getMyRequests.invalidate().catch(() => {});
      void refresh();
    } catch {
      if (isCurrent()) {
        setActionError(true);
        setAcceptTarget(null);
      }
    } finally {
      pendingRef.current = false;
      if (isCurrent()) {
        setPending(false);
        setActingResponseId(null);
      }
    }
  };

  const openEditDialog = () => {
    if (!req) return;
    if (!editPreparedRef.current) {
      setEditNotes(req.notes ?? "");
      setEditUrgency(req.urgency ?? "flexible");
      editPreparedRef.current = true;
    }
    setEditOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError && !req)
    return (
      <QueryErrorState
        title="We couldn't load this request"
        description="The request could not be checked. Try again; this does not mean it was deleted."
        onRetry={() => void refresh()}
        isRetrying={isFetching}
        secondaryAction={{ label: "Back to requests", href: "/buyer/requests" }}
      />
    );
  if (!req) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">
          This request is unavailable to this account.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/buyer/requests">Back to Requests</Link>
        </Button>
      </div>
    );
  }

  const responses: ResponseItem[] = (req.responses ?? []).map((response) =>
    confirmedMatch
      ? {
          ...response,
          status:
            response.id === confirmedMatch.responseId
              ? ("accepted" as const)
              : response.status === "sent" || response.status === "viewed"
                ? ("declined" as const)
                : response.status,
          conversationId:
            response.id === confirmedMatch.responseId
              ? confirmedMatch.conversationId
              : response.conversationId,
        }
      : response,
  );
  const isEditable = req.status === "open" || req.status === "matched";

  // Access specs from the nested specs object
  const specs = req.specs as
    | {
        thicknessMinMm?: number;
        wearLayerMinMil?: number;
        waterproofRequired?: boolean;
        species?: string[];
      }
    | null
    | undefined;

  return (
    <div className="min-w-0 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start flex-wrap gap-3">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
        >
          <Link href="/buyer/requests" aria-label="Back to requests">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold break-words [overflow-wrap:anywhere]">
            {req.title || "Untitled Request"}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Posted {formatDate(req.createdAt)}
          </p>
        </div>
        <Badge
          variant={req.status === "open" ? "default" : "secondary"}
          className="capitalize shrink-0"
        >
          {req.status}
        </Badge>
      </div>

      {notice && <p role="status">{notice}</p>}
      {(isError || actionError) && (
        <QueryErrorState
          title={
            actionError
              ? "Request update not confirmed"
              : "We couldn't refresh this request"
          }
          description={
            actionError
              ? "Refresh the current request status before trying again. The previous action may have completed; your edits are still here."
              : "Previously loaded details are shown. Refresh before changing this request."
          }
          onRetry={() => void refresh()}
          isRetrying={isFetching}
        />
      )}
      <AlertDialog
        open={!!acceptTarget}
        onOpenChange={(open) =>
          !open && !pendingRef.current && setAcceptTarget(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Select this seller response?</AlertDialogTitle>
            <AlertDialogDescription>
              Selecting this response marks your request as matched and declines
              the other pending responses. It opens a conversation with this
              seller. This does not place an order, charge you or reserve
              inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              Keep reviewing
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={actionsDisabled}
              onClick={(event) => {
                event.preventDefault();
                if (acceptTarget) void runAction("accept", acceptTarget);
              }}
            >
              Select response
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Action buttons */}
      {isEditable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={actionsDisabled}
            onClick={openEditDialog}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={actionsDisabled}
              >
                <XOctagon className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                Close Request
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Close this request?</AlertDialogTitle>
                <AlertDialogDescription>
                  Sellers will no longer be able to respond. You can still view
                  responses you&apos;ve already received.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void runAction("close")}
                  disabled={actionsDisabled}
                >
                  {closeMutation.isPending && (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  )}
                  Close Request
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                className="min-h-11"
                disabled={actionsDisabled}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this request?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the request and all seller
                  responses. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void runAction("delete")}
                  disabled={actionsDisabled}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteMutation.isPending && (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  )}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* Delete for closed/expired requests too */}
      {!isEditable && (
        <div className="flex flex-wrap items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                className="min-h-11"
                disabled={actionsDisabled}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this request?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the request and all seller
                  responses. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void runAction("delete")}
                  disabled={actionsDisabled}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteMutation.isPending && (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  )}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => !pendingRef.current && setEditOpen(open)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Request</DialogTitle>
            <DialogDescription>
              Update the urgency or notes on your request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-urgency">Urgency</Label>
              <Select
                value={editUrgency}
                onValueChange={setEditUrgency}
                disabled={pending}
              >
                <SelectTrigger id="edit-urgency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asap">ASAP</SelectItem>
                  <SelectItem value="2_weeks">2 Weeks</SelectItem>
                  <SelectItem value="4_weeks">4 Weeks</SelectItem>
                  <SelectItem value="flexible">Flexible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                disabled={pending}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Additional notes for sellers..."
                rows={4}
                maxLength={1000}
              />
              {actionError && (
                <div role="alert" className="space-y-2 text-sm">
                  <p>
                    The update was not confirmed. Your edits are kept. Refresh
                    request status before trying again.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending || isFetching}
                    onClick={() => void refresh()}
                  >
                    Refresh request status
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-right">
                {editNotes.length}/1000
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (!pendingRef.current) setEditOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void runAction("update")}
              disabled={actionsDisabled}
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Details */}
      <Card>
        <CardHeader>
          <CardTitle>Request Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 divide-y">
          {req.materialTypes && req.materialTypes.length > 0 && (
            <div className="py-1.5">
              <span className="text-sm text-muted-foreground block mb-1">
                Material Types
              </span>
              <div className="flex flex-wrap gap-1">
                {req.materialTypes.map((m) => (
                  <Badge key={m} variant="outline" className="text-xs">
                    {m.replace("_", " ")}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <DetailRow
            label="Square Footage"
            value={
              req.minTotalSqFt || req.maxTotalSqFt
                ? `${req.minTotalSqFt?.toLocaleString() ?? "0"}${
                    req.maxTotalSqFt
                      ? `–${req.maxTotalSqFt.toLocaleString()}`
                      : "+"
                  } sqft`
                : "—"
            }
          />

          <DetailRow
            label="Budget (per sqft)"
            value={
              req.priceMinPerSqFt || req.priceMaxPerSqFt
                ? `$${req.priceMinPerSqFt ?? "0"} – $${
                    req.priceMaxPerSqFt ?? "any"
                  }`
                : "—"
            }
          />

          {req.destinationZip && (
            <DetailRow
              label="Destination ZIP"
              value={
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {req.destinationZip}
                </span>
              }
            />
          )}

          <DetailRow
            label="Urgency"
            value={
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {URGENCY_LABEL[req.urgency ?? "flexible"] ?? req.urgency}
              </span>
            }
          />

          {req.pickupOk && (
            <DetailRow
              label="Pickup"
              value={
                req.pickupRadiusMiles
                  ? `Within ${req.pickupRadiusMiles} miles`
                  : "Yes"
              }
            />
          )}

          <DetailRow
            label="Shipping"
            value={req.shippingOk ? "Accepted" : "Not accepted"}
          />

          {specs?.waterproofRequired && (
            <DetailRow label="Waterproof" value="Required" />
          )}

          {specs?.thicknessMinMm != null && (
            <DetailRow
              label="Min Thickness"
              value={`${specs.thicknessMinMm}mm`}
            />
          )}

          {specs?.wearLayerMinMil != null && (
            <DetailRow
              label="Min Wear Layer"
              value={`${specs.wearLayerMinMil} mil`}
            />
          )}

          {specs?.species && specs.species.length > 0 && (
            <DetailRow label="Species" value={specs.species.join(", ")} />
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {req.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line [overflow-wrap:anywhere]">
              {req.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Reference Photos */}
      {req.media && req.media.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <ImageIcon className="h-5 w-5" aria-hidden="true" />
              Reference Photos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {req.media.map(
                (img: {
                  id: string;
                  url: string;
                  fileName?: string | null;
                }) => (
                  <div
                    key={img.id}
                    className="relative aspect-square rounded-lg overflow-hidden border bg-muted"
                  >
                    <Image
                      src={img.url}
                      alt={img.fileName || "Reference photo"}
                      fill
                      sizes="(max-width: 640px) 50vw, 33vw"
                      className="object-cover"
                      loading="lazy"
                    />
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Responses */}
      <section aria-labelledby="responses-heading">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare
            className="h-5 w-5 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 id="responses-heading" className="text-xl font-semibold">
            Responses ({responses.length})
          </h2>
        </div>

        {responses.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <CardDescription>
                No responses yet. Sellers can review your open request on the
                request board.
              </CardDescription>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {responses.map((response) => (
              <ResponseCard
                key={response.id}
                response={response}
                onAccept={setAcceptTarget}
                onDecline={(id) => void runAction("decline", id)}
                actingId={actingResponseId}
                disabled={
                  actionsDisabled ||
                  req.status !== "open" ||
                  Boolean(confirmedMatch) ||
                  Boolean(
                    req.expiresAt &&
                    new Date(req.expiresAt).getTime() <= Date.now(),
                  )
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
