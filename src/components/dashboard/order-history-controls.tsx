"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatePanel } from "@/components/ui/state-panel";
import { Package } from "lucide-react";

const STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"] as const;
type HistoryStatus = (typeof STATUSES)[number];
const isHistoryStatus = (value: string | null): value is HistoryStatus => STATUSES.some((status) => status === value);

export function useOrderHistoryFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawPage = params.get("page") ?? "1";
  const parsedPage = Number(rawPage);
  const page = /^\d+$/.test(rawPage) && Number.isSafeInteger(parsedPage) && parsedPage >= 1 && parsedPage <= 100000 ? parsedPage : 1;
  const rawStatus = params.get("status");
  const status = isHistoryStatus(rawStatus) ? rawStatus : undefined;
  function navigate(nextPage: number, nextStatus?: HistoryStatus) {
    const next = new URLSearchParams(params.toString());
    if (nextPage > 1) next.set("page", String(nextPage)); else next.delete("page");
    if (nextStatus) next.set("status", nextStatus); else next.delete("status");
    const query = next.toString();
    router.push(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }
  return {
    input: { page, limit: 20, status },
    page,
    status,
    setPage: (next: number) => navigate(next, status),
    setStatus: (next: string) => navigate(1, isHistoryStatus(next) ? next : undefined),
  };
}

export function OrderHistoryFilter({ status, onChange }: { status?: HistoryStatus; onChange: (status: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="order-status-filter" className="text-sm font-medium">Order status</label>
      <select id="order-status-filter" value={status ?? ""} onChange={(event) => onChange(event.target.value)} className="min-h-11 max-w-full rounded-md border bg-background px-3 text-sm">
        <option value="">All orders</option>
        {STATUSES.map((value) => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}
      </select>
    </div>
  );
}

export function OrderHistoryPager({ data, isFetching, onPage }: {
  data: { page: number; limit: number; total: number; totalPages: number; items: unknown[] };
  isFetching: boolean;
  onPage: (page: number) => void;
}) {
  if (!data.total || !data.items.length) return null;
  const first = (data.page - 1) * data.limit + 1;
  return (
    <nav aria-label="Order history pages" className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <p role="status" className="text-sm text-muted-foreground">Showing {first}–{first + data.items.length - 1} of {data.total} orders</p>
      <div className="flex items-center gap-2">
        <Button variant="outline" className="min-h-11" disabled={data.page <= 1 || isFetching} onClick={() => onPage(data.page - 1)} aria-label="Previous orders page">Previous</Button>
        <span className="text-sm">{data.page} / {data.totalPages}</span>
        <Button variant="outline" className="min-h-11" disabled={data.page >= data.totalPages || isFetching} onClick={() => onPage(data.page + 1)} aria-label="Next orders page">Next</Button>
      </div>
    </nav>
  );
}

export function OrderHistoryFilteredEmpty({ page, status, onFirstPage, onClear }: {
  page: number;
  status?: HistoryStatus;
  onFirstPage: () => void;
  onClear: () => void;
}) {
  return (
    <StatePanel icon={Package}
      title={page > 1 ? "This page is no longer available" : `No ${status} orders`}
      description={page > 1 ? "The order queue may have changed. Return to its first page to continue." : "Try another order status or view your complete order history."}
      primaryAction={page > 1 ? { label: "First page", onClick: onFirstPage } : { label: "Clear filter", onClick: onClear }}
    />
  );
}
