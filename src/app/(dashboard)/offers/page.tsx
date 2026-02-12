"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { OfferCard } from "@/components/offers/offer-card";
import { Loader2, Handshake, ArrowLeft } from "lucide-react";

type OfferStatus = "pending" | "countered" | "accepted" | "rejected" | "withdrawn" | "expired";

export default function OffersPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<OfferStatus | "all">("all");

  const { data, isLoading } = trpc.offer.getMyOffers.useQuery({
    status: activeTab === "all" ? undefined : activeTab,
    page: 1,
    limit: 50,
  });

  // Determine user role (buyer or seller) based on offers
  const getUserRole = (
    offer: NonNullable<typeof data>["offers"][0]
  ): "buyer" | "seller" => {
    return offer.buyerId === user?.id ? "buyer" : "seller";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Link href="/">
            <Button variant="ghost" size="icon" aria-label="Back to home">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Handshake className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">My Offers</h1>
          </div>
        </div>
        <p className="text-muted-foreground">
          View and manage your offer negotiations
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as OfferStatus | "all")}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="countered">Countered</TabsTrigger>
          <TabsTrigger value="accepted">Accepted</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : data?.offers.length === 0 ? (
            <div className="text-center py-12 border rounded-lg bg-muted/20">
              <Handshake className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No offers found</h3>
              <p className="text-muted-foreground mt-1">
                {activeTab === "all"
                  ? "You haven't made or received any offers yet."
                  : `No ${activeTab} offers at the moment.`}
              </p>
              <Link href="/listings" className="mt-4 inline-block">
                <Button>Browse Listings</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {data?.offers.map((offer) => (
                <OfferCard
                  key={offer.id}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  offer={offer as any}
                  currentUserId={user?.id || ""}
                  userRole={getUserRole(offer)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Pagination info */}
      {data && data.offers.length > 0 && (
        <div className="text-sm text-muted-foreground text-center">
          Showing {data.offers.length} of {data.total} offers
        </div>
      )}
    </div>
  );
}
