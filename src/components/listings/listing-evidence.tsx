import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  MapPin,
  PackageCheck,
  ShieldAlert,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatSqFt } from "@/lib/utils";
import type { ListingFreshnessStatus } from "@/lib/listing-freshness";

export type FreightEstimateStatus =
  | "quote_request_ready"
  | "seller_setup_required";

export interface ListingEvidenceData {
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

type ListingEvidenceBadgeVariant =
  | "secondary"
  | "outline"
  | "warning"
  | "destructive"
  | "verified";

interface ListingEvidenceBadgeData {
  label: string;
  variant: ListingEvidenceBadgeVariant;
  icon: typeof Clock3;
}

interface ListingEvidenceAlert {
  tone: "warning" | "blocked";
  title: string;
  detail: string;
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
        ? `Confirmed ${confirmedOn}; recheck soon`
        : "Seller reconfirming soon";
    case "overdue":
      return "Seller reconfirmation overdue";
    case "unconfirmed":
      return "Seller confirmation pending";
    default:
      return null;
  }
}

function getFreshnessBadge(
  listing: ListingEvidenceData,
): ListingEvidenceBadgeData | null {
  const freshnessLabel = getFreshnessLabel(listing);

  switch (listing.freshnessStatus) {
    case "fresh":
      return freshnessLabel
        ? {
            label: freshnessLabel,
            variant: "secondary",
            icon: Clock3,
          }
        : null;
    case "reconfirm_soon":
      return freshnessLabel
        ? {
            label: freshnessLabel,
            variant: "warning",
            icon: Clock3,
          }
        : null;
    case "overdue":
      return {
        label: "Confirmation overdue",
        variant: "destructive",
        icon: Clock3,
      };
    case "unconfirmed":
      return {
        label: "Confirmation pending",
        variant: "warning",
        icon: Clock3,
      };
    default:
      return null;
  }
}

function getEvidenceBadges(listing: ListingEvidenceData) {
  const hasPhotos = Boolean(listing.media?.length);
  const freightReady =
    listing.freightEstimateStatus === "quote_request_ready";
  const badges: ListingEvidenceBadgeData[] = [];
  const freshnessBadge = getFreshnessBadge(listing);

  if (freshnessBadge) {
    badges.push(freshnessBadge);
  }

  badges.push(
    listing.seller?.verified
      ? {
          label: "Verified seller",
          variant: "verified",
          icon: ShieldCheck,
        }
      : {
          label: "Seller not verified",
          variant: "warning",
          icon: ShieldAlert,
        },
  );

  badges.push(
    hasPhotos
      ? {
          label: `Photos on file (${listing.media?.length ?? 0})`,
          variant: "outline",
          icon: Camera,
        }
      : {
          label: "No listing photos",
          variant: "warning",
          icon: Camera,
        },
  );

  badges.push(
    freightReady
      ? {
          label: "Freight quote request ready",
          variant: "secondary",
          icon: Truck,
        }
      : {
          label: "Freight setup incomplete",
          variant: "warning",
          icon: Truck,
        },
  );

  return badges;
}

export function getListingEvidenceStatusBadge(listing: ListingEvidenceData): {
  label: string;
  variant: "warning" | "destructive";
} | null {
  if (listing.freshnessStatus === "overdue") {
    return { label: "Needs reconfirmation", variant: "destructive" };
  }

  if (listing.freshnessStatus === "unconfirmed") {
    return { label: "Confirmation pending", variant: "warning" };
  }

  if (listing.freightEstimateStatus !== "quote_request_ready") {
    return { label: "Freight follow-up", variant: "warning" };
  }

  if (!listing.seller?.verified) {
    return { label: "Seller unverified", variant: "warning" };
  }

  if (listing.freshnessStatus === "reconfirm_soon") {
    return { label: "Recheck soon", variant: "warning" };
  }

  return null;
}

export function getListingEvidenceAlerts(
  listing: ListingEvidenceData,
): ListingEvidenceAlert[] {
  const alerts: ListingEvidenceAlert[] = [];

  if (listing.freshnessStatus === "overdue") {
    alerts.push({
      tone: "blocked",
      title: "Inventory reconfirmation is overdue",
      detail:
        "Treat quantity and condition as stale until the seller refreshes this listing.",
    });
  } else if (listing.freshnessStatus === "unconfirmed") {
    alerts.push({
      tone: "blocked",
      title: "Inventory confirmation is still pending",
      detail:
        "The lot is visible, but the seller has not completed a current availability confirmation.",
    });
  } else if (listing.freshnessStatus === "reconfirm_soon") {
    alerts.push({
      tone: "warning",
      title: "Inventory confirmation is aging out soon",
      detail:
        "Plan to recheck quantity and condition before relying on this listing for a live deal.",
    });
  }

  if (!listing.seller?.verified) {
    alerts.push({
      tone: "warning",
      title: "Seller verification is missing",
      detail:
        "This seller has not completed business verification. Confirm identity and terms before paying.",
    });
  }

  if (listing.freightEstimateStatus !== "quote_request_ready") {
    alerts.push({
      tone: "blocked",
      title: "Freight quote setup is incomplete",
      detail:
        "Destination-specific freight cannot be requested from this listing until the seller completes freight setup.",
    });
  }

  return alerts;
}

