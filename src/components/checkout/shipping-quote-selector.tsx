"use client";

import { useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Truck, AlertCircle } from "lucide-react";

/**
 * Server already returns effective quoteExpiresAt (min of provider residual and
 * Redis artifact life, with the dispatch buffer applied). Client only needs a
 * tiny skew so clock drift does not thrash selection.
 */
const CLIENT_EXPIRY_SKEW_MS = 15_000;

export interface SelectedShippingQuote {
  quoteId: number;
  quoteToken: string;
  carrierName: string;
  carrierScac: string;
  freightFundingMode:
    | "buyer_pays"
    | "seller_pays"
    | "seller_pays_selected_states";
  shippingPrice: number;
  buyerFreightCharge: number;
  sellerFreightContribution: number;
  transitDays: number;
  estimatedDelivery: string;
  quoteExpiresAt: string;
}
interface ShippingQuoteSelectorProps {
  listingId: string;
  destinationZip: string;
  quantitySqFt: number;
  liftgateDelivery: boolean;
  residentialDelivery: boolean;
  appointmentDelivery: boolean;
  selectedQuote: SelectedShippingQuote | null;
  onSelectQuote: (quote: SelectedShippingQuote) => void;
  /** Optional clear when selected quote becomes unbookable. */
  onClearQuote?: () => void;
}
export default function ShippingQuoteSelector({
  listingId,
  destinationZip,
  quantitySqFt,
  liftgateDelivery,
  residentialDelivery,
  appointmentDelivery,
  selectedQuote,
  onSelectQuote,
  onClearQuote,
}: ShippingQuoteSelectorProps) {
  const queryInput = {
    listingId,
    destinationZip,
    quantitySqFt,
    liftgateDelivery,
    residentialDelivery,
    appointmentDelivery,
  };

  const {
    data: quotes,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.shipping.getQuotes.useQuery(queryInput, {
    enabled: destinationZip.length >= 5,
    // Refresh near effective expiry (already buffer-adjusted by the server).
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.length === 0) return false;
      const now = Date.now();
      let earliestMs = Number.POSITIVE_INFINITY;
      for (const quote of data) {
        const expires = new Date(quote.quoteExpiresAt).getTime();
        if (Number.isFinite(expires) && expires < earliestMs) {
          earliestMs = expires;
        }
      }
      if (!Number.isFinite(earliestMs)) return 60_000;
      const msUntilExpiry = earliestMs - now - CLIENT_EXPIRY_SKEW_MS;
      if (msUntilExpiry <= 0) return 15_000;
      return Math.min(60_000, Math.max(15_000, msUntilExpiry));
    },
    staleTime: 30_000,
  });

  const selectedStillBookable = useMemo(() => {
    if (!selectedQuote) return true;
    const expires = new Date(selectedQuote.quoteExpiresAt).getTime();
    return (
      Number.isFinite(expires) && expires > Date.now() + CLIENT_EXPIRY_SKEW_MS
    );
  }, [selectedQuote]);

  // Clear when selection is already past effective expiry.
  useEffect(() => {
    if (!selectedQuote || selectedStillBookable) return;
    onClearQuote?.();
  }, [selectedQuote, selectedStillBookable, onClearQuote]);

  // Clock-driven clear even if refetch is delayed/failed.
  useEffect(() => {
    if (!selectedQuote) return;
    const expires = new Date(selectedQuote.quoteExpiresAt).getTime();
    if (!Number.isFinite(expires)) return;
    const msUntilClear = expires - Date.now() - CLIENT_EXPIRY_SKEW_MS;
    if (msUntilClear <= 0) {
      onClearQuote?.();
      return;
    }
    const timer = window.setTimeout(() => {
      onClearQuote?.();
    }, msUntilClear);
    return () => window.clearTimeout(timer);
  }, [selectedQuote, onClearQuote]);

  // Clear selection when destination/qty changes (new query key) so Continue
  // cannot stay enabled with a token from the previous address.
  const queryKey = [
    listingId,
    destinationZip,
    quantitySqFt,
    liftgateDelivery,
    residentialDelivery,
    appointmentDelivery,
  ].join("|");
  useEffect(() => {
    onClearQuote?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional key-change clear only
  }, [queryKey]);

  // On remint (new quoteTokens), rebind selection by provider quoteId + price
  // rather than wiping the buyer's choice mid-checkout.
  useEffect(() => {
    if (!selectedQuote || quotes === undefined) return;

    // Empty rate list after refresh — clear stale selection so Continue disables.
    if (quotes.length === 0) {
      onClearQuote?.();
      return;
    }

    const exactToken = quotes.find(
      (quote) => quote.quoteToken === selectedQuote.quoteToken,
    );
    if (exactToken) return;

    const rebound = quotes.find(
      (quote) =>
        quote.quoteId === selectedQuote.quoteId &&
        Math.abs(quote.shippingPrice - selectedQuote.shippingPrice) <= 0.01 &&
        quote.carrierScac === selectedQuote.carrierScac,
    );
    if (rebound) {
      onSelectQuote(rebound);
      return;
    }

    // Same carrier option gone after refresh — clear so buyer re-picks.
    onClearQuote?.();
  }, [quotes, selectedQuote, onSelectQuote, onClearQuote]);

  const bookableQuotes = useMemo(() => {
    if (!quotes) return quotes;
    const cutoff = Date.now() + CLIENT_EXPIRY_SKEW_MS;
    return quotes.filter((quote) => {
      const expires = new Date(quote.quoteExpiresAt).getTime();
      return Number.isFinite(expires) && expires > cutoff;
    });
  }, [quotes]);

  if (destinationZip.length < 5) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Shipping Options
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="sr-only">Loading shipping quotes</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Shipping Options
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 py-8">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground text-center">
              {error?.message || "Failed to load shipping quotes"}
            </p>
            <Button
              variant="outline"
              onClick={() => refetch()}
              aria-label="Retry loading shipping quotes"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!bookableQuotes || bookableQuotes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Shipping Options
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 py-8">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              No shipping quotes available for this destination
            </p>
            {quotes && quotes.length > 0 && (
              <Button
                variant="outline"
                onClick={() => refetch()}
                aria-label="Refresh shipping quotes"
              >
                Refresh rates
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const quoteTimestampFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Shipping Options
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Each option shows the full freight quote and exactly how much you pay
          after any seller shipping credit.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3" role="radiogroup" aria-label="Shipping options">
          {bookableQuotes.map((quote) => {
            const isSelected =
              selectedQuote?.quoteToken === quote.quoteToken ||
              (!!selectedQuote &&
                selectedQuote.quoteToken !== quote.quoteToken &&
                selectedQuote.quoteId === quote.quoteId &&
                Math.abs(selectedQuote.shippingPrice - quote.shippingPrice) <=
                  0.01 &&
                selectedQuote.carrierScac === quote.carrierScac);
            const deliveryDate = formatDate(quote.estimatedDelivery);
            const hasSellerCredit = quote.sellerFreightContribution > 0;

            return (
              <button
                key={quote.quoteToken}
                type="button"
                onClick={() => onSelectQuote(quote)}
                className={`w-full text-left rounded-lg border-2 p-4 transition-all hover:bg-accent hover:border-accent-foreground/20 ${
                  isSelected
                    ? "border-primary bg-accent"
                    : "border-border bg-card"
                }`}
                role="radio"
                aria-checked={isSelected}
                aria-label={`${quote.carrierName}, ${quote.transitDays} business days, buyer shipping ${formatCurrency(quote.buyerFreightCharge)}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex-shrink-0">
                    <div
                      className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-muted-foreground"
                      }`}
                    >
                      {isSelected && (
                        <div className="h-2.5 w-2.5 rounded-full bg-primary-foreground" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-base">
                          {quote.carrierName}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {quote.transitDays}{" "}
                          {quote.transitDays === 1 ? "business day" : "business days"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Estimated delivery: {deliveryDate}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Quote expires:{" "}
                          {quoteTimestampFormatter.format(
                            new Date(quote.quoteExpiresAt),
                          )}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-muted-foreground">
                          Buyer shipping
                        </p>
                        <p className="text-2xl font-bold">
                          {formatCurrency(quote.buyerFreightCharge)}
                        </p>
                        {hasSellerCredit ? (
                          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                            <p>
                              Full freight {formatCurrency(quote.shippingPrice)}
                            </p>
                            <p className="text-green-700 dark:text-green-400">
                              Seller credit -
                              {formatCurrency(quote.sellerFreightContribution)}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
