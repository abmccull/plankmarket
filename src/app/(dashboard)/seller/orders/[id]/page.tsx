"use client";

import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OrderStatusBadge } from "@/components/dashboard/status-badge";
import {
  formatCurrency,
  formatSqFt,
  formatDate,
} from "@/lib/utils";
import { toast } from "sonner";
import { Loader2, Package, Truck, MapPin, User, Star } from "lucide-react";
import TrackingTimeline from "@/components/shipping/tracking-timeline";
import { LeaveReviewForm } from "@/components/reviews/leave-review-form";
import { ReviewCard } from "@/components/shared/review-card";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import type { OrderStatus } from "@/types";

export default function SellerOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const utils = trpc.useUtils();

  const { data: order, isLoading, refetch } = trpc.order.getById.useQuery({
    id: orderId,
  });

  const { data: orderReviews } = trpc.review.getByOrder.useQuery(
    { orderId },
    { enabled: !!order && order.status === "delivered" }
  );

  const [responseText, setResponseText] = useState("");
  const respondMutation = trpc.review.respond.useMutation({
    onSuccess: () => {
      toast.success("Response submitted");
      setResponseText("");
      utils.review.getByOrder.invalidate({ orderId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateStatus = trpc.order.updateStatus.useMutation();

  const handleUpdateStatus = async (status: string) => {
    try {
      await updateStatus.mutateAsync({
        orderId,
        status: status as "confirmed" | "processing" | "shipped" | "delivered" | "cancelled",
        trackingNumber: trackingNumber || undefined,
        carrier: carrier || undefined,
      });
      toast.success(`Order marked as ${status}`);
      refetch();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to update";
      toast.error(message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold">Order Not Found</h1>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Order {order.orderNumber}</h1>
          <p className="text-muted-foreground text-sm">
            Placed on {formatDate(order.createdAt)}
          </p>
        </div>
        <OrderStatusBadge status={order.status as OrderStatus} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Order Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Order Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Listing</span>
              <span className="font-medium text-right max-w-[200px] truncate">
                {order.listing.title}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quantity</span>
              <span>{formatSqFt(order.quantitySqFt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price / Sq Ft</span>
              <span>{formatCurrency(order.pricePerSqFt)}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Seller Fee (2%)</span>
              <span className="text-destructive">
                -{formatCurrency(order.sellerFee)}
              </span>
            </div>
            {order.shippingPrice && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping (paid by buyer)</span>
                <span className="text-muted-foreground">{formatCurrency(order.shippingPrice)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Your Payout</span>
              <span className="text-primary">
                {formatCurrency(order.sellerPayout)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Buyer & Shipping */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Shipping Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h4 className="font-medium flex items-center gap-1 mb-1">
                <User className="h-3 w-3" />
                Buyer
              </h4>
              <p>{order.buyer.name}</p>
              <p className="text-muted-foreground">
                {order.buyer.businessName}
              </p>
              <p className="text-muted-foreground">{order.buyer.email}</p>
            </div>
            <Separator />
            <div>
              <h4 className="font-medium mb-1">Ship To</h4>
              <p>{order.shippingName}</p>
              <p className="text-muted-foreground">{order.shippingAddress}</p>
              <p className="text-muted-foreground">
                {order.shippingCity}, {order.shippingState}{" "}
                {order.shippingZip}
              </p>
              {order.shippingPhone && (
                <p className="text-muted-foreground">{order.shippingPhone}</p>
              )}
            </div>
            {order.selectedCarrier && (
              <>
                <Separator />
                <div>
                  <h4 className="font-medium flex items-center gap-1 mb-1">
                    <Truck className="h-3 w-3" />
                    Carrier
                  </h4>
                  <p>{order.selectedCarrier}</p>
                  {order.estimatedTransitDays && (
                    <p className="text-muted-foreground">
                      Est. {order.estimatedTransitDays} business days
                    </p>
                  )}
                </div>
              </>
            )}

            {!order.selectedQuoteId && order.trackingNumber && (
              <>
                <Separator />
                <div>
                  <h4 className="font-medium flex items-center gap-1 mb-1">
                    <Truck className="h-3 w-3" />
                    Tracking
                  </h4>
                  <p>{order.trackingNumber}</p>
                  {order.carrier && (
                    <p className="text-muted-foreground">{order.carrier}</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Shipment Tracking (Priority1 orders) */}
      {order.selectedQuoteId && <TrackingTimeline orderId={orderId} />}

      {/* Actions */}
      {order.status !== "delivered" && order.status !== "cancelled" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Update Order</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Manual tracking fields only for legacy (non-Priority1) orders */}
            {!order.selectedQuoteId &&
              (order.status === "pending" || order.status === "confirmed") && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tracking Number</Label>
                    <Input
                      placeholder="Enter tracking number"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Carrier</Label>
                    <Input
                      placeholder="e.g., FedEx Freight"
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              {order.status === "pending" && (
                <Button onClick={() => handleUpdateStatus("confirmed")}>
                  Confirm Order
                </Button>
              )}
              {/* Manual shipping/delivery only for legacy orders */}
              {!order.selectedQuoteId &&
                (order.status === "confirmed" ||
                  order.status === "processing") && (
                <Button onClick={() => handleUpdateStatus("shipped")}>
                  Mark as Shipped
                </Button>
              )}
              {!order.selectedQuoteId && order.status === "shipped" && (
                <Button onClick={() => handleUpdateStatus("delivered")}>
                  Mark as Delivered
                </Button>
              )}
              {(order.status as string) !== "cancelled" &&
                (order.status as string) !== "delivered" && (
                  <Button
                    variant="destructive"
                    onClick={() => handleUpdateStatus("cancelled")}
                  >
                    Cancel Order
                  </Button>
                )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reviews Section */}
      {order.status === "delivered" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Star className="h-5 w-5" />
              Reviews
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Buyer's review of seller */}
            {orderReviews?.buyerToSeller && (
              <div>
                <p className="text-sm font-medium mb-2">Buyer&apos;s Review</p>
                <ReviewCard
                  reviewerName="Buyer"
                  date={new Date(orderReviews.buyerToSeller.createdAt)}
                  rating={orderReviews.buyerToSeller.rating}
                  title={orderReviews.buyerToSeller.title ?? undefined}
                  comment={orderReviews.buyerToSeller.comment ?? ""}
                  subRatings={
                    orderReviews.buyerToSeller.communicationRating
                      ? {
                          communication:
                            orderReviews.buyerToSeller.communicationRating ??
                            undefined,
                          accuracy:
                            orderReviews.buyerToSeller.accuracyRating ??
                            undefined,
                          shipping:
                            orderReviews.buyerToSeller.shippingRating ??
                            undefined,
                        }
                      : undefined
                  }
                  sellerResponse={
                    orderReviews.buyerToSeller.sellerResponse
                      ? {
                          message: orderReviews.buyerToSeller.sellerResponse,
                          date: new Date(
                            orderReviews.buyerToSeller.sellerRespondedAt!
                          ),
                        }
                      : undefined
                  }
                />
                {/* Respond form */}
                {!orderReviews.buyerToSeller.sellerResponse && (
                  <div className="mt-3 space-y-2">
                    <Label className="text-sm font-medium">
                      Respond to this review
                    </Label>
                    <Textarea
                      placeholder="Write your response..."
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      maxLength={2000}
                      rows={2}
                    />
                    <Button
                      size="sm"
                      disabled={
                        !responseText.trim() || respondMutation.isPending
                      }
                      onClick={() =>
                        respondMutation.mutate({
                          reviewId: orderReviews.buyerToSeller!.id,
                          sellerResponse: responseText,
                        })
                      }
                    >
                      {respondMutation.isPending && (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      )}
                      Submit Response
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Seller's review of buyer */}
            <div>
              {orderReviews?.buyerToSeller && <Separator className="mb-4" />}
              {orderReviews?.sellerToBuyer ? (
                <>
                  <p className="text-sm font-medium mb-2">Your Review of the Buyer</p>
                  <ReviewCard
                    reviewerName="You"
                    date={new Date(orderReviews.sellerToBuyer.createdAt)}
                    rating={orderReviews.sellerToBuyer.rating}
                    title={orderReviews.sellerToBuyer.title ?? undefined}
                    comment={orderReviews.sellerToBuyer.comment ?? ""}
                  />
                </>
              ) : (
                <>
                  <p className="text-sm font-medium mb-2">Rate the Buyer</p>
                  <LeaveReviewForm
                    orderId={orderId}
                    direction="seller_to_buyer"
                  />
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
