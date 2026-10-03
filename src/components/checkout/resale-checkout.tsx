"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { resaleStatusMessage, type PurchasePurpose } from "@/lib/resale-exemption";
import { ResaleSetup } from "./resale-setup";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
export function ResaleCheckout({ state, purpose, onChange, disabled = false }: { state: string; purpose?: PurchasePurpose; onChange: (purpose: PurchasePurpose) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const eligibility = trpc.resale.eligibility.useQuery({ state: state.toUpperCase() }, { enabled: /^[A-Za-z]{2}$/.test(state) });
  // No auto-selection: a saved certificate is not evidence of this order's purpose.
  return <section className="space-y-3 border-t pt-5" aria-labelledby="resale-checkout-heading">
    <h3 id="resale-checkout-heading" className="font-semibold">Purchasing for resale?</h3>
    <div className="flex flex-wrap gap-4"><label className="flex min-h-11 items-center gap-2"><input type="radio" name="purchase-purpose" checked={purpose !== "resale"} disabled={disabled} onChange={() => onChange("business_use")} />Standard purchase</label><label className="flex min-h-11 items-center gap-2"><input type="radio" name="purchase-purpose" checked={purpose === "resale"} disabled={disabled} onChange={() => onChange("resale")} />For resale</label></div>
    {purpose === "resale" && <>
      <p className="text-sm text-muted-foreground">Only claim resale for eligible purchases. Installation materials may count as business use, depending on the contract and state.</p>
      <p role="status" className="text-sm">{eligibility.isLoading ? "Checking your certificate…" : eligibility.error ? "Certificate status is unavailable. Checkout will check again before calculating tax." : resaleStatusMessage(eligibility.data?.reason ?? "certificate_required")}</p>
      {!eligibility.data?.applied && <Button type="button" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>Set up tax-exempt purchasing</Button>}
      {eligibility.data?.applied && <p className="text-xs text-muted-foreground">Your exemption will be checked again when the order is created. Marketplace fees follow their own tax treatment.</p>}
    </>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Set up resale purchasing</DialogTitle><DialogDescription>Your shipping selection stays saved while you add a certificate.</DialogDescription></DialogHeader><ResaleSetup initialState={state} /></DialogContent></Dialog>
  </section>;
}
