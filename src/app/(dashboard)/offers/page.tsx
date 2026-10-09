"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  QueryErrorState,
  StatePanel,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { OfferCard } from "@/components/offers/offer-card";
import { Handshake, ArrowLeft } from "lucide-react";

type OfferStatus =
  | "pending"
  | "countered"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "expired";
const STATUSES = [
  "pending",
  "countered",
  "accepted",
  "rejected",
  "withdrawn",
  "expired",
] as const;

export default function OffersPage() {
  const { user } = useAuthStore();
  return (
    <OffersWorkspace key={user?.id ?? "anonymous"} actorId={user?.id ?? null} />
  );
}

function OffersWorkspace({ actorId }: { actorId: string | null }) {
  const [status, setStatus] = useState<OfferStatus | "all">("all");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.offer.getMyOffers.useQuery(
      { status: status === "all" ? undefined : status, page, limit: 50 },
      { enabled: !!actorId },
    );
  if (data && !isError && page > Math.max(1, data.totalPages))
    setPage(Math.max(1, data.totalPages));

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
          >
            <Link href="/" aria-label="Back to home">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <Handshake
            className="h-6 w-6 shrink-0 text-primary"
            aria-hidden="true"
          />
          <h1 className="text-3xl font-bold">My Offers</h1>
        </div>
        <p className="text-muted-foreground">
          View and manage your offer negotiations
        </p>
      </div>

      <div className="max-w-sm space-y-2">
        <Label htmlFor="offer-status">Offer status</Label>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as OfferStatus | "all");
            setPage(1);
          }}
        >
          <SelectTrigger id="offer-status" className="h-auto min-h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All offers</SelectItem>
            {STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <QueryErrorState
          title="We couldn't load your offers"
          description="Previously loaded offers may appear below. Your status filter is kept; refresh to check current negotiations."
          onRetry={() => void refetch()}
          isRetrying={isFetching}
        />
      )}
      {isLoading ? (
        <StatePanelLoading label="Loading your offers" />
      ) : !data ? null : data.total === 0 && !isError ? (
        <StatePanel
          icon={Handshake}
          title="No offers found"
          description={
            status === "all"
              ? "You haven't made or received any offers yet."
              : `No ${status} offers at the moment.`
          }
          primaryAction={{ label: "Browse listings", href: "/listings" }}
        />
      ) : (
        <div className="space-y-3" aria-label="Your offers">
          {data.offers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              currentUserId={actorId ?? ""}
              userRole={offer.buyerId === actorId ? "buyer" : "seller"}
            />
          ))}
        </div>
      )}

      {data && data.total > 0 && (
        <nav
          aria-label="Offer pages"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <Button
            variant="outline"
            className="h-auto min-h-11 whitespace-normal"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous offers
          </Button>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Page {page} of {Math.max(1, data.totalPages)} · {data.total} offers
          </p>
          <Button
            variant="outline"
            className="h-auto min-h-11 whitespace-normal"
            disabled={page >= data.totalPages || isFetching}
            onClick={() => setPage((value) => value + 1)}
          >
            Next offers
          </Button>
        </nav>
      )}
    </div>
  );
}
