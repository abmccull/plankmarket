"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { QueryErrorState } from "@/components/ui/state-panel";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
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
import {
  ClipboardList,
  Loader2,
  MapPin,
  Clock,
  MessageSquare,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { isListingVisibleToBuyers } from "@/lib/listing-freshness";

// ─── Constants ────────────────────────────────────────────────────────────────

const MATERIAL_OPTIONS = [
  { value: "all", label: "All Materials" },
  { value: "hardwood", label: "Hardwood" },
  { value: "engineered", label: "Engineered" },
  { value: "laminate", label: "Laminate" },
  { value: "vinyl_lvp", label: "Vinyl / LVP" },
  { value: "bamboo", label: "Bamboo" },
  { value: "tile", label: "Tile" },
  { value: "other", label: "Other" },
] as const;

type MaterialFilter =
  | "all"
  | "hardwood"
  | "engineered"
  | "laminate"
  | "vinyl_lvp"
  | "bamboo"
  | "tile"
  | "other";

const URGENCY_FILTER_OPTIONS = [
  { value: "all", label: "Any Urgency" },
  { value: "asap", label: "ASAP" },
  { value: "2_weeks", label: "2 Weeks" },
  { value: "4_weeks", label: "4 Weeks" },
  { value: "flexible", label: "Flexible" },
] as const;

type UrgencyFilter = "all" | "asap" | "2_weeks" | "4_weeks" | "flexible";

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
  thumbnailUrl?: string | null;
};

// ─── Respond Dialog ───────────────────────────────────────────────────────────

type ActiveListing = {
  id: string;
  title: string;
  materialType: string;
};

