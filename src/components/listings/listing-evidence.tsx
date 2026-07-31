import {
  Camera,
  CheckCircle2,
  Clock3,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatSqFt } from "@/lib/utils";
import type { ListingFreshnessStatus } from "@/lib/listing-freshness";

export type FreightEstimateStatus =
  | "quote_request_ready"
  | "seller_setup_required";

interface ListingEvidenceData {
  totalSqFt: number;
  moq: number | null;
  moqUnit: "pallets" | "sqft" | null;
  condition: string;
  locationCity: string | null;
  locationState: string | null;
  freightEstimateStatus: FreightEstimateStatus;
  freshnessStatus?: ListingFreshnessStatus;
  lastConfirmedAt?: Date | string | null;
  media?: Array<unknown>;
  seller?: { verified: boolean } | null;
}

const conditionLabels: Record<string, string> = {
  new_overstock: "New overstock",
  discontinued: "Discontinued",
  slight_damage: "Slight damage",
  returns: "Returns",
  seconds: "Seconds",
  remnants: "Remnants",
  closeout: "Closeout",
  other: "Other",
};

function formatMoq(moq: number | null, unit: "pallets" | "sqft" | null) {
  if (!moq) return "Full-lot or seller terms";
  if (unit === "pallets") {
    return `${moq.toLocaleString()} pallet${moq === 1 ? "" : "s"}`;
  }
  return formatSqFt(moq);
}

function formatConfirmationDate(value: Date | string | null | undefined) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function getFreshnessLabel(listing: ListingEvidenceData) {
  const confirmedOn = formatConfirmationDate(listing.lastConfirmedAt);

  switch (listing.freshnessStatus) {
    case "fresh":
      return confirmedOn ? `Confirmed ${confirmedOn}` : "Recently confirmed";
    case "reconfirm_soon":
      return confirmedOn
        ? `Confirmed ${confirmedOn} · recheck soon`
        : "Seller reconfirming soon";
    case "overdue":
      return "Seller reconfirmation overdue";
    case "unconfirmed":
      return "Seller confirmation pending";
    default:
      return null;
  }
}

export function ListingEvidence({
  listing,
  variant = "full",
  className,
}: {
  listing: ListingEvidenceData;
  variant?: "compact" | "full";
  className?: string;
}) {
  const hasPhotos = Boolean(listing.media?.length);
  const originRegion = [listing.locationCity, listing.locationState]
    .filter(Boolean)
    .join(", ");
  const freightReady =
    listing.freightEstimateStatus === "quote_request_ready";
  const freshnessLabel = getFreshnessLabel(listing);

  if (variant === "compact") {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex flex-wrap gap-1.5">
          {freshnessLabel && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              <Clock3 className="h-3 w-3" aria-hidden="true" />
              {freshnessLabel}
            </Badge>
          )}
          {listing.seller?.verified && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              Verified seller
            </Badge>
          )}
          <Badge variant="outline" className="gap-1 text-[11px]">
            <Camera className="h-3 w-3" aria-hidden="true" />
            {hasPhotos ? "Photos on file" : "No photos"}
          </Badge>
          <Badge variant="outline" className="gap-1 text-[11px]">
            <Truck className="h-3 w-3" aria-hidden="true" />
            {freightReady ? "Quote request ready" : "Freight setup pending"}
          </Badge>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 text-xs text-muted-foreground">
          <div>
            <dt className="sr-only">Minimum order</dt>
            <dd>MOQ: {formatMoq(listing.moq, listing.moqUnit)}</dd>
          </div>
          <div className="text-right">
            <dt className="sr-only">Origin region</dt>
            <dd>{originRegion ? `Origin: ${originRegion}` : "Origin not provided"}</dd>
          </div>
        </dl>
      </div>
    );
  }

  const items = [
    {
      label: "Available quantity",
      value: formatSqFt(listing.totalSqFt),
      icon: PackageCheck,
    },
    {
      label: "Minimum order",
      value: formatMoq(listing.moq, listing.moqUnit),
      icon: CheckCircle2,
    },
    {
      label: "Seller-reported condition",
      value: conditionLabels[listing.condition] || listing.condition,
      icon: CheckCircle2,
    },
    {
      label: "Origin region",
      value: originRegion || "Not provided",
      icon: MapPin,
    },
    {
      label: "Seller verification",
      value: listing.seller?.verified ? "Verified business" : "Not verified",
      icon: ShieldCheck,
    },
    {
      label: "Inventory confirmation",
      value: freshnessLabel ?? "Seller confirmation pending",
      icon: Clock3,
    },
    {
      label: "Listing photos",
      value: hasPhotos
        ? `${listing.media!.length} listing photo${listing.media!.length === 1 ? "" : "s"}`
        : "No listing photos",
      icon: Camera,
    },
    {
      label: "Freight estimate",
      value: freightReady
        ? "Ready to request at checkout"
        : "Seller freight setup incomplete",
      icon: Truck,
    },
  ];

  return (
    <dl className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border bg-muted/20 p-3">
          <dt className="flex items-center gap-2 text-xs text-muted-foreground">
            <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {item.label}
          </dt>
          <dd className="mt-1 text-sm font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
