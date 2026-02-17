"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  Card,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ClipboardList,
  Loader2,
  MapPin,
  Clock,
  MessageSquare,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const MATERIAL_OPTIONS = [
  { value: "", label: "All Materials" },
  { value: "hardwood", label: "Hardwood" },
  { value: "engineered", label: "Engineered" },
  { value: "laminate", label: "Laminate" },
  { value: "vinyl_lvp", label: "Vinyl / LVP" },
  { value: "bamboo", label: "Bamboo" },
  { value: "tile", label: "Tile" },
  { value: "other", label: "Other" },
] as const;

type MaterialFilter = "" | "hardwood" | "engineered" | "laminate" | "vinyl_lvp" | "bamboo" | "tile" | "other";

const URGENCY_FILTER_OPTIONS = [
  { value: "", label: "Any Urgency" },
  { value: "asap", label: "ASAP" },
  { value: "2_weeks", label: "2 Weeks" },
  { value: "4_weeks", label: "4 Weeks" },
  { value: "flexible", label: "Flexible" },
] as const;

type UrgencyFilter = "" | "asap" | "2_weeks" | "4_weeks" | "flexible";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "urgency", label: "Most Urgent" },
  { value: "sqft_desc", label: "Largest Lot" },
  { value: "price_desc", label: "Highest Price" },
] as const;

type SortOption = "newest" | "urgency" | "sqft_desc" | "price_desc";

const URGENCY_LABEL: Record<string, string> = {
  asap: "ASAP",
  "2_weeks": "2 Weeks",
  "4_weeks": "4 Weeks",
  flexible: "Flexible",
};

const URGENCY_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  asap: "destructive",
  "2_weeks": "default",
  "4_weeks": "secondary",
  flexible: "outline",
};

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ─── Request type ─────────────────────────────────────────────────────────────

type BuyerRequest = {
  id: string;
  title: string;
  materialTypes: string[] | null;
  minTotalSqFt: number | null;
  maxTotalSqFt: number | null;
  priceMaxPerSqFt: number | null;
  destinationZip: string;
  urgency: string | null;
  responseCount: number;
  createdAt: Date;
};

// ─── Respond Dialog ───────────────────────────────────────────────────────────

type ActiveListing = {
  id: string;
  title: string;
};

