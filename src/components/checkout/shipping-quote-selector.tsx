"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Truck, AlertCircle } from "lucide-react";

export interface SelectedShippingQuote {
  quoteId: number;
  carrierName: string;
  carrierScac: string;
  shippingPrice: number;
  transitDays: number;
  estimatedDelivery: string;
  quoteExpiresAt: string;
}

interface ManualFreightData {
  originZip: string;
  palletWeight: number;
  palletLength: number;
  palletWidth: number;
  palletHeight: number;
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
  const [manualData, setManualData] = useState<ManualFreightData | null>(null);

  const queryInput = {
    listingId,
    destinationZip,
    quantitySqFt,
    ...(manualData && {
      overrideOriginZip: manualData.originZip,
      overridePalletWeight: manualData.palletWeight,
      overridePalletLength: manualData.palletLength,
      overridePalletWidth: manualData.palletWidth,
      overridePalletHeight: manualData.palletHeight,
    }),
  };

  const {
    data: quotes,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.shipping.getQuotes.useQuery(queryInput, {
    enabled: destinationZip.length >= 5,
  });

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
    const isPreconditionFailed =
      error?.data?.code === "PRECONDITION_FAILED" ||
      error?.message?.includes("freight information") ||
      error?.message?.includes("shipping details");

    if (isPreconditionFailed) {
      return (
        <ManualFreightForm
          onSubmit={(data) => {
            setManualData(data);
          }}
        />
      );
    }

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

/** Manual freight entry form shown when listing lacks shipping data */
function ManualFreightForm({
  onSubmit,
}: {
  onSubmit: (data: ManualFreightData) => void;
}) {
  const [originZip, setOriginZip] = useState("");
  const [palletWeight, setPalletWeight] = useState("1500");
  const [palletLength, setPalletLength] = useState("48");
  const [palletWidth, setPalletWidth] = useState("40");
  const [palletHeight, setPalletHeight] = useState("48");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!originZip || originZip.length < 5) {
      setValidationError("Origin ZIP is required");
      return;
    }

    const weight = parseFloat(palletWeight);
    const length = parseFloat(palletLength);
    const width = parseFloat(palletWidth);
    const height = parseFloat(palletHeight);

    if (!weight || !length || !width || !height) {
      setValidationError("All pallet dimensions are required");
      return;
    }

    onSubmit({
      originZip,
      palletWeight: weight,
      palletLength: length,
      palletWidth: width,
      palletHeight: height,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Shipping Details Required
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          This listing is missing freight information. Enter the shipping details
          below to get carrier quotes. Contact the seller if you&apos;re unsure.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="originZip">Origin ZIP (seller&apos;s location)</Label>
            <Input
              id="originZip"
              placeholder="90210"
              value={originZip}
              onChange={(e) => setOriginZip(e.target.value)}
              maxLength={10}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="palletWeight">Pallet Weight (lbs)</Label>
              <Input
                id="palletWeight"
                type="number"
                value={palletWeight}
                onChange={(e) => setPalletWeight(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="palletLength">Length (in)</Label>
              <Input
                id="palletLength"
                type="number"
                value={palletLength}
                onChange={(e) => setPalletLength(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="palletWidth">Width (in)</Label>
              <Input
                id="palletWidth"
                type="number"
                value={palletWidth}
                onChange={(e) => setPalletWidth(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="palletHeight">Height (in)</Label>
              <Input
                id="palletHeight"
                type="number"
                value={palletHeight}
                onChange={(e) => setPalletHeight(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Standard pallet: 48&quot; x 40&quot; x 48&quot;, ~1,500 lbs. Adjust based on this order.
          </p>

          {validationError && (
            <p className="text-sm text-destructive">{validationError}</p>
          )}

          <Button type="submit" className="w-full">
            Get Shipping Quotes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
