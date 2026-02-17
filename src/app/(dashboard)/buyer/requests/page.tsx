"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  FileText,
  Plus,
  MessageSquare,
  MapPin,
  Clock,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  open: "default",
  closed: "secondary",
  matched: "secondary",
  expired: "destructive",
};

const URGENCY_LABEL: Record<string, string> = {
  asap: "ASAP",
  "2_weeks": "2 Weeks",
  "4_weeks": "4 Weeks",
  flexible: "Flexible",
};

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuyerRequestsPage() {
  const { data, isLoading } = trpc.buyerRequest.getMyRequests.useQuery({
    page: 1,
    limit: 20,
  });

  const requests = data?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Requests</h1>
          <p className="text-muted-foreground mt-1">
            Post what you need and let sellers come to you
          </p>
        </div>
        <Link href="/buyer/requests/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            New Request
          </Button>
        </Link>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-muted/20">
          <FileText
            className="mx-auto h-12 w-12 text-muted-foreground mb-4"
            aria-hidden="true"
          />
          <h3 className="text-lg font-semibold">No requests yet</h3>
          <p className="text-muted-foreground mt-1 mb-4">
            Post what you&apos;re looking for and sellers will respond!
          </p>
          <Link href="/buyer/requests/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Post a Request
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <Link key={req.id} href={`/buyer/requests/${req.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Title + status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-semibold truncate">{req.title}</h2>
                        <Badge
                          variant={STATUS_VARIANT[req.status] ?? "outline"}
                          className="capitalize"
                        >
                          {req.status}
                        </Badge>
                      </div>

                      {/* Material badges */}
                      {req.materialTypes && req.materialTypes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {req.materialTypes.map((m) => (
                            <Badge
                              key={m}
                              variant="outline"
                              className="text-xs"
                            >
                              {m.replace("_", " ")}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Key details */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {req.minTotalSqFt || req.maxTotalSqFt ? (
                          <span>
                            {req.minTotalSqFt?.toLocaleString() ?? "0"}
                            {req.maxTotalSqFt
                              ? `–${req.maxTotalSqFt.toLocaleString()}`
                              : "+"}
                            {" sqft"}
                          </span>
                        ) : null}
                        {req.priceMaxPerSqFt && (
                          <span>Up to ${req.priceMaxPerSqFt}/sqft</span>
                        )}
                        {req.destinationZip && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {req.destinationZip}
                          </span>
                        )}
                        {req.urgency && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {URGENCY_LABEL[req.urgency] ?? req.urgency}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right side metadata */}
                    <div className="flex flex-col items-end gap-2 shrink-0 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MessageSquare
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        <span>
                          {req.responseCount ?? 0}{" "}
                          {req.responseCount === 1 ? "response" : "responses"}
                        </span>
                      </div>
                      <span>{formatDate(req.createdAt)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {data && data.total > requests.length && (
        <p className="text-sm text-muted-foreground text-center">
          Showing {requests.length} of {data.total} requests
        </p>
      )}
    </div>
  );
}
