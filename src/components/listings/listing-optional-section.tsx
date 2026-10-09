"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { ListingFormInput } from "@/lib/validators/listing";
import { getCommercialReviewSummary, type UsStateCode } from "@/components/marketplace/seller-commercial-fields";
import { formatCurrency } from "@/lib/utils";

export function ListingOptionalSection({ section, title, description, hasErrors = false, summary, children }: {
  section: string;
  title: string;
  description: string;
  hasErrors?: boolean;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (hasErrors && ref.current) ref.current.open = true; }, [hasErrors]);
  return (
    <details ref={ref} data-listing-section={section} className="rounded-lg border bg-background">
      <summary className="min-h-11 cursor-pointer rounded-lg px-4 py-3 marker:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="font-medium">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
        {summary ? <span className="mt-2 block text-sm">{summary}</span> : null}
        {hasErrors ? <span className="mt-2 block text-sm text-destructive">Review the highlighted fields in this section.</span> : null}
      </summary>
      {/* Keep controls mounted: closing must not clear RHF values or dirty fields. */}
      <div className="space-y-4 border-t p-4">{children}</div>
    </details>
  );
}

export function ListingCommercialSummary({ values }: { values: Partial<ListingFormInput> }) {
  const rows = getCommercialReviewSummary({ ...values, sellerFreightStates: values.sellerFreightStates as UsStateCode[] | undefined });
  return <span className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
    <span><strong className="font-medium">Buy now: </strong>{values.buyNowPrice != null && Number.isFinite(values.buyNowPrice) ? `${formatCurrency(values.buyNowPrice)}/sq ft` : "Uses asking price"}</span>
    {rows.map((row) => <span key={row.label}><strong className="font-medium">{row.label}: </strong>{row.value}</span>)}
  </span>;
}
