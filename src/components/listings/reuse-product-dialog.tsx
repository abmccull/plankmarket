"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Search } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { REUSABLE_PRODUCT_KEYS, REUSABLE_PRODUCT_LABELS, type ReusableProduct, type ReusableProductKey } from "@/lib/marketplace/reusable-listing-product";
import { formatListingWearLayer, specificationLabel } from "@/lib/product-specifications";
import { cn } from "@/lib/utils";

function displayValue(key: ReusableProductKey, product: ReusableProduct) {
  const value = product[key];
  if (key === "wearLayer") return formatListingWearLayer(product.wearLayer, product.materialType);
  if (Array.isArray(value)) return value.length ? value.map(specificationLabel).join(", ") : "None listed";
  if (["thickness", "width", "length"].includes(key)) return `${value} in`;
  return specificationLabel(String(value));
}

export function ReuseProductDialog({ sellerId, disabled = false, onApply }: {
  sellerId: string; disabled?: boolean; onApply: (product: ReusableProduct) => boolean;
}) {
  const [open, setOpen] = useState(false);
  // A fresh picker on each opening also discards a canceled selection.
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" variant="outline" className="min-h-11" disabled={disabled}><Copy className="mr-2 h-4 w-4" aria-hidden="true" />Use a previous product</Button></DialogTrigger>
    {open && <ProductPicker key={sellerId} sellerId={sellerId} disabled={disabled} onApply={onApply} close={() => setOpen(false)} />}
  </Dialog>;
}

function ProductPicker({ sellerId, disabled, onApply, close }: {
  sellerId: string; disabled: boolean; onApply: (product: ReusableProduct) => boolean; close: () => void;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (selectedId) reviewHeading.current?.focus(); }, [selectedId]);
  const products = trpc.listing.getReusableProducts.useQuery({ expectedOwnerId: sellerId, query: query || undefined, page }, {
    retry: false, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false,
  });
  const owned = products.data?.ownerId === sellerId && products.data.page === page && !products.isError;
  const items = owned ? products.data!.items : [];
  const selected = items.find(item => item.id === selectedId);
  const canApply = !disabled && !products.isFetching && Boolean(selected);
  const changePage = (next: number) => { setSelectedId(null); setProblem(null); setPage(next); };
  return <DialogContent className="flex max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
    <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5 text-left sm:px-6">
      <DialogTitle className="pr-8">Use a previous product</DialogTitle>
      <DialogDescription>Choose one of your listings, then review the specifications to reuse.</DialogDescription>
    </DialogHeader>
    <div className="min-h-0 overflow-y-auto px-5 py-4 sm:px-6">
      <form className="mb-4 flex items-end gap-2" onSubmit={event => { event.preventDefault(); event.stopPropagation(); setSelectedId(null); setProblem(null); setPage(1); setQuery(search.trim()); }}>
        <div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor="previous-product-search">Search previous products</Label><Input id="previous-product-search" value={search} onChange={event => setSearch(event.target.value)} maxLength={120} placeholder="Title, brand or model" /></div>
        <Button type="submit" variant="outline" className="min-h-11"><Search className="mr-2 h-4 w-4" aria-hidden="true" />Search</Button>
      </form>
      {products.isError ? <div role="alert" className="space-y-2 py-3"><p>We couldn&apos;t load your previous products. Your draft is unchanged.</p><Button type="button" variant="outline" onClick={() => void products.refetch()}>Retry loading products</Button></div>
        : products.isFetching ? <p role="status" className="py-4 text-sm text-muted-foreground">Loading your products…</p>
        : !owned ? <p role="status">Checking products for the current account…</p>
        : items.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{query ? "No products match your search. Try a title, brand or model." : "No previous products yet. Enter this product's details in your draft."}</p>
        : <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className={cn("space-y-1", selected && "hidden sm:block")} aria-label="Previous products">{items.map(item => <button key={item.id} type="button" aria-pressed={selectedId === item.id} onClick={() => { setSelectedId(item.id); setProblem(null); }} className={cn("min-h-11 w-full rounded-md border px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selectedId === item.id ? "border-primary bg-accent" : "border-transparent hover:bg-muted")}>
            <span className="block break-words text-sm font-medium">{item.title}</span><span className="mt-1 block text-xs capitalize text-muted-foreground">{item.status}</span>
          </button>)}</div>
          <section aria-label="Product details to reuse" className="min-w-0 border-t pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            {selected ? <><Button type="button" variant="ghost" className="mb-2 min-h-11 px-0 sm:hidden" onClick={() => setSelectedId(null)}>Choose another product</Button><h3 ref={reviewHeading} tabIndex={-1} className="mb-3 text-sm font-semibold outline-none">Review product details</h3><dl className="space-y-2">{REUSABLE_PRODUCT_KEYS.filter(key => selected.product[key] != null).map(key => <div key={key} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3 text-sm"><dt className="text-muted-foreground">{REUSABLE_PRODUCT_LABELS[key]}</dt><dd className="break-words">{displayValue(key, selected.product)}</dd></div>)}</dl>
              {selected.omittedFields.length > 0 && <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">Confirm manually: {selected.omittedFields.map(key => REUSABLE_PRODUCT_LABELS[key]).join(", ")}. Previous values could not be safely reused.</p>}
              <p className="mt-4 text-xs text-muted-foreground">These are seller-declared specifications. Check them against the product label or manufacturer documentation.</p></> : <p className="py-3 text-sm text-muted-foreground">Select a product to review its specifications.</p>}
          </section>
        </div>}
      {(page > 1 || (owned && products.data?.hasMore)) && <nav aria-label="Previous product pages" className="mt-4 flex items-center justify-between gap-2 border-t pt-3"><Button type="button" variant="outline" size="sm" disabled={page === 1 || products.isFetching} onClick={() => changePage(page - 1)}>Previous products</Button><span className="text-sm text-muted-foreground">Page {page}</span><Button type="button" variant="outline" size="sm" disabled={!owned || !products.data?.hasMore || products.isFetching} onClick={() => changePage(page + 1)}>Next products</Button></nav>}
    </div>
    <div className="shrink-0 space-y-3 border-t bg-background px-5 py-4 sm:px-6">
      <p className="text-sm text-muted-foreground">Replaces product specifications. Your title, condition, quantity, prices, packing, pickup details and photos stay as entered. Review them for this product.</p>
      {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      <DialogFooter className="gap-2"><Button type="button" variant="outline" className="min-h-11" onClick={close}>Cancel</Button><Button type="button" className="min-h-11" disabled={!canApply} onClick={() => { if (!canApply || !selected) return; if (onApply(selected.product)) close(); else setProblem("Your draft or account changed. Finish draft recovery before applying product details."); }}>Apply product details</Button></DialogFooter>
    </div>
  </DialogContent>;
}
