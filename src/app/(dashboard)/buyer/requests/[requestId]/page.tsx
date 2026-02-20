"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  MessageSquare,
  CheckCircle,
  XCircle,
  ExternalLink,
  MapPin,
  Clock,
  ImageIcon,
} from "lucide-react";
import Image from "next/image";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const URGENCY_LABEL: Record<string, string> = {
  asap: "ASAP",
  "2_weeks": "2 Weeks",
  "4_weeks": "4 Weeks",
  flexible: "Flexible",
};

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Detail Row helper ────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

// ─── Response Card ────────────────────────────────────────────────────────────

type ResponseItem = {
  id: string;
  message: string;
  status: "sent" | "viewed" | "accepted" | "declined";
  sellerId: string;
  listingId: string | null;
  requestId: string;
};

function ResponseCard({
  response,
  onAccept,
  onDecline,
  actingId,
}: {
  response: ResponseItem;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  actingId: string | null;
}) {
  const isPending =
    response.status === "sent" || response.status === "viewed";
  const isThisActing = actingId === response.id;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm text-muted-foreground">
            Seller response
          </span>
          <Badge
            variant={
              response.status === "accepted"
                ? "default"
                : response.status === "declined"
                ? "destructive"
                : "secondary"
            }
            className="capitalize"
          >
            {response.status}
          </Badge>
        </div>

        <p className="text-sm text-foreground whitespace-pre-line">
          {response.message}
        </p>

        {response.listingId && (
          <div>
            <Separator className="mb-3" />
            <Link
              href={`/listings/${response.listingId}`}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink
                className="h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>View attached listing</span>
            </Link>
          </div>
        )}

        {isPending && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => onAccept(response.id)}
              disabled={!!actingId}
              aria-label="Accept this response"
            >
              {isThisActing ? (
                <Loader2
                  className="mr-2 h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <CheckCircle
                  className="mr-2 h-3.5 w-3.5"
                  aria-hidden="true"
                />
              )}
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDecline(response.id)}
              disabled={!!actingId}
              aria-label="Decline this response"
            >
              <XCircle className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Decline
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuyerRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = use(params);
  const [actingResponseId, setActingResponseId] = useState<string | null>(null);

  const {
    data: req,
    isLoading,
    refetch,
  } = trpc.buyerRequest.getRequest.useQuery(
    { requestId },
    { enabled: !!requestId }
  );

  const acceptMutation = trpc.buyerRequest.acceptResponse.useMutation();
  const declineMutation = trpc.buyerRequest.declineResponse.useMutation();

  const handleAccept = async (responseId: string) => {
    setActingResponseId(responseId);
    try {
      await acceptMutation.mutateAsync({ responseId });
      toast.success("Response accepted!");
      refetch();
    } catch {
      toast.error("Failed to accept response.");
    } finally {
      setActingResponseId(null);
    }
  };

  const handleDecline = async (responseId: string) => {
    setActingResponseId(responseId);
    try {
      await declineMutation.mutateAsync({ responseId });
      toast.success("Response declined.");
      refetch();
    } catch {
      toast.error("Failed to decline response.");
    } finally {
      setActingResponseId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!req) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Request not found.</p>
        <Link href="/buyer/requests" className="mt-4 inline-block">
          <Button variant="outline">Back to Requests</Button>
        </Link>
      </div>
    );
  }

  const responses: ResponseItem[] = req.responses ?? [];

  // Access specs from the nested specs object
  const specs = req.specs as
    | {
        thicknessMinMm?: number;
        wearLayerMinMil?: number;
        waterproofRequired?: boolean;
        species?: string[];
      }
    | null
    | undefined;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/buyer/requests">
          <Button variant="ghost" size="icon" aria-label="Back to requests">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">
            {req.title || "Untitled Request"}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Posted {formatDate(req.createdAt)}
          </p>
        </div>
        <Badge
          variant={req.status === "open" ? "default" : "secondary"}
          className="capitalize shrink-0"
        >
          {req.status}
        </Badge>
      </div>

      {/* Request Details */}
      <Card>
        <CardHeader>
          <CardTitle>Request Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 divide-y">
          {req.materialTypes && req.materialTypes.length > 0 && (
            <div className="py-1.5">
              <span className="text-sm text-muted-foreground block mb-1">
                Material Types
              </span>
              <div className="flex flex-wrap gap-1">
                {req.materialTypes.map((m) => (
                  <Badge key={m} variant="outline" className="text-xs">
                    {m.replace("_", " ")}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <DetailRow
            label="Square Footage"
            value={
              req.minTotalSqFt || req.maxTotalSqFt
                ? `${req.minTotalSqFt?.toLocaleString() ?? "0"}${
                    req.maxTotalSqFt
                      ? `–${req.maxTotalSqFt.toLocaleString()}`
                      : "+"
                  } sqft`
                : "—"
            }
          />

          <DetailRow
            label="Budget (per sqft)"
            value={
              req.priceMinPerSqFt || req.priceMaxPerSqFt
                ? `$${req.priceMinPerSqFt ?? "0"} – $${
                    req.priceMaxPerSqFt ?? "any"
                  }`
                : "—"
            }
          />

          {req.destinationZip && (
            <DetailRow
              label="Destination ZIP"
              value={
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {req.destinationZip}
                </span>
              }
            />
          )}

          <DetailRow
            label="Urgency"
            value={
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {URGENCY_LABEL[req.urgency ?? "flexible"] ?? req.urgency}
              </span>
            }
          />

          {req.pickupOk && (
            <DetailRow
              label="Pickup"
              value={
                req.pickupRadiusMiles
                  ? `Within ${req.pickupRadiusMiles} miles`
                  : "Yes"
              }
            />
          )}

          <DetailRow
            label="Shipping"
            value={req.shippingOk ? "Accepted" : "Not accepted"}
          />

          {specs?.waterproofRequired && (
            <DetailRow label="Waterproof" value="Required" />
          )}

          {specs?.thicknessMinMm != null && (
            <DetailRow
              label="Min Thickness"
              value={`${specs.thicknessMinMm}mm`}
            />
          )}

          {specs?.wearLayerMinMil != null && (
            <DetailRow
              label="Min Wear Layer"
              value={`${specs.wearLayerMinMil} mil`}
            />
          )}

          {specs?.species && specs.species.length > 0 && (
            <DetailRow label="Species" value={specs.species.join(", ")} />
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {req.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{req.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Reference Photos */}
      {req.media && req.media.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" aria-hidden="true" />
              Reference Photos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {req.media.map((img: { id: string; url: string; fileName?: string | null }) => (
                <div
                  key={img.id}
                  className="relative aspect-square rounded-lg overflow-hidden border bg-muted"
                >
                  <Image
                    src={img.url}
                    alt={img.fileName || "Reference photo"}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Responses */}
      <section aria-labelledby="responses-heading">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare
            className="h-5 w-5 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 id="responses-heading" className="text-xl font-semibold">
            Responses ({responses.length})
          </h2>
        </div>

        {responses.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <CardDescription>
                No responses yet. Sellers will be notified of your request.
              </CardDescription>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {responses.map((response) => (
              <ResponseCard
                key={response.id}
                response={response}
                onAccept={handleAccept}
                onDecline={handleDecline}
                actingId={actingResponseId}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
