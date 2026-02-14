import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OfferStatusBadge } from "./offer-status-badge";
import { formatCurrency, formatSqFt, formatRelativeTime } from "@/lib/utils";
import { ArrowRight, AlertCircle } from "lucide-react";
import { getAnonymousDisplayName } from "@/lib/identity/display-name";

type OfferStatus = "pending" | "countered" | "accepted" | "rejected" | "withdrawn" | "expired";

interface OfferCardProps {
  offer: {
    id: string;
    status: OfferStatus;
    currentRound: number;
    offerPricePerSqFt: number;
    counterPricePerSqFt: number | null;
    quantitySqFt: number;
    totalPrice: number;
    lastActorId: string | null;
    updatedAt: Date;
    listing: {
      id: string;
      title: string;
    };
    buyer: {
      id: string;
      role: string;
      businessState: string | null;
    };
    seller: {
      id: string;
      role: string;
      businessState: string | null;
    };
  };
  currentUserId: string;
  userRole: "buyer" | "seller";
}

export function OfferCard({ offer, currentUserId, userRole }: OfferCardProps) {
  const isYourTurn =
    offer.lastActorId &&
    offer.lastActorId !== currentUserId &&
    (offer.status === "pending" || offer.status === "countered");

  const otherParty = userRole === "buyer" ? offer.seller : offer.buyer;
  const otherPartyName = getAnonymousDisplayName({ role: otherParty.role, businessState: otherParty.businessState });

  // Determine current price (counter if available, else offer)
  const currentPrice = offer.counterPricePerSqFt || offer.offerPricePerSqFt;
  const currentTotal = currentPrice * offer.quantitySqFt;

  return (
    <Link href={`/offers/${offer.id}`}>
      <Card className="p-4 hover:bg-muted/30 transition-colors relative">
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
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{offer.listing.title}</h3>
              <p className="text-sm text-muted-foreground">
                {userRole === "buyer" ? "Seller" : "Buyer"}: {otherPartyName}
              </p>
            </div>
            <OfferStatusBadge status={offer.status} />
          </div>

          {/* Price info */}
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-muted-foreground">Current price</p>
              <p className="font-semibold tabular-nums">
                {formatCurrency(currentPrice)}/sq ft
              </p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground">Quantity</p>
              <p className="font-medium tabular-nums">
                {formatSqFt(offer.quantitySqFt)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground">Total</p>
              <p className="font-semibold tabular-nums">
                {formatCurrency(currentTotal)}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <span>Round {offer.currentRound}</span>
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
