"use client";

import Link from "next/link";
import { useAuthStore } from "@/lib/stores/auth-store";

export function StartSellingEntry() {
  const user = useAuthStore(state => state.user);
  if (user?.role !== "buyer") return null;
  return <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4" aria-label="Start selling">
    <div className="space-y-1"><h2 className="font-medium">Sell inventory with this account</h2><p className="text-sm text-muted-foreground">Keep your purchases and business verification.</p></div>
    <Link href="/settings/selling" className="inline-flex min-h-11 items-center text-sm font-medium underline">Start selling</Link>
  </section>;
}
