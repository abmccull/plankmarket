"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { celebrateMilestone } from "@/lib/utils/celebrate";
import { checkoutReceiptState } from "@/lib/checkout-receipt";

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const validId = !!orderId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
  const [checking, setChecking] = useState(true);
  const query = trpc.order.getById.useQuery(
    { id: orderId ?? "" },
    { enabled: validId, retry: 1, refetchInterval: (query) => checking && (!query.state.data || checkoutReceiptState(query.state.data).poll) ? 2500 : false },
  );
  const order = query.data;
  const state = order ? checkoutReceiptState(order) : null;
  const celebrated = useRef<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("payment_intent_client_secret");
    url.searchParams.delete("payment_intent");
    window.history.replaceState(window.history.state, "", url.toString());
    const timer = setTimeout(() => setChecking(false), 60_000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!order || !state?.paid || celebrated.current === order.id) return;
    celebrated.current = order.id;
    const key = `plankmarket:receipt-celebrated:${order.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* A receipt remains usable when browser storage is unavailable. */ }
    celebrateMilestone("Purchase confirmed", "Your payment has been received.");
  }, [order, state?.paid]);

  return <div className="container mx-auto max-w-2xl px-4 py-12">
    <div className="mb-8 text-center" role="status" aria-live="polite">
      {state?.paid && <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-600" aria-hidden="true" />}
      {validId && query.isLoading && <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin" aria-hidden="true" />}
      <h1 className="text-3xl font-bold">{!validId ? "Order reference missing" : query.isError ? "Unable to load your order" : state?.title ?? "Checking your payment"}</h1>
      <p className="mt-3 text-muted-foreground">{!validId ? "Find your purchase in your orders." : query.isError ? "We could not verify the payment status. Do not pay again. Retry or open your orders." : state?.description ?? "Retrieving the saved order and its payment status."}</p>
      {state?.poll && !checking && <p className="mt-3 text-sm">Confirmation is taking longer than usual. Your order is saved; check again or return to your orders.</p>}
      {(query.isError || (state?.poll && !checking)) && <Button variant="outline" className="mt-4" disabled={query.isFetching} onClick={() => void query.refetch()}>Check status again</Button>}
    </div>
    {order && <Card>
      <CardHeader><CardTitle>Order {order.orderNumber}</CardTitle></CardHeader>
      <CardContent>
        <dl className="space-y-3 text-sm">
          {[
            ["Order date", formatDate(order.createdAt)],
            ["Order status", order.status],
            ["Payment status", order.paymentStatus.replaceAll("_", " ")],
            ["Inventory subtotal", formatCurrency(order.subtotal)],
            ["Buyer fee", formatCurrency(order.buyerFee)],
            ["Buyer shipping", formatCurrency(order.buyerFreightCharge)],
            ["Tax", formatCurrency(order.taxAmount)],
            [state?.paid ? "Total paid" : "Order total", formatCurrency(order.totalPrice)],
          ].map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value}</dd></div>)}
        </dl>
      </CardContent>
    </Card>}
    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
      <Button asChild className="flex-1"><Link href={order ? `/buyer/orders/${order.id}` : "/buyer/orders"}>{order ? "View order" : "View my orders"}</Link></Button>
      <Button asChild variant="outline" className="flex-1"><Link href="/listings">Continue shopping</Link></Button>
    </div>
  </div>;
}