function RespondDialog({
  request,
  open,
  onOpenChange,
  listings,
}: {
  request: BuyerRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listings: ActiveListing[];
}) {
  const [message, setMessage] = useState("");
  const [selectedListingId, setSelectedListingId] = useState<string>("");

  const respondMutation = trpc.buyerRequest.respond.useMutation();

  const handleSubmit = async () => {
    if (!request) return;
    if (!message.trim()) {
      toast.error("Please enter a message.");
      return;
    }

    try {
      await respondMutation.mutateAsync({
        requestId: request.id,
        message: message.trim(),
        listingId: selectedListingId || undefined,
      });
      toast.success("Response sent!");
      setMessage("");
      setSelectedListingId("");
      onOpenChange(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to send response.";
      toast.error(msg);
    }
  };

  const handleClose = () => {
    setMessage("");
    setSelectedListingId("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Respond to Request</DialogTitle>
          <DialogDescription>
            {request?.title ?? "Buyer Request"} — let the buyer know you can
            help.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="respond-message">Your Message</Label>
            <Textarea
              id="respond-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Describe how you can fulfill this request..."
            />
            <p className="text-xs text-muted-foreground text-right">
              {message.length}/2000
            </p>
          </div>

          {listings.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="respond-listing">
                Attach a Listing (optional)
              </Label>
              <Select
                value={selectedListingId}
                onValueChange={setSelectedListingId}
              >
                <SelectTrigger id="respond-listing">
                  <SelectValue placeholder="Select one of your listings..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No listing</SelectItem>
                  {listings.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={respondMutation.isPending}>
            {respondMutation.isPending && (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            )}
            Send Response
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestBoardCard({
  request,
  onRespond,
}: {
  request: BuyerRequest;
  onRespond: (req: BuyerRequest) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold truncate">
                {request.title || "Untitled Request"}
              </h2>
              {request.urgency && (
                <Badge
                  variant={URGENCY_VARIANT[request.urgency] ?? "outline"}
                  className="text-xs"
                >
                  {URGENCY_LABEL[request.urgency] ?? request.urgency}
                </Badge>
              )}
            </div>

            {request.materialTypes && request.materialTypes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {request.materialTypes.map((m) => (
                  <Badge key={m} variant="outline" className="text-xs">
                    {m.replace("_", " ")}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {(request.minTotalSqFt || request.maxTotalSqFt) && (
                <span>
                  {request.minTotalSqFt?.toLocaleString() ?? "0"}
                  {request.maxTotalSqFt
                    ? `–${request.maxTotalSqFt.toLocaleString()}`
                    : "+"}
                  {" sqft"}
                </span>
              )}
              {request.priceMaxPerSqFt && (
                <span>Up to ${request.priceMaxPerSqFt}/sqft</span>
              )}
              {request.destinationZip && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {request.destinationZip}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {formatDate(request.createdAt)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              {request.responseCount ?? 0}
            </div>
            <Button
              size="sm"
              onClick={() => onRespond(request)}
              aria-label={`Respond to request: ${request.title || "Untitled Request"}`}
            >
              Respond
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SellerRequestBoardPage() {
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>("");
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [respondTarget, setRespondTarget] = useState<BuyerRequest | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = trpc.buyerRequest.browse.useQuery({
    materialTypes: materialFilter ? [materialFilter] : undefined,
    urgency: urgencyFilter || undefined,
    sort: sortBy,
    page: 1,
    limit: 30,
  });

  const { data: myListingsData } = trpc.listing.getMyListings.useQuery({
    page: 1,
    limit: 100,
    status: "active",
  });

  const activeListings: ActiveListing[] = (myListingsData?.items ?? []).map(
    (l: { id: string; title: string }) => ({ id: l.id, title: l.title })
  );

  const requests: BuyerRequest[] = data?.items ?? [];

  const handleRespond = (req: BuyerRequest) => {
    setRespondTarget(req);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ClipboardList
            className="h-6 w-6 text-primary"
            aria-hidden="true"
          />
          <h1 className="text-3xl font-bold">Request Board</h1>
        </div>
        <p className="text-muted-foreground">
          Browse open buyer requests and respond with your inventory
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1">
          <Label
            htmlFor="filter-material"
            className="text-xs text-muted-foreground"
          >
            Material
          </Label>
          <Select
            value={materialFilter}
            onValueChange={(v) => setMaterialFilter(v as MaterialFilter)}
          >
            <SelectTrigger id="filter-material" className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATERIAL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label
            htmlFor="filter-urgency"
            className="text-xs text-muted-foreground"
          >
            Urgency
          </Label>
          <Select
            value={urgencyFilter}
            onValueChange={(v) => setUrgencyFilter(v as UrgencyFilter)}
          >
            <SelectTrigger id="filter-urgency" className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {URGENCY_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label
            htmlFor="filter-sort"
            className="text-xs text-muted-foreground"
          >
            Sort
          </Label>
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as SortOption)}
          >
            <SelectTrigger id="filter-sort" className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-muted/20">
          <ClipboardList
            className="mx-auto h-12 w-12 text-muted-foreground mb-4"
            aria-hidden="true"
          />
          <h3 className="text-lg font-semibold">No open requests</h3>
          <p className="text-muted-foreground mt-1">
            No buyer requests match your filters right now. Try adjusting the
            filters or check back soon.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <RequestBoardCard
              key={req.id}
              request={req}
              onRespond={handleRespond}
            />
          ))}
        </div>
      )}

      {data && data.total > requests.length && (
        <p className="text-sm text-muted-foreground text-center">
          Showing {requests.length} of {data.total} requests
        </p>
      )}

      {/* Respond Dialog */}
      <RespondDialog
        request={respondTarget}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        listings={activeListings}
      />

      {/* Accessible empty state description for screen readers */}
      <CardDescription className="sr-only">
        Request board showing open buyer requests from the platform
      </CardDescription>
    </div>
  );
}
