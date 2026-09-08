"use client";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { QueryErrorState, StatePanelLoading } from "@/components/ui/state-panel";
export function OrderRecoveryPanel({ orderId }: { orderId: string }) {
  const query = trpc.shipping.getRecovery.useQuery({ orderId }, { refetchInterval: 30000 });
  if (query.isLoading) return <StatePanelLoading label="Loading payment and freight status" />;
  if (query.isError || !query.data) return <QueryErrorState title="Order status unavailable" description="We cannot confirm the latest payment or freight state. Refresh before taking another action." onRetry={() => void query.refetch()} isRetrying={query.isFetching} />;
  const state = query.data;
  return <section aria-label="Payment and freight status" className="space-y-3 rounded-md border p-4">
    <h2 className="font-semibold">{state.title}</h2><p className="text-sm text-muted-foreground">{state.description}</p>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh status</Button>
      {state.action && <Button variant="outline" asChild><Link href={state.action.href}>{state.action.label}</Link></Button>}</div>
  </section>;
}
