"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Truck, Calculator } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface FreightEstimateProps {
  originZip: string;
  weightLbs?: number;
}

export function FreightEstimate({
  originZip,
  weightLbs = 1000,
}: FreightEstimateProps) {
  const [destinationZip, setDestinationZip] = useState("");
  const [estimate, setEstimate] = useState<{
    min: number;
    max: number;
  } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const calculateEstimate = () => {
    if (!destinationZip || destinationZip.length < 5) {
      return;
    }

    setIsCalculating(true);

    // Simple distance estimation based on ZIP code difference
    // In production, this would use a real freight API
    const originNum = parseInt(originZip.slice(0, 5));
    const destNum = parseInt(destinationZip.slice(0, 5));
    const zipDiff = Math.abs(originNum - destNum);

    // Rough distance factor (1 zip unit ≈ 10 miles)
    const estimatedMiles = zipDiff * 10;

    // Base rate + distance factor + weight factor
    const baseRate = 150;
    const perMileRate = 0.75;
    const weightFactor = (weightLbs / 1000) * 50;

    const minEstimate = baseRate + estimatedMiles * perMileRate + weightFactor;
    const maxEstimate = minEstimate * 1.4;

    setEstimate({
      min: Math.round(minEstimate),
      max: Math.round(maxEstimate),
    });
    setIsCalculating(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    calculateEstimate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Freight Estimate
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
            disabled={
              !destinationZip || destinationZip.length < 5 || isCalculating
            }
          >
            <Calculator className="mr-2 h-4 w-4" />
            {isCalculating ? "Calculating..." : "Calculate Estimate"}
          </Button>
        </form>

        {estimate && (
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <div className="text-sm font-medium">Estimated Freight Cost</div>
            <div className="text-2xl font-bold">
              {formatCurrency(estimate.min)} - {formatCurrency(estimate.max)}
            </div>
            <p className="text-xs text-muted-foreground">
              This is a rough estimate only. Actual freight costs may vary based
              on carrier, delivery timeline, accessibility, and other factors.
              Contact the seller for an accurate quote.
            </p>
          </div>
        )}

        {weightLbs && (
          <p className="text-xs text-muted-foreground">
            Estimate based on approximate weight of {weightLbs.toLocaleString()}{" "}
            lbs
          </p>
        )}
      </CardContent>
    </Card>
  );
}
