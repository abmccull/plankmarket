"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, PackageOpen } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

export default function SellerSamplesPage() {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [carriers, setCarriers] = useState<Record<string, string>>({});
  const [trackingNumbers, setTrackingNumbers] = useState<Record<string, string>>(
    {},
  );
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.sampleRequest.getSellerRequests.useQuery();
  const actOnRequest = trpc.sampleRequest.act.useMutation({
    onSuccess: async () => {
      await utils.sampleRequest.getSellerRequests.invalidate();
    },
  });

  const runAction = async (
    request: NonNullable<typeof data>[number],
    action: "approve" | "decline" | "cancel" | "ship",
  ) => {
    try {
      await actOnRequest.mutateAsync({
        requestId: request.id,
        action,
        reason:
          reasons[request.id]?.trim() ||
          (action === "approve"
            ? "Seller approved the sample request"
            : action === "decline"
              ? "Seller declined the sample request"
              : action === "cancel"
                ? "Seller cancelled the sample request"
                : "Seller shipped the sample"),
        carrier: action === "ship" ? carriers[request.id]?.trim() : undefined,
        trackingNumber:
          action === "ship" ? trackingNumbers[request.id]?.trim() : undefined,
      });

      toast.success(
        action === "approve"
          ? "Sample request approved"
          : action === "decline"
            ? "Sample request declined"
            : action === "cancel"
              ? "Sample request cancelled"
              : "Sample marked as shipped",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  };

  const updateReason = (requestId: string, reason: string) => {
    setReasons((current) => ({ ...current, [requestId]: reason }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Samples</h1>
        <p className="mt-1 text-muted-foreground">
          Approve, decline, and fulfill direct sample requests from buyers.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border bg-muted/20 py-12 text-center">
          <PackageOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">No sample requests yet</h3>
          <p className="mt-1 text-muted-foreground">
            Requests will appear here when buyers ask for samples on eligible
            listings.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.map((request) => (
            <Card key={request.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-4 text-lg">
                  <span>{request.listingTitle}</span>
                  <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {request.status}
                  </span>
                </CardTitle>
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
                  <div className="rounded-lg border p-3 text-sm">
                    <div className="mb-1 font-medium">Approved shipping address</div>
                    <div>{request.shippingAddress.name}</div>
                    <div>{request.shippingAddress.address1}</div>
                    {request.shippingAddress.address2 && (
                      <div>{request.shippingAddress.address2}</div>
                    )}
                    <div>
                      {request.shippingAddress.city}, {request.shippingAddress.state}{" "}
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
                  <div className="rounded-lg border p-3 text-sm">
                    {request.carrier && <div>Carrier: {request.carrier}</div>}
                    {request.trackingNumber && (
                      <div>Tracking: {request.trackingNumber}</div>
                    )}
                  </div>
                )}

                {request.allowedActions.length > 0 && (
                  <div className="space-y-3">
                    <Textarea
                      value={reasons[request.id] ?? ""}
                      onChange={(event) =>
                        updateReason(request.id, event.target.value)
                      }
                      placeholder="Reason for the status update"
                      rows={3}
                    />

                    {request.allowedActions.includes("ship") && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input
                          value={carriers[request.id] ?? ""}
                          onChange={(event) =>
                            setCarriers((current) => ({
                              ...current,
                              [request.id]: event.target.value,
                            }))
                          }
                          placeholder="Carrier"
                        />
                        <Input
                          value={trackingNumbers[request.id] ?? ""}
                          onChange={(event) =>
                            setTrackingNumbers((current) => ({
                              ...current,
                              [request.id]: event.target.value,
                            }))
                          }
                          placeholder="Tracking number (optional)"
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {request.allowedActions.includes("approve") && (
                        <Button
                          onClick={() => runAction(request, "approve")}
                          disabled={actOnRequest.isPending}
                        >
                          Approve
                        </Button>
                      )}
                      {request.allowedActions.includes("decline") && (
                        <Button
                          variant="outline"
                          onClick={() => runAction(request, "decline")}
                          disabled={actOnRequest.isPending}
                        >
                          Decline
                        </Button>
                      )}
                      {request.allowedActions.includes("cancel") && (
                        <Button
                          variant="outline"
                          onClick={() => runAction(request, "cancel")}
                          disabled={actOnRequest.isPending}
                        >
                          Cancel
                        </Button>
                      )}
                      {request.allowedActions.includes("ship") && (
                        <Button
                          onClick={() => runAction(request, "ship")}
                          disabled={actOnRequest.isPending}
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
