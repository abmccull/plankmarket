"use client";

import { trpc } from "@/lib/trpc/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Truck, AlertCircle } from "lucide-react";

export interface SelectedShippingQuote {
  quoteId: number;
  carrierName: string;
  carrierScac: string;
  shippingPrice: number;
  carrierRate: number;
  transitDays: number;
  estimatedDelivery: string;
  quoteExpiresAt: string;
}

interface ShippingQuoteSelectorProps {
  listingId: string;
  destinationZip: string;
  quantitySqFt: number;
  selectedQuote: SelectedShippingQuote | null;
  onSelectQuote: (quote: SelectedShippingQuote) => void;
}

export default function ShippingQuoteSelector({
  listingId,
  destinationZip,
  quantitySqFt,
  selectedQuote,
  onSelectQuote,
}: ShippingQuoteSelectorProps) {
  const {
    data: quotes,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.shipping.getQuotes.useQuery(
    {
      listingId,
      destinationZip,
      quantitySqFt,
    },
    {
      enabled: destinationZip.length >= 5,
    }
  );

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

  if (!quotes || quotes.length === 0) {
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
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Shipping Options
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Prices include all freight charges. LTL carrier pickup from seller&apos;s
          warehouse.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3" role="radiogroup" aria-label="Shipping options">
          {quotes.map((quote) => {
            const isSelected = selectedQuote?.quoteId === quote.quoteId;
            const deliveryDate = formatDate(quote.estimatedDelivery);

            return (
              <button
                key={quote.quoteId}
                type="button"
                onClick={() => onSelectQuote(quote)}
                className={`w-full text-left rounded-lg border-2 p-4 transition-all hover:bg-accent hover:border-accent-foreground/20 ${
                  isSelected
                    ? "border-primary bg-accent"
                    : "border-border bg-card"
                }`}
                role="radio"
                aria-checked={isSelected}
                aria-label={`${quote.carrierName}, ${quote.transitDays} business days, ${formatCurrency(quote.shippingPrice)}`}
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
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-2xl font-bold">
                          {formatCurrency(quote.shippingPrice)}
                        </p>
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