function RespondDialog({
  request,
  open,
  onOpenChange,
  listings,
  inventoryLoading,
  inventoryError,
  inventoryFetching,
  refreshInventory,
  refreshBoard,
  boardStale,
  actorId,
}: {
  request: BuyerRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listings: ActiveListing[];
  inventoryLoading: boolean;
  inventoryError: boolean;
  inventoryFetching: boolean;
  refreshInventory: () => Promise<void>;
  refreshBoard: () => Promise<void>;
  boardStale: boolean;
  actorId: string | null;
}) {
  const [message, setMessage] = useState("");
  const [selectedListingId, setSelectedListingId] = useState("");
  const [feedback, setFeedback] = useState<
    "rejected" | "policy" | "uncertain" | "confirmed" | null
  >(null);
  const [checking, setChecking] = useState(false),
    [checkFailed, setCheckFailed] = useState(false);
  const mountedRef = useRef(true),
    pendingRef = useRef(false);
  const utils = trpc.useUtils();
  const isCurrent = () =>
    mountedRef.current && useAuthStore.getState().user?.id === actorId;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const matchingListings = listings.filter((listing) =>
    request.materialTypes?.includes(listing.materialType),
  );
  const respondMutation = trpc.buyerRequest.respond.useMutation();
  const disabled =
    inventoryError ||
    inventoryLoading ||
    boardStale ||
    checking ||
    feedback === "uncertain" ||
    feedback === "confirmed";
  const reconcile = async () => {
    if (pendingRef.current || checking || !isCurrent()) return;
    setChecking(true);
    setCheckFailed(false);
    try {
      let page = 1;
      while (true) {
        const result = await utils.buyerRequest.getMyResponses.fetch(
          { page, limit: 50 },
          { staleTime: 0 },
        );
        if (!isCurrent()) return;
        if (
          result.items.some((response) => response.requestId === request.id)
        ) {
          setFeedback("confirmed");
          void refreshBoard().catch(() => {});
          return;
        }
        if (page >= result.totalPages) break;
        page += 1;
      }
      await refreshBoard();
      await refreshInventory();
      if (isCurrent()) setFeedback(null);
    } catch {
      if (isCurrent()) setCheckFailed(true);
    } finally {
      if (isCurrent()) setChecking(false);
    }
  };
  const submit = async () => {
    if (
      disabled ||
      pendingRef.current ||
      !isCurrent() ||
      !message.trim() ||
      !matchingListings.some((listing) => listing.id === selectedListingId)
    )
      return;
    pendingRef.current = true;
    setFeedback(null);
    try {
      await respondMutation.mutateAsync({
        requestId: request.id,
        message: message.trim(),
        listingId: selectedListingId,
      });
      if (!isCurrent()) return;
      setFeedback("confirmed");
      void refreshBoard().catch(() => {});
    } catch (error) {
      if (!isCurrent()) return;
      const validation = error as {
        data?: {
          code?: string;
          zodError?: { fieldErrors?: { message?: string[] } } | null;
        };
      };
      const code = validation?.data?.code;
      const messageRejected =
        code === "BAD_REQUEST" &&
        Boolean(validation.data?.zodError?.fieldErrors?.message?.length);
      setFeedback(
        messageRejected
          ? "policy"
          : code === "BAD_REQUEST" || code === "NOT_FOUND" || code === "CONFLICT"
            ? "rejected"
            : "uncertain",
      );
    } finally {
      pendingRef.current = false;
    }
  };
  const refreshRequest = async () => {
    if (pendingRef.current || checking || !isCurrent()) return;
    setChecking(true);
    setCheckFailed(false);
    try {
      await refreshBoard();
    } catch {
      if (isCurrent()) setCheckFailed(true);
    } finally {
      if (isCurrent()) setChecking(false);
    }
  };
  const close = () => {
    if (!pendingRef.current && !checking) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Respond to Request</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {request.title} — describe the inventory you can supply.
          </DialogDescription>
        </DialogHeader>
        {inventoryError && (
          <QueryErrorState
            title="We couldn't check your inventory"
            description="Your response draft is kept. Refresh inventory before choosing a published listing."
            onRetry={() => void refreshInventory().catch(() => {})}
            isRetrying={inventoryFetching}
          />
        )}
        {boardStale && (
          <div role="alert" className="space-y-2 text-sm">
            <p>
              The request board could not be refreshed. Your draft is kept;
              refresh before responding.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={checking || respondMutation.isPending}
              onClick={() => void refreshRequest()}
            >
              Refresh request board
            </Button>
            {checkFailed && (
              <p>Refresh failed. Your draft is still here; try again.</p>
            )}
          </div>
        )}
        {feedback && (
          <div
            role={feedback === "confirmed" ? "status" : "alert"}
            className="space-y-2 rounded-md border p-3 text-sm"
          >
            <p className="font-semibold">
              {feedback === "confirmed"
                ? "Response recorded"
                : feedback === "policy"
                  ? "Update your response"
                  : feedback === "rejected"
                    ? "Response needs review"
                    : "Response not confirmed"}
            </p>
            <p>
              {feedback === "confirmed"
                ? "Your response is saved for this request. The buyer can review the attached listing and choose whether to continue."
                : feedback === "policy"
                  ? "Your response was not submitted. Your draft is kept. Check the text for contact details, websites or identifying business information, then try again."
                  : feedback === "rejected"
                    ? "Your draft is kept. The request or listing may have changed, or you may already have responded. Check response status before trying again."
                    : "Your draft is kept. Check response status before trying again; the previous send may have completed."}
            </p>
            {feedback !== "confirmed" && feedback !== "policy" && (
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-11 whitespace-normal"
                disabled={checking || respondMutation.isPending}
                onClick={() => void reconcile()}
              >
                {checking
                  ? "Checking response status..."
                  : "Check response status"}
              </Button>
            )}
            {checkFailed && (
              <p>
                Current status could not be checked. Your draft is still here;
                try checking again.
              </p>
            )}
          </div>
        )}
        {feedback !== "confirmed" && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="respond-message">Your Message</Label>
              <Textarea
                id="respond-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={respondMutation.isPending || checking}
                rows={4}
                maxLength={2000}
                placeholder="Describe how you can fulfill this request..."
              />
              <p className="text-xs text-muted-foreground text-right">
                {message.length}/2000
              </p>
            </div>
            {inventoryLoading ? (
              <p role="status">Loading your published listings…</p>
            ) : inventoryError ? null : matchingListings.length > 0 ? (
              <div className="space-y-1.5">
                <Label htmlFor="respond-listing">
                  Listing to fulfill request
                </Label>
                <Select
                  value={selectedListingId}
                  onValueChange={setSelectedListingId}
                  disabled={respondMutation.isPending || checking}
                >
                  <SelectTrigger id="respond-listing" className="min-h-11">
                    <SelectValue placeholder="Select one of your listings..." />
                  </SelectTrigger>
                  <SelectContent>
                    {matchingListings.map((listing) => (
                      <SelectItem key={listing.id} value={listing.id}>
                        {listing.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The listing must remain active and eligible for the
                  buyer&apos;s destination when they accept.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm">
                <p className="font-medium">
                  A matching active listing is required
                </p>
                <p className="mt-1 text-muted-foreground">
                  Publish inventory you can supply so the buyer can review the
                  product and start a conversation.
                </p>
                <Button asChild variant="outline" className="mt-3 min-h-11">
                  <Link href="/seller/listings/new">Create listing</Link>
                </Button>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={close}
            disabled={respondMutation.isPending || checking}
          >
            {feedback === "confirmed" ? "Done" : "Cancel"}
          </Button>
          {feedback !== "confirmed" && (
            <Button
              type="button"
              className="min-h-11"
              onClick={() => void submit()}
              disabled={
                disabled ||
                feedback === "rejected" ||
                respondMutation.isPending ||
                !message.trim() ||
                !matchingListings.some(
                  (listing) => listing.id === selectedListingId,
                )
              }
            >
              {respondMutation.isPending && (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              Send Response
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestBoardCard({
  request,
  onRespond,
  disabled,
}: {
  request: BuyerRequest;
  onRespond: (req: BuyerRequest) => void;
  disabled: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {request.thumbnailUrl && (
            <div className="relative w-14 h-14 rounded-md overflow-hidden border bg-muted shrink-0">
              <Image
                src={request.thumbnailUrl}
                alt=""
                fill
                sizes="56px"
                className="object-cover"
                loading="lazy"
              />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold break-words [overflow-wrap:anywhere]">
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
              className="min-h-11"
              disabled={disabled}
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
  const { user } = useAuthStore();
  return (
    <SellerRequestBoard
      key={user?.id ?? "anonymous"}
      actorId={user?.id ?? null}
    />
  );
}
function SellerRequestBoard({ actorId }: { actorId: string | null }) {
  const [page, setPage] = useState(1);
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [respondTarget, setRespondTarget] = useState<BuyerRequest | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const boardQuery = trpc.buyerRequest.browse.useQuery(
    {
      materialTypes: materialFilter !== "all" ? [materialFilter] : undefined,
      urgency: urgencyFilter !== "all" ? urgencyFilter : undefined,
      sort: sortBy,
      page,
      limit: 30,
    },
    { enabled: !!actorId },
  );
  const { data, isLoading, isError, isFetching } = boardQuery;
  if (data && !isError && page > Math.max(1, data.totalPages))
    setPage(Math.max(1, data.totalPages));
  const refreshBoard = async () => {
    const result = await boardQuery.refetch();
    if (result.error) throw result.error;
  };

  const inventoryQuery = trpc.listing.getMyListings.useQuery(
    {
      page: 1,
      limit: 100,
      status: "active",
    },
    { enabled: !!actorId },
  );
  const myListingsData = inventoryQuery.data;
  const refreshInventory = async () => {
    const result = await inventoryQuery.refetch();
    if (result.error) throw result.error;
  };

  const activeListings: ActiveListing[] = (myListingsData?.items ?? [])
    .filter(
      (listing: {
        status: string;
        lastConfirmedAt: Date | string | null;
        confirmationDueAt: Date | string | null;
        totalSqFt: number;
      }) =>
        listing.totalSqFt > 0 &&
        isListingVisibleToBuyers({
          status: listing.status,
          lastConfirmedAt: listing.lastConfirmedAt,
          confirmationDueAt: listing.confirmationDueAt,
        }),
    )
    .map((listing: { id: string; title: string; materialType: string }) => ({
      id: listing.id,
      title: listing.title,
      materialType: listing.materialType,
    }));

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
          <ClipboardList className="h-6 w-6 text-primary" aria-hidden="true" />
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
            onValueChange={(v) => {
              setMaterialFilter(v as MaterialFilter);
              setPage(1);
            }}
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
            onValueChange={(v) => {
              setUrgencyFilter(v as UrgencyFilter);
              setPage(1);
            }}
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
            onValueChange={(v) => {
              setSortBy(v as SortOption);
              setPage(1);
            }}
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

      {isError && (
        <QueryErrorState
          title="We couldn't load buyer requests"
          description="Previously loaded requests may appear below. Refresh before responding."
          onRetry={() => void refreshBoard().catch(() => {})}
          isRetrying={isFetching}
        />
      )}
      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data && isError ? null : requests.length === 0 &&
        data?.total === 0 ? (
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
              disabled={isError || isFetching}
            />
          ))}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <nav
          aria-label="Request board pages"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <Button
            variant="outline"
            className="min-h-11"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous requests
          </Button>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Page {page} of {data.totalPages} · {data.total} requests
          </p>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={page >= data.totalPages || isFetching}
            onClick={() => setPage((value) => value + 1)}
          >
            Next requests
          </Button>
        </nav>
      )}
      {respondTarget && dialogOpen && (
        <RespondDialog
          key={respondTarget.id}
          request={respondTarget}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          listings={activeListings}
          actorId={actorId}
          inventoryLoading={inventoryQuery.isLoading}
          inventoryError={inventoryQuery.isError}
          inventoryFetching={inventoryQuery.isFetching}
          refreshInventory={refreshInventory}
          refreshBoard={refreshBoard}
          boardStale={isError}
        />
      )}

      {/* Accessible empty state description for screen readers */}
      <CardDescription className="sr-only">
        Request board showing open buyer requests from the platform
      </CardDescription>
    </div>
  );
}
