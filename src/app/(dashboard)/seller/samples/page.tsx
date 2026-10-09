"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/auth-store";
import { sampleRequestActionSchema } from "@/lib/validators/sample-request";
import {
  QueryErrorState,
  StatePanel,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PackageOpen } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function SellerSamplesPage() {
  const user = useAuthStore((state) => state.user);
  return user && ["seller", "admin"].includes(user.role) ? (
    <SellerSamplesQueue key={user.id} actorId={user.id} />
  ) : (
    <StatePanelLoading label="Loading your samples" rows={2} />
  );
}

function SellerSamplesQueue({ actorId }: { actorId: string }) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [carriers, setCarriers] = useState<Record<string, string>>({});
  const [trackingNumbers, setTrackingNumbers] = useState<
    Record<string, string>
  >({});
  const utils = trpc.useUtils();
  const query = trpc.sampleRequest.getSellerRequests.useQuery();
  const { data, isLoading } = query;
  type Request = NonNullable<typeof data>[number];
  const actOnRequest = trpc.sampleRequest.act.useMutation({ retry: false });
  const mounted = useRef(false);
  const working = useRef(false);
  const reading = useRef(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uncertain, setUncertain] = useState<Set<string>>(() => new Set());
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<
    Record<
      string,
      { reason?: string; carrier?: string; trackingNumber?: string }
    >
  >({});
  const [receipt, setReceipt] = useState<{
    listingId: string;
    title: string;
    message: string;
  } | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () => {
    const live = useAuthStore.getState().user;
    return (
      mounted.current &&
      live?.id === actorId &&
      ["seller", "admin"].includes(live.role)
    );
  };
  const controlsDisabled =
    busy ||
    refreshing ||
    query.isFetching ||
    query.isError ||
    refreshFailed ||
    needsRefresh;
  const updateReason = (requestId: string, reason: string) =>
    setReasons((values) => ({ ...values, [requestId]: reason }));

  async function applyConfirmedRequest(request: Request) {
    await utils.sampleRequest.getSellerRequests.cancel();
    if (!current()) return;
    utils.sampleRequest.getSellerRequests.setData(undefined, (previous) =>
      previous?.map((item) => (item.id === request.id ? request : item)),
    );
  }

  async function refreshList() {
    if (!current() || reading.current) return false;
    reading.current = true;
    setRefreshing(true);
    try {
      await utils.sampleRequest.getSellerRequests.cancel();
      if (!current()) return false;
      const result = await utils.client.sampleRequest.getSellerRequests.query();
      if (!current()) return false;
      await utils.sampleRequest.getSellerRequests.cancel();
      if (!current()) return false;
      utils.sampleRequest.getSellerRequests.setData(undefined, result);
      setRefreshFailed(false);
      setNeedsRefresh(false);
      return true;
    } catch {
      if (current()) setRefreshFailed(true);
      return false;
    } finally {
      reading.current = false;
      if (current()) setRefreshing(false);
    }
  }

  async function checkRequest(requestId: string) {
    if (!current() || working.current || reading.current) return;
    working.current = true;
    setBusy(true);
    try {
      // A direct participant read cannot populate another actor's query cache.
      const fresh = await utils.client.sampleRequest.getById.query({
        requestId,
      });
      if (!current()) return;
      if (fresh.id !== requestId)
        throw new Error("The current request could not be confirmed.");
      await applyConfirmedRequest(fresh);
      if (!current()) return;
      setUncertain((ids) => {
        const next = new Set(ids);
        next.delete(requestId);
        return next;
      });
      setActionErrors((errors) => {
        const next = { ...errors };
        delete next[requestId];
        return next;
      });
      await refreshList();
    } catch (error) {
      if (current())
        setActionErrors((errors) => ({
          ...errors,
          [requestId]:
            error instanceof Error
              ? error.message
              : "Request status is unavailable. Keep this request on hold.",
        }));
    } finally {
      working.current = false;
      if (current()) setBusy(false);
    }
  }

  async function runAction(
    request: Request,
    action: "approve" | "decline" | "cancel" | "ship",
  ) {
    if (
      !current() ||
      working.current ||
      reading.current ||
      query.isFetching ||
      query.isError ||
      refreshFailed ||
      needsRefresh ||
      uncertain.has(request.id) ||
      !request.allowedActions.includes(action)
    )
      return;
    const defaultReason =
      action === "approve"
        ? "Seller approved the sample request"
        : action === "decline"
          ? "Seller declined the sample request"
          : action === "cancel"
            ? "Seller cancelled the sample request"
            : "Seller shipped the sample";
    const input = sampleRequestActionSchema.safeParse({
      requestId: request.id,
      action,
      reason: reasons[request.id]?.trim() || defaultReason,
      carrier: action === "ship" ? carriers[request.id]?.trim() : undefined,
      trackingNumber:
        action === "ship" ? trackingNumbers[request.id]?.trim() : undefined,
    });
    if (!input.success) {
      const errors: {
        reason?: string;
        carrier?: string;
        trackingNumber?: string;
      } = {};
      for (const issue of input.error.issues) {
        const field = issue.path[0];
        if (
          field === "reason" ||
          field === "carrier" ||
          field === "trackingNumber"
        )
          errors[field] = issue.message;
      }
      setFieldErrors((previous) => ({ ...previous, [request.id]: errors }));
      const field = Object.keys(errors)[0];
      if (field)
        document.getElementById("sample-" + request.id + "-" + field)?.focus();
      return;
    }
    working.current = true;
    setBusy(true);
    setFieldErrors((errors) => ({ ...errors, [request.id]: {} }));
    setActionErrors((errors) => {
      const next = { ...errors };
      delete next[request.id];
      return next;
    });
    let accepted: Awaited<ReturnType<typeof actOnRequest.mutateAsync>>;
    try {
      accepted = await actOnRequest.mutateAsync(input.data);
      if (accepted.request.id !== request.id)
        throw new Error("The updated request could not be confirmed.");
    } catch (error) {
      if (current()) {
        setUncertain((ids) => new Set(ids).add(request.id));
        setActionErrors((errors) => ({
          ...errors,
          [request.id]:
            (error instanceof Error
              ? error.message
              : "We could not confirm the update.") +
            " Check the request status before trying another action; the earlier update may have completed.",
        }));
      }
      working.current = false;
      if (current()) setBusy(false);
      return;
    }
    if (!current()) {
      working.current = false;
      return;
    }
    const messages = {
      approve: "Sample request approved.",
      decline: "Sample request declined.",
      cancel: "Sample request cancelled.",
      ship: "Sample marked as shipped.",
      deliver: "Sample marked as delivered.",
    };
    setReceipt({
      listingId: request.listingId,
      title: request.listingTitle,
      message:
        accepted.result.kind === "noop"
          ? "This sample request is already " + accepted.request.status + "."
          : messages[action],
    });
    // Confirmed action and display refresh are separate outcomes. Never rerun
    // the mutation to recover a failed list read.
    setNeedsRefresh(true);
    try {
      await applyConfirmedRequest(accepted.request);
      await refreshList();
    } catch {
      if (current()) setRefreshFailed(true);
    } finally {
      working.current = false;
      if (current()) setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Samples</h1>
        <p className="mt-1 text-muted-foreground">
          Approve, decline, and fulfill direct sample requests from buyers.
        </p>
      </div>

      {receipt && (
        <div
          role="status"
          aria-live="polite"
          className="space-y-2 rounded-md border p-4"
        >
          <p>
            <span className="font-medium">{receipt.title}</span>:{" "}
            {receipt.message}
          </p>
          <Link
            className="inline-flex min-h-11 items-center underline underline-offset-4"
            href={"/listings/" + receipt.listingId}
          >
            View listing
          </Link>
          {refreshFailed && (
            <div>
              <p>
                The update was accepted, but the sample list could not refresh.
                Retry the read; do not repeat the update.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-2 min-h-11"
                disabled={busy || refreshing || query.isFetching}
                onClick={() => void refreshList()}
              >
                Refresh sample status
              </Button>
            </div>
          )}
        </div>
      )}
      {query.isError || (!receipt && refreshFailed) ? (
        <QueryErrorState
          title="Samples unavailable"
          description="We could not load current sample request status. Your entered details are kept on this page. Retry before taking action."
          onRetry={() => {
            if (!working.current) void refreshList();
          }}
          isRetrying={query.isFetching || busy || refreshing}
        />
      ) : isLoading ? (
        <StatePanelLoading label="Loading sample requests" rows={2} />
      ) : data?.length === 0 ? (
        <StatePanel
          icon={PackageOpen}
          title="No sample requests yet"
          description="Requests appear here when buyers ask for samples on eligible listings."
        />
      ) : !data ? (
        <QueryErrorState
          title="Samples unavailable"
          description="We could not confirm your sample requests. Retry before taking action."
          onRetry={() => {
            if (!working.current) void refreshList();
          }}
          isRetrying={query.isFetching || busy || refreshing}
        />
      ) : (
        <div className="space-y-4">
          {data.map((request) => (
            <Card key={request.id} data-sample-request-id={request.id}>
              <CardHeader>
                <h2 className="flex min-w-0 flex-wrap items-start justify-between gap-3 text-lg font-semibold">
                  <Link
                    href={"/listings/" + request.listingId}
                    className="inline-flex min-h-11 min-w-0 flex-1 items-center break-words underline underline-offset-4"
                  >
                    {request.listingTitle}
                  </Link>
                  <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {request.status}
                  </span>
                </h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Requested {formatDate(request.createdAt)}
                </div>

                {request.buyerMessage && (
                  <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                    {request.buyerMessage}
                  </div>
                )}

                {request.shippingAddress ? (
                  <div className="break-words rounded-lg border p-3 text-sm">
                    <div className="mb-1 font-medium">
                      Approved shipping address
                    </div>
                    <div>{request.shippingAddress.name}</div>
                    <div>{request.shippingAddress.address1}</div>
                    {request.shippingAddress.address2 && (
                      <div>{request.shippingAddress.address2}</div>
                    )}
                    <div>
                      {request.shippingAddress.city},{" "}
                      {request.shippingAddress.state}{" "}
                      {request.shippingAddress.zip}
                    </div>
                    {request.shippingAddress.phone && (
                      <div>{request.shippingAddress.phone}</div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    Buyer shipping address stays hidden until you approve the
                    request and the buyer has explicitly consented to share it.
                  </div>
                )}

                {(request.carrier || request.trackingNumber) && (
                  <div className="break-words rounded-lg border p-3 text-sm">
                    {request.carrier && <div>Carrier: {request.carrier}</div>}
                    {request.trackingNumber && (
                      <div>Tracking: {request.trackingNumber}</div>
                    )}
                  </div>
                )}

                {actionErrors[request.id] && (
                  <div role="alert" className="space-y-2 text-sm">
                    <p>{actionErrors[request.id]}</p>
                    {uncertain.has(request.id) && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={controlsDisabled}
                        onClick={() => void checkRequest(request.id)}
                      >
                        Check request status
                      </Button>
                    )}
                  </div>
                )}
                {request.allowedActions.length > 0 && (
                  <div className="space-y-3">
                    <Label htmlFor={"sample-" + request.id + "-reason"}>
                      Reason (optional)
                    </Label>
                    <Textarea
                      id={"sample-" + request.id + "-reason"}
                      maxLength={500}
                      disabled={controlsDisabled || uncertain.has(request.id)}
                      aria-invalid={Boolean(fieldErrors[request.id]?.reason)}
                      aria-describedby={
                        "sample-" +
                        request.id +
                        "-reason-hint" +
                        (fieldErrors[request.id]?.reason
                          ? " sample-" + request.id + "-reason-error"
                          : "")
                      }
                      value={reasons[request.id] ?? ""}
                      onChange={(event) =>
                        updateReason(request.id, event.target.value)
                      }
                      placeholder="Reason for the status update"
                      rows={3}
                    />
                    <p
                      id={"sample-" + request.id + "-reason-hint"}
                      className="text-sm text-muted-foreground"
                    >
                      Leave blank to record the standard reason for this action.
                      A custom reason must be 3–500 characters.
                    </p>
                    {fieldErrors[request.id]?.reason && (
                      <p
                        id={"sample-" + request.id + "-reason-error"}
                        role="alert"
                        className="text-sm text-destructive"
                      >
                        {fieldErrors[request.id].reason}
                      </p>
                    )}

                    {request.allowedActions.includes("ship") && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={"sample-" + request.id + "-carrier"}>
                            Carrier
                          </Label>
                          <Input
                            id={"sample-" + request.id + "-carrier"}
                            maxLength={100}
                            aria-required="true"
                            disabled={
                              controlsDisabled || uncertain.has(request.id)
                            }
                            aria-invalid={Boolean(
                              fieldErrors[request.id]?.carrier,
                            )}
                            aria-describedby={
                              "sample-" +
                              request.id +
                              "-carrier-hint" +
                              (fieldErrors[request.id]?.carrier
                                ? " sample-" + request.id + "-carrier-error"
                                : "")
                            }
                            value={carriers[request.id] ?? ""}
                            onChange={(event) =>
                              setCarriers((current) => ({
                                ...current,
                                [request.id]: event.target.value,
                              }))
                            }
                            placeholder="Carrier"
                          />
                          <p
                            id={"sample-" + request.id + "-carrier-hint"}
                            className="text-sm text-muted-foreground"
                          >
                            Required to mark the sample as shipped.
                          </p>
                          {fieldErrors[request.id]?.carrier && (
                            <p
                              id={"sample-" + request.id + "-carrier-error"}
                              role="alert"
                              className="text-sm text-destructive"
                            >
                              {fieldErrors[request.id].carrier}
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label
                            htmlFor={"sample-" + request.id + "-trackingNumber"}
                          >
                            Tracking number (optional)
                          </Label>
                          <Input
                            id={"sample-" + request.id + "-trackingNumber"}
                            maxLength={120}
                            disabled={
                              controlsDisabled || uncertain.has(request.id)
                            }
                            aria-invalid={Boolean(
                              fieldErrors[request.id]?.trackingNumber,
                            )}
                            aria-describedby={
                              fieldErrors[request.id]?.trackingNumber
                                ? "sample-" +
                                  request.id +
                                  "-trackingNumber-error"
                                : undefined
                            }
                            value={trackingNumbers[request.id] ?? ""}
                            onChange={(event) =>
                              setTrackingNumbers((current) => ({
                                ...current,
                                [request.id]: event.target.value,
                              }))
                            }
                            placeholder="Tracking number (optional)"
                          />
                          {fieldErrors[request.id]?.trackingNumber && (
                            <p
                              id={
                                "sample-" + request.id + "-trackingNumber-error"
                              }
                              role="alert"
                              className="text-sm text-destructive"
                            >
                              {fieldErrors[request.id].trackingNumber}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {request.allowedActions.includes("approve") && (
                        <Button
                          className="min-h-11"
                          onClick={() => runAction(request, "approve")}
                          disabled={
                            controlsDisabled || uncertain.has(request.id)
                          }
                        >
                          Approve
                        </Button>
                      )}
                      {request.allowedActions.includes("decline") && (
                        <Button
                          className="min-h-11"
                          variant="outline"
                          onClick={() => runAction(request, "decline")}
                          disabled={
                            controlsDisabled || uncertain.has(request.id)
                          }
                        >
                          Decline
                        </Button>
                      )}
                      {request.allowedActions.includes("cancel") && (
                        <Button
                          className="min-h-11"
                          variant="outline"
                          onClick={() => runAction(request, "cancel")}
                          disabled={
                            controlsDisabled || uncertain.has(request.id)
                          }
                        >
                          Cancel
                        </Button>
                      )}
                      {request.allowedActions.includes("ship") && (
                        <Button
                          className="min-h-11"
                          onClick={() => runAction(request, "ship")}
                          disabled={
                            controlsDisabled || uncertain.has(request.id)
                          }
                        >
                          Mark Shipped
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
