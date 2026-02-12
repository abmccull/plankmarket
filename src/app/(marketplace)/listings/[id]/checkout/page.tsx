"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createOrderSchema, type CreateOrderInput } from "@/lib/validators/order";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  formatCurrency,
  formatSqFt,
  calculateBuyerFee,
  calculateTotalWithFees,
} from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShieldCheck, Package } from "lucide-react";

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params.id as string;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: listing, isLoading } = trpc.listing.getById.useQuery({
    id: listingId,
  });

  const createOrder = trpc.order.create.useMutation();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateOrderInput>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      listingId,
      quantitySqFt: 0,
    },
  });

  // Reset form defaults when listing data loads (avoids stale default of 0)
  useEffect(() => {
    if (listing) {
      reset({ listingId, quantitySqFt: listing.totalSqFt });
    }
  }, [listing, listingId, reset]);

  const quantitySqFt = watch("quantitySqFt") || listing?.totalSqFt || 0;

  const onSubmit = async (data: CreateOrderInput) => {
    setIsSubmitting(true);
    try {
      const order = await createOrder.mutateAsync(data);
      toast.success("Order placed successfully!");
      router.push(`/buyer/orders/${order.id}`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to place order";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Listing Not Found</h1>
      </div>
    );
  }

  const originalSqFt = listing.originalTotalSqFt ?? listing.totalSqFt;
  const pricePerSqFt = listing.buyNowPrice
    ? listing.buyNowPrice / originalSqFt
    : listing.askPricePerSqFt;
  const subtotal = Math.round(quantitySqFt * pricePerSqFt * 100) / 100;
  const buyerFee = calculateBuyerFee(subtotal);
  const total = Math.round((subtotal + buyerFee) * 100) / 100;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="mb-6"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to listing
      </Button>

      <h1 className="text-2xl font-bold mb-8">Checkout</h1>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid md:grid-cols-5 gap-8">
          {/* Left - Form */}
          <div className="md:col-span-3 space-y-6">
            {/* Quantity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Order Quantity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="quantitySqFt">
                    Quantity (sq ft)
                  </Label>
                  <Input
                    id="quantitySqFt"
                    type="number"
                    step="0.01"
                    min={listing.moq || 1}
                    max={listing.totalSqFt}
                    defaultValue={listing.totalSqFt}
                    {...register("quantitySqFt", { valueAsNumber: true })}
                  />
                  {errors.quantitySqFt && (
                    <p className="text-sm text-destructive">
                      {errors.quantitySqFt.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Available: {formatSqFt(listing.totalSqFt)}
                    {listing.moq && ` | Min order: ${formatSqFt(listing.moq)}`}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Shipping Address */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Shipping Address</CardTitle>
                <CardDescription>
                  Where should this order be delivered?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="shippingName">Full Name / Business</Label>
                  <Input
                    id="shippingName"
                    placeholder="Acme Flooring Co."
                    {...register("shippingName")}
                  />
                  {errors.shippingName && (
                    <p className="text-sm text-destructive">
                      {errors.shippingName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shippingAddress">Street Address</Label>
                  <Input
                    id="shippingAddress"
                    placeholder="123 Main St, Suite 100"
                    {...register("shippingAddress")}
                  />
                  {errors.shippingAddress && (
                    <p className="text-sm text-destructive">
                      {errors.shippingAddress.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="shippingCity">City</Label>
                    <Input
                      id="shippingCity"
                      placeholder="Dallas"
                      {...register("shippingCity")}
                    />
                    {errors.shippingCity && (
                      <p className="text-sm text-destructive">
                        {errors.shippingCity.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shippingState">State</Label>
                    <Input
                      id="shippingState"
                      placeholder="TX"
                      maxLength={2}
                      {...register("shippingState")}
                    />
                    {errors.shippingState && (
                      <p className="text-sm text-destructive">
                        {errors.shippingState.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shippingZip">ZIP</Label>
                    <Input
                      id="shippingZip"
                      placeholder="75001"
                      {...register("shippingZip")}
                    />
                    {errors.shippingZip && (
                      <p className="text-sm text-destructive">
                        {errors.shippingZip.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shippingPhone">Phone (optional)</Label>
                  <Input
                    id="shippingPhone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    {...register("shippingPhone")}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Payment - placeholder */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payment</CardTitle>
                <CardDescription>
                  Secure payment processed by Stripe
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border-2 border-dashed p-6 text-center text-sm text-muted-foreground">
                  <ShieldCheck className="mx-auto h-8 w-8 mb-2 text-primary" />
                  <p>
                    Stripe payment integration will be activated once you
                    connect your Stripe API keys.
                  </p>
                  <p className="mt-1 text-xs">
                    For now, orders are created without payment processing.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right - Order Summary */}
          <div className="md:col-span-2">
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle className="text-lg">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Product */}
                <div className="flex gap-3">
                  <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {listing.media?.[0] ? (
                      <img
                        src={listing.media[0].url}
                        alt={listing.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Package className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium line-clamp-2">
                      {listing.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {listing.seller?.businessName}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Pricing breakdown */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {formatSqFt(quantitySqFt)} x{" "}
                      {formatCurrency(pricePerSqFt)}/sq ft
                    </span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Buyer fee (3%)
                    </span>
                    <span>{formatCurrency(buyerFee)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold text-base">
                    <span>Total</span>
                    <span className="text-primary">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Place Order
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  By placing this order, you agree to our Terms of Service.
                  Seller fee (2%) will be deducted from seller payout.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
