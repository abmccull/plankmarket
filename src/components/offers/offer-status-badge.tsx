import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type OfferStatus = "pending" | "countered" | "accepted" | "rejected" | "withdrawn" | "expired";

interface OfferStatusBadgeProps {
  status: OfferStatus;
  className?: string;
}

const statusConfig: Record<OfferStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
  pending: {
    label: "Pending",
    variant: "outline",
    className: "border-yellow-500 text-yellow-700 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-400",
  },
  countered: {
    label: "Countered",
    variant: "outline",
    className: "border-blue-500 text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-400",
  },
  accepted: {
    label: "Accepted",
    variant: "outline",
    className: "border-green-500 text-green-700 bg-green-50 dark:bg-green-950 dark:text-green-400",
  },
  rejected: {
    label: "Rejected",
    variant: "destructive",
    className: "",
  },
  withdrawn: {
    label: "Withdrawn",
    variant: "secondary",
    className: "",
  },
  expired: {
    label: "Expired",
    variant: "secondary",
    className: "",
  },
};

export function OfferStatusBadge({ status, className }: OfferStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