function EvidenceAlertCard({ alert }: { alert: ListingEvidenceAlert }) {
  const blocked = alert.tone === "blocked";

  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        blocked
          ? "border-destructive/30 bg-destructive/5"
          : "border-amber-300/40 bg-amber-50/60 dark:bg-amber-950/10",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            blocked
              ? "bg-destructive/10 text-destructive"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
          )}
        >
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant={blocked ? "destructive" : "warning"}>
              {blocked ? "Blocked" : "Warning"}
            </Badge>
            <p className="text-sm font-semibold">{alert.title}</p>
          </div>
          <p className="text-sm text-muted-foreground">{alert.detail}</p>
        </div>
      </div>
    </div>
  );
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
  const alerts = getListingEvidenceAlerts(listing);
  const badges = getEvidenceBadges(listing);

  if (variant === "compact") {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <Badge
              key={badge.label}
              variant={badge.variant}
              className="gap-1 text-[11px]"
            >
              <badge.icon className="h-3 w-3" aria-hidden="true" />
              {badge.label}
            </Badge>
          ))}
        </div>
        <dl className="grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <dt className="sr-only">Minimum order</dt>
            <dd>MOQ: {formatMoq(listing.moq, listing.moqUnit)}</dd>
          </div>
          <div>
            <dt className="sr-only">Origin region</dt>
            <dd>{originRegion ? `Origin: ${originRegion}` : "Origin not provided"}</dd>
          </div>
        </dl>
      </div>
    );
  }

  const knownNowItems = [
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
      icon: listing.seller?.verified ? ShieldCheck : ShieldAlert,
    },
    {
      label: "Inventory confirmation",
      value: freshnessLabel ?? "Seller confirmation pending",
      icon: Clock3,
    },
    {
      label: "Listing photos",
      value: hasPhotos
        ? `${listing.media?.length ?? 0} listing photo${listing.media?.length === 1 ? "" : "s"}`
        : "No listing photos",
      icon: Camera,
    },
  ];

  const calculatedLaterItems = [
    {
      label: "Freight quote",
      value: freightReady
        ? "Calculated after destination details are entered at checkout"
        : "Blocked until seller freight setup is complete",
      detail: freightReady
        ? "The listing does not include a delivered price."
        : "Use seller contact before relying on shipping timing or landed cost.",
      icon: Truck,
      blocked: !freightReady,
    },
  ];

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap gap-1.5">
        {badges.map((badge) => (
          <Badge key={badge.label} variant={badge.variant} className="gap-1">
            <badge.icon className="h-3 w-3" aria-hidden="true" />
            {badge.label}
          </Badge>
        ))}
      </div>

      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <EvidenceAlertCard key={`${alert.tone}-${alert.title}`} alert={alert} />
          ))}
        </div>
      )}

      <section className="space-y-3" aria-labelledby="listing-evidence-known-now">
        <div>
          <h3
            id="listing-evidence-known-now"
            className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground"
          >
            Known now
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            These details come directly from the public listing and seller account.
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {knownNowItems.map((item) => (
            <div key={item.label} className="rounded-lg border bg-muted/20 p-3">
              <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {item.label}
              </dt>
              <dd className="mt-1 text-sm font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3" aria-labelledby="listing-evidence-calculated-later">
        <div>
          <h3
            id="listing-evidence-calculated-later"
            className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground"
          >
            Calculated later
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Final delivered cost depends on destination-specific freight details.
          </p>
        </div>
        <dl className="grid gap-3">
          {calculatedLaterItems.map((item) => (
            <div
              key={item.label}
              className={cn(
                "rounded-lg border p-3",
                item.blocked
                  ? "border-amber-300/40 bg-amber-50/60 dark:bg-amber-950/10"
                  : "bg-muted/20",
              )}
            >
              <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {item.label}
              </dt>
              <dd className="mt-1 space-y-1">
                <span className="block text-sm font-medium">{item.value}</span>
                <span className="block text-sm text-muted-foreground">{item.detail}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
