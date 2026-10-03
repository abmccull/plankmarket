"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/auth-store";
import { canPurchase } from "@/lib/auth/roles";
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
import { Textarea } from "@/components/ui/textarea";
import { PackageOpen } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function BuyerSamplesPage() {
  const user = useAuthStore((state) => state.user);
  return user && canPurchase(user.role) ? (
    <BuyerSamplesQueue key={user.id} actorId={user.id} />
  ) : (
    <StatePanelLoading label="Loading your samples" rows={2} />
  );
}

function BuyerSamplesQueue({ actorId }: { actorId: string }) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const utils = trpc.useUtils();
  const query = trpc.sampleRequest.getMyRequests.useQuery();
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
      canPurchase(live.role)
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
    await utils.sampleRequest.getMyRequests.cancel();
    if (!current()) return;
    utils.sampleRequest.getMyRequests.setData(undefined, (previous) =>
      previous?.map((item) => (item.id === request.id ? request : item)),
    );
  }

  async function refreshList() {
    if (!current() || reading.current) return false;
    reading.current = true;
    setRefreshing(true);
    try {
      await utils.sampleRequest.getMyRequests.cancel();
      if (!current()) return false;
      const result = await utils.client.sampleRequest.getMyRequests.query();
      if (!current()) return false;
      await utils.sampleRequest.getMyRequests.cancel();
      if (!current()) return false;
      utils.sampleRequest.getMyRequests.setData(undefined, result);
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

  async function runAction(request: Request, action: "cancel" | "deliver") {
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
      action === "cancel"
        ? "Buyer cancelled the sample request"
        : "Buyer confirmed the sample arrived";
    const input = sampleRequestActionSchema.safeParse({
      requestId: request.id,
      action,
      reason: reasons[request.id]?.trim() || defaultReason,
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
          Track sample requests separately from your orders.
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
          description="Request samples from listings that support direct seller fulfillment."
          primaryAction={{ label: "Browse listings", href: "/listings" }}
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

                {request.shippingAddress && (
                  <div className="break-words rounded-lg border p-3 text-sm">
                    <div className="font-medium">
                      {request.shippingAddress.name}
                    </div>
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
                    <div className="flex flex-wrap gap-2">
                      {request.allowedActions.includes("cancel") && (
                        <Button
                          className="min-h-11"
                          variant="outline"
                          onClick={() => runAction(request, "cancel")}
                          disabled={
                            controlsDisabled || uncertain.has(request.id)
                          }
                        >
                          Cancel Request
                        </Button>
                      )}
                      {request.allowedActions.includes("deliver") && (
                        <Button
                          className="min-h-11"
                          onClick={() => runAction(request, "deliver")}
                          disabled={
                            controlsDisabled || uncertain.has(request.id)
                          }
                        >
                          Mark Delivered
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
