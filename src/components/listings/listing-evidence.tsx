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
    timeZone: "UTC",
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
  const freightReady = listing.freightEstimateStatus === "quote_request_ready";
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
    <div className="flex items-start gap-2 border-l-2 border-current pl-3">
      <AlertTriangle
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          blocked ? "text-destructive" : "text-amber-800 dark:text-amber-300",
        )}
        aria-hidden="true"
      />
      <div>
        <p className="text-sm font-semibold">
          <span
            className={cn(
              "mr-2 text-xs",
              blocked
                ? "text-destructive"
                : "text-amber-800 dark:text-amber-300",
            )}
          >
            {blocked ? "Blocked" : "Warning"}
          </span>
          {alert.title}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{alert.detail}</p>
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
  const freightReady = listing.freightEstimateStatus === "quote_request_ready";
  const freshnessLabel = getFreshnessLabel(listing);
  const alerts = getListingEvidenceAlerts(listing);
  const badges = getEvidenceBadges(listing);

  if (variant === "compact") {
    return (
      <div className={cn("space-y-2 text-xs", className)}>
        <dl className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          <div>
            <dt className="sr-only">Origin region</dt>
            <dd>{originRegion || "Origin not provided"}</dd>
          </div>
          <div className="text-muted-foreground">
            <dt className="sr-only">Minimum order</dt>
            <dd>MOQ: {formatMoq(listing.moq, listing.moqUnit)}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-muted-foreground">
          {badges
            .filter((badge) => !badge.label.startsWith("Photos on file"))
            .map((badge) => (
              <span
                key={badge.label}
                className={cn(
                  "inline-flex min-w-0 items-start gap-1",
                  badge.variant === "destructive" && "text-destructive",
                  badge.variant === "warning" &&
                    "text-amber-800 dark:text-amber-300",
                )}
              >
                <badge.icon
                  className="mt-0.5 h-3 w-3 shrink-0"
                  aria-hidden="true"
                />
                {badge.label}
              </span>
            ))}
        </div>
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
    <div className={cn("space-y-5", className)}>
      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <EvidenceAlertCard key={alert.tone + alert.title} alert={alert} />
          ))}
        </div>
      )}
      <section aria-labelledby="listing-evidence-known-now">
        <h3
          id="listing-evidence-known-now"
          className="mb-2 text-sm font-semibold"
        >
          Known now
        </h3>
        <dl className="divide-y">
          {knownNowItems.map((item) => (
            <div
              key={item.label}
              className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2"
            >
              <dt className="text-sm text-muted-foreground">{item.label}</dt>
              <dd className="text-sm font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="listing-evidence-calculated-later">
        <h3
          id="listing-evidence-calculated-later"
          className="mb-2 text-sm font-semibold"
        >
          Calculated later
        </h3>
        <dl>
          {calculatedLaterItems.map((item) => (
            <div key={item.label} className="space-y-1">
              <dt className="text-sm font-medium">{item.label}</dt>
              <dd className="text-sm text-muted-foreground">
                <span className="block">{item.value}</span>
                <span className="block">{item.detail}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
