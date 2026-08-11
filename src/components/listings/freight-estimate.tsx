"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Truck } from "lucide-react";

interface FreightEstimateProps {
  originZip: string;
  weightLbs?: number;
}

export function FreightEstimate({
  originZip,
  weightLbs = 1000,
}: FreightEstimateProps) {
  const [destinationZip, setDestinationZip] = useState("");
  const [preparedDestinationZip, setPreparedDestinationZip] = useState<
    string | null
  >(null);
  const normalizedDestinationZip = destinationZip.trim();
  const hasValidDestinationZip = /^\d{5}(?:-\d{4})?$/.test(
    normalizedDestinationZip,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasValidDestinationZip) {
      return;
    }

    setPreparedDestinationZip(normalizedDestinationZip);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Truck className="h-5 w-5" />
          Freight Quote
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="origin-zip" className="text-sm">
              Origin ZIP Code
            </Label>
            <Input
              id="origin-zip"
              value={originZip}
              disabled
              className="bg-muted"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="destination-zip" className="text-sm">
              Destination ZIP Code
            </Label>
            <Input
              id="destination-zip"
              type="text"
              placeholder="Enter your ZIP code"
              value={destinationZip}
              onChange={(e) => setDestinationZip(e.target.value)}
              maxLength={10}
              pattern="[0-9]{5}(-[0-9]{4})?"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!hasValidDestinationZip}
          >
            Review quote steps
          </Button>
        </form>

        {preparedDestinationZip && (
          <div className="space-y-2 rounded-lg border bg-muted/50 p-4">
            <div className="text-sm font-medium">
              Exact freight quote available at checkout
            </div>
            <p className="text-sm text-muted-foreground">
              Use ZIP {preparedDestinationZip} during authenticated checkout to
              request live Priority1 carrier quotes before payment.
            </p>
            <p className="text-xs text-muted-foreground">
              Carrier pricing depends on pallet count, shipment weight,
              dimensions, accessorials, and delivery timing. This page does not
              invent a freight rate.
            </p>
          </div>
        )}

        {weightLbs && (
          <p className="text-xs text-muted-foreground">
            Carrier quotes also use the seller&apos;s pallet data and the
            approximate shipment weight of {weightLbs.toLocaleString()} lbs.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
