"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ShippingQuoteSelector, { type SelectedShippingQuote } from "@/components/checkout/shipping-quote-selector";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/stores/auth-store";
import { formatCurrency, formatSqFt } from "@/lib/utils";
import { withPurchaseIntent } from "@/lib/marketplace/purchase-intent";
import { withFreightReviewServices } from "@/lib/marketplace/freight-review-context";

export function DeliveredCostReview({ listingId, quantitySqFt, beforeFreightAndTax, initialZip }: {
  listingId: string; quantitySqFt: number; beforeFreightAndTax: number; initialZip?: string;
}) {
  const actor = useRef(useAuthStore.getState().user?.id);
  const [zip, setZip] = useState(initialZip ?? "");
  const [liftgateDelivery, setLiftgate] = useState(false);
  const [residentialDelivery, setResidential] = useState(false);
  const [appointmentDelivery, setAppointment] = useState(false);
  const [requested, setRequested] = useState(false);
  const [invalidated, setInvalidated] = useState(false);
  const [quote, setQuote] = useState<SelectedShippingQuote | null>(null);
  useEffect(() => useAuthStore.subscribe(state => {
    if (state.user?.id !== actor.current) { setInvalidated(true); setRequested(false); setQuote(null); }
  }), []);
  const services = { liftgateDelivery, residentialDelivery, appointmentDelivery };
  const resetQuote = () => { setQuote(null); setRequested(false); };
  const validZip = /^\d{5}$/.test(zip.trim());
  const checkout = withFreightReviewServices(withPurchaseIntent(`/listings/${listingId}/checkout`, { quantitySqFt, zip: zip.trim() }), services);
  return <details className="border-t pt-2" aria-labelledby="delivered-cost-heading">
    <summary id="delivered-cost-heading" className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Compare cost with freight</summary>
    <div className="mt-2 space-y-3">
    <p className="text-sm text-muted-foreground">Quote for {formatSqFt(quantitySqFt)}. Confirm delivery services below; applicable tax is confirmed separately at checkout.</p>
    {invalidated ? <p role="alert">Your account changed. Reload before requesting freight.</p> : <>
      <label className="block text-sm" htmlFor="freight-review-zip">Delivery ZIP</label>
      <input id="freight-review-zip" value={zip} inputMode="numeric" maxLength={5} className="h-11 w-full rounded-md border bg-background px-3" onChange={event => { setZip(event.target.value); resetQuote(); }} />
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Delivery services</legend>
        {[
          { label: "Liftgate needed to unload", checked: liftgateDelivery, set: setLiftgate },
          { label: "Residential delivery", checked: residentialDelivery, set: setResidential },
          { label: "Delivery appointment required", checked: appointmentDelivery, set: setAppointment },
        ].map(option => <label key={option.label} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={option.checked} onChange={event => { option.set(event.target.checked); resetQuote(); }} />{option.label}</label>)}
      </fieldset>
      <Button type="button" variant="outline" className="min-h-11" disabled={!validZip} onClick={() => { setQuote(null); setRequested(true); }}>Request freight quotes</Button>
      {requested && <ShippingQuoteSelector listingId={listingId} destinationZip={zip.trim()} quantitySqFt={quantitySqFt} {...services} selectedQuote={quote} onSelectQuote={setQuote} onClearQuote={() => setQuote(null)} />}
      {quote && <div className="space-y-2 text-sm">
        <p>Materials and buyer fee: {formatCurrency(beforeFreightAndTax)}</p>
        <p>Buyer freight charge: {formatCurrency(quote.buyerFreightCharge)}</p>
        <p className="font-semibold">Total with freight, before tax: {formatCurrency(beforeFreightAndTax + quote.buyerFreightCharge)}</p>
        <p className="text-muted-foreground">This is a comparison quote. Checkout confirms current availability, freight and applicable tax before payment.</p>
        <Button asChild className="min-h-11"><Link href={checkout}>Continue with these delivery details</Link></Button>
      </div>}
    </>}
    </div>
  </details>;
}
