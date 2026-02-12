"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Loader2, Package, ArrowRight } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function CheckoutSuccessPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingId = params.id as string;

  const paymentIntent = searchParams.get("payment_intent");
  const paymentIntentClientSecret = searchParams.get("payment_intent_client_secret");
  const orderIdParam = searchParams.get("orderId");

  const { data: order, isLoading } = trpc.order.getById.useQuery(
    { id: orderIdParam! },
    { enabled: !!orderIdParam }
  );

  useEffect(() => {
    if (!paymentIntent || !paymentIntentClientSecret || !orderIdParam) {
      router.push(`/listings/${listingId}/checkout`);
      return;
    }
  }, [paymentIntent, paymentIntentClientSecret, orderIdParam, listingId, router]);

  if (!paymentIntent || !paymentIntentClientSecret) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-2xl">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Confirming your order...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Order Confirmed!</h1>
        <p className="text-muted-foreground">
          Thank you for your purchase. Your order has been placed successfully.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order Details</CardTitle>
          <CardDescription>
            Order confirmation and details have been sent to your email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Order Number</span>
              <span className="font-medium">{order?.orderNumber || "Processing..."}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment Intent</span>
              <span className="font-mono text-xs truncate max-w-[200px]">
                {paymentIntent}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Order Date</span>
              <span>{order?.createdAt ? formatDate(order.createdAt) : "Just now"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <span className="capitalize">{order?.status || "Pending"}</span>
            </div>
          </div>

          {order && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="font-medium text-sm">Order Summary</h3>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Buyer Fee</span>
                  <span>{formatCurrency(order.buyerFee)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total Paid</span>
                  <span className="text-primary">{formatCurrency(order.totalPrice)}</span>
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="space-y-3">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <Package className="h-4 w-4" aria-hidden="true" />
              What happens next?
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                  1
                </span>
                <span>The seller will be notified of your order</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                  2
                </span>
                <span>You will receive tracking information once your order ships</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                  3
                </span>
                <span>Track your order status in your buyer dashboard</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 mt-6">
        <Button asChild variant="outline" className="flex-1">
          <Link href="/buyer/orders">
            View All Orders
          </Link>
        </Button>
        <Button asChild className="flex-1">
          <Link href="/">
            Continue Shopping
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
