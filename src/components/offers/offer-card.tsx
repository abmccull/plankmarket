import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OfferStatusBadge } from "./offer-status-badge";
import { formatCurrency, formatSqFt, formatRelativeTime } from "@/lib/utils";
import { ArrowRight, AlertCircle } from "lucide-react";
import type { OfferListItem } from "@/lib/types/offer";

interface OfferCardProps {
  offer: OfferListItem;
  currentUserId: string;
  userRole: "buyer" | "seller";
}

export function OfferCard({ offer, currentUserId, userRole }: OfferCardProps) {
  const isYourTurn =
    offer.lastActorId &&
    offer.lastActorId !== currentUserId &&
    (offer.status === "pending" || offer.status === "countered");

  const otherParty = userRole === "buyer" ? offer.seller : offer.buyer;
  const otherPartyName = otherParty.displayName;

  // Determine current price (counter if available, else offer)
  const currentPrice = offer.counterPricePerSqFt ?? offer.offerPricePerSqFt;
  const currentTotal = currentPrice * offer.quantitySqFt;

  return (
    <Link href={`/offers/${offer.id}`} className="block min-w-0">
      <Card className="relative p-[min(1rem,16px)] transition-colors hover:bg-muted/30">
        {isYourTurn && (
          <div className="absolute -top-2 -right-2">
            <Badge className="bg-primary text-primary-foreground shadow-md">
              <AlertCircle className="h-3 w-3 mr-1" />
              Your Turn
            </Badge>
          </div>
        )}

        <div className="space-y-3">
          {/* Header */}
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between">
            <div className="min-w-0 w-full sm:flex-1">
              <h2 className="font-semibold break-words [overflow-wrap:anywhere]">
                {offer.listing.title}
              </h2>
              <p className="text-sm text-muted-foreground break-words [overflow-wrap:anywhere]">
                {userRole === "buyer" ? "Seller" : "Buyer"}: {otherPartyName}
              </p>
            </div>
            <OfferStatusBadge status={offer.status} />
          </div>

          {/* Price info */}
          <div className="grid grid-cols-1 gap-3 text-sm [overflow-wrap:anywhere] min-[480px]:grid-cols-3">
            <div>
              <p className="text-muted-foreground">Current price</p>
              <p className="font-semibold tabular-nums">
                {formatCurrency(currentPrice)}/sq ft
              </p>
            </div>
            <div className="min-w-0 min-[480px]:text-right">
              <p className="text-muted-foreground">Quantity</p>
              <p className="font-medium tabular-nums">
                {formatSqFt(offer.quantitySqFt)}
              </p>
            </div>
            <div className="min-w-0 min-[480px]:text-right">
              <p className="text-muted-foreground">Merchandise subtotal</p>
              <p className="font-semibold tabular-nums">
                {formatCurrency(currentTotal)}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
            <span>Round {offer.currentRound}</span>
            {offer.expiresAt &&
              (offer.status === "pending" || offer.status === "countered") && (
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  Response deadline:{" "}
                  <time dateTime={new Date(offer.expiresAt).toISOString()}>
                    {new Date(offer.expiresAt).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </span>
              )}
            <div className="flex items-center gap-2">
              <span>{formatRelativeTime(offer.updatedAt)}</span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
