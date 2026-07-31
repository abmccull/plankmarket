"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, PackageOpen } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

export default function BuyerSamplesPage() {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.sampleRequest.getMyRequests.useQuery();
  const actOnRequest = trpc.sampleRequest.act.useMutation({
    onSuccess: async () => {
      await utils.sampleRequest.getMyRequests.invalidate();
    },
  });

  const updateReason = (requestId: string, reason: string) => {
    setReasons((current) => ({ ...current, [requestId]: reason }));
  };

  const runAction = async (
    request: NonNullable<typeof data>[number],
    action: "cancel" | "deliver",
  ) => {
    try {
      await actOnRequest.mutateAsync({
        requestId: request.id,
        action,
        reason:
          reasons[request.id]?.trim() ||
          (action === "cancel"
            ? "Buyer cancelled the sample request"
            : "Buyer confirmed the sample arrived"),
      });
      toast.success(
        action === "cancel"
          ? "Sample request cancelled"
          : "Sample marked as delivered",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Samples</h1>
        <p className="mt-1 text-muted-foreground">
          Track sample requests separately from your orders.
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
            Request samples from listings that support direct seller fulfillment.
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

                {request.shippingAddress && (
                  <div className="rounded-lg border p-3 text-sm">
                    <div className="font-medium">{request.shippingAddress.name}</div>
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
                    <div className="flex flex-wrap gap-2">
                      {request.allowedActions.includes("cancel") && (
                        <Button
                          variant="outline"
                          onClick={() => runAction(request, "cancel")}
                          disabled={actOnRequest.isPending}
                        >
                          Cancel Request
                        </Button>
                      )}
                      {request.allowedActions.includes("deliver") && (
                        <Button
                          onClick={() => runAction(request, "deliver")}
                          disabled={actOnRequest.isPending}
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
