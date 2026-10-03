import { MAX_PUBLIC_FILTER_NUMBER } from "@/lib/validators/listing";

/** Optional job context, never an order, a freight quote, or purchase authorization. */
export interface PurchaseIntent { quantitySqFt?: number; zip?: string }

export function parsePurchaseIntent(input: { quantitySqFt?: unknown; zip?: unknown }): PurchaseIntent {
  const raw = input.quantitySqFt;
  const number = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : NaN;
  const quantitySqFt = Number.isFinite(number) && number > 0 && number <= MAX_PUBLIC_FILTER_NUMBER ? number : undefined;
  const zip = typeof input.zip === "string" && /^\d{5}$/.test(input.zip) ? input.zip : undefined;
  return { quantitySqFt, zip };
}

export function purchaseIntentFromParams(params: Pick<URLSearchParams, "getAll">): PurchaseIntent {
  const one = (name: string) => { const values = params.getAll(name); return values.length === 1 ? values[0] : undefined; };
  return parsePurchaseIntent({ quantitySqFt: one("jobSqFt"), zip: one("jobZip") });
}

export function withPurchaseIntent(path: string, intent?: PurchaseIntent): string {
  const url = new URL(path, "https://marketplace.invalid");
  const checked = parsePurchaseIntent(intent ?? {});
  url.searchParams.delete("jobSqFt"); url.searchParams.delete("jobZip");
  if (checked.quantitySqFt !== undefined) url.searchParams.set("jobSqFt", String(checked.quantitySqFt));
  if (checked.zip) url.searchParams.set("jobZip", checked.zip);
  return url.pathname + url.search + url.hash;
}
