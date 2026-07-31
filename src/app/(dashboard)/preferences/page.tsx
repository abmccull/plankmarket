"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Save,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { celebrateMilestone } from "@/lib/utils/celebrate";
import { OnboardingTip } from "@/components/ui/onboarding-tip";
import { US_STATE_CODES } from "@/lib/selling-territory";
import { Switch } from "@/components/ui/switch";
import {
  AutomaticMarkdownPreview,
  ChoiceCard,
  getFreightPersistenceValues,
  getFreightUiMode,
  SellerCommercialFulfillmentFields,
  StateBadgeSelector,
  type FreightUiMode,
} from "@/components/marketplace/seller-commercial-fields";

// ─── Constants (aligned to validator schema) ──────────────────────────────────

const MATERIAL_TYPES = [
  { value: "hardwood", label: "Hardwood" },
  { value: "engineered", label: "Engineered" },
  { value: "laminate", label: "Laminate" },
  { value: "vinyl_lvp", label: "Vinyl / LVP" },
  { value: "bamboo", label: "Bamboo" },
  { value: "tile", label: "Tile" },
  { value: "other", label: "Other" },
] as const;

type MaterialType =
  | "hardwood"
  | "engineered"
  | "laminate"
  | "vinyl_lvp"
  | "bamboo"
  | "tile"
  | "other";

const INSTALL_TYPES = [
  { value: "click", label: "Click Lock" },
  { value: "glue", label: "Glue Down" },
  { value: "nail", label: "Nail Down" },
  { value: "float", label: "Floating" },
] as const;

type InstallType = "click" | "glue" | "nail" | "float";

const CERTIFICATIONS = [
  { value: "FSC", label: "FSC" },
  { value: "FloorScore", label: "FloorScore" },
  { value: "GreenGuard", label: "GreenGuard" },
  { value: "GreenGuard Gold", label: "GreenGuard Gold" },
  { value: "CARB2", label: "CARB2" },
  { value: "LEED", label: "LEED" },
  { value: "NAUF", label: "NAUF" },
] as const;

type Certification =
  | "FSC"
  | "FloorScore"
  | "GreenGuard"
  | "GreenGuard Gold"
  | "CARB2"
  | "LEED"
  | "NAUF";

const URGENCY_OPTIONS = [
  { value: "asap", label: "ASAP" },
  { value: "2_weeks", label: "Within 2 Weeks" },
  { value: "4_weeks", label: "Within 4 Weeks" },
  { value: "flexible", label: "Flexible" },
] as const;

const INVENTORY_SOURCES = [
  { value: "closeout", label: "Closeout" },
  { value: "overstock", label: "Overstock" },
  { value: "discontinued", label: "Discontinued" },
  { value: "returns", label: "Returns" },
  { value: "seconds", label: "Seconds" },
] as const;

type InventorySource =
  | "closeout"
  | "overstock"
  | "discontinued"
  | "returns"
  | "seconds";

const PRICING_STYLES = [
  { value: "fixed", label: "Fixed Price" },
  { value: "negotiable", label: "Negotiable" },
  { value: "tiered", label: "Tiered" },
] as const;

// ─── Multi-select Badge helper ────────────────────────────────────────────────

function MultiSelectBadges<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  selected: T[];
  onChange: (values: T[]) => void;
}) {
  const toggle = (value: T) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
          aria-pressed={selected.includes(opt.value)}
        >
          <Badge
            variant={selected.includes(opt.value) ? "default" : "outline"}
            className="cursor-pointer select-none"
          >
            {opt.label}
          </Badge>
        </button>
      ))}
    </div>
  );
}

// ─── Step progress bar ────────────────────────────────────────────────────────

function StepProgress({
  current,
  total,
  labels,
}: {
  current: number;
  total: number;
  labels: string[];
}) {
  const pct = Math.round(((current - 1) / (total - 1)) * 100);
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>
          Step {current} of {total}: {labels[current - 1]}
        </span>
        <span>{pct}% complete</span>
      </div>
      <div
        className="h-2 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Shared form field wrapper ────────────────────────────────────────────────

function FormField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

// ─── Buyer Prefs ──────────────────────────────────────────────────────────────

type BuyerPrefs = {
  preferredZip: string;
  preferredRadiusMiles: number;
  preferredShippingMode: "pickup" | "ship" | "both";
  preferredMaterialTypes: MaterialType[];
  preferredInstallTypes: InstallType[];
  minThicknessMm: string;
  minWearLayerMil: string;
  waterproofRequired: boolean;
  preferredSpecies: string;
  preferredCertifications: Certification[];
  priceMinPerSqFt: string;
  priceMaxPerSqFt: string;
  minLotSizeSqFt: string;
  maxLotSizeSqFt: string;
  urgency: "asap" | "2_weeks" | "4_weeks" | "flexible";
};

const defaultBuyerPrefs: BuyerPrefs = {
  preferredZip: "",
  preferredRadiusMiles: 100,
  preferredShippingMode: "both",
  preferredMaterialTypes: [],
  preferredInstallTypes: [],
  minThicknessMm: "",
  minWearLayerMil: "",
  waterproofRequired: false,
  preferredSpecies: "",
  preferredCertifications: [],
  priceMinPerSqFt: "",
  priceMaxPerSqFt: "",
  minLotSizeSqFt: "",
  maxLotSizeSqFt: "",
  urgency: "flexible",
};

function BuyerStep1({
  prefs,
  setPrefs,
}: {
  prefs: BuyerPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<BuyerPrefs>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Location &amp; Shipping</CardTitle>
        <CardDescription>
          Set your location and shipping preferences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField id="buyer-zip" label="Your ZIP Code">
          <Input
            id="buyer-zip"
            value={prefs.preferredZip}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, preferredZip: e.target.value }))
            }
            placeholder="e.g. 90210"
            maxLength={5}
            pattern="[0-9]{5}"
          />
        </FormField>
        <FormField
          id="buyer-radius"
          label={`Search Radius: ${prefs.preferredRadiusMiles} miles`}
        >
          <input
            id="buyer-radius"
            type="range"
            min={10}
            max={500}
            step={10}
            value={prefs.preferredRadiusMiles}
            onChange={(e) =>
              setPrefs((p) => ({
                ...p,
                preferredRadiusMiles: Number(e.target.value),
              }))
            }
            className="w-full accent-primary"
            aria-label={`Search radius: ${prefs.preferredRadiusMiles} miles`}
          />
        </FormField>
        <FormField id="buyer-shipping-mode" label="Shipping Preference">
          <Select
            value={prefs.preferredShippingMode}
            onValueChange={(v) =>
              setPrefs((p) => ({
                ...p,
                preferredShippingMode: v as BuyerPrefs["preferredShippingMode"],
              }))
            }
          >
            <SelectTrigger id="buyer-shipping-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pickup">Pickup Only</SelectItem>
              <SelectItem value="ship">Ship to Me</SelectItem>
              <SelectItem value="both">Either</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </CardContent>
    </Card>
  );
}

function BuyerStep2({
  prefs,
  setPrefs,
}: {
  prefs: BuyerPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<BuyerPrefs>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Materials &amp; Specs</CardTitle>
        <CardDescription>
          What types of flooring are you looking for?
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Material Types</Label>
          <MultiSelectBadges
            options={MATERIAL_TYPES}
            selected={prefs.preferredMaterialTypes}
            onChange={(v) =>
              setPrefs((p) => ({ ...p, preferredMaterialTypes: v }))
            }
          />
        </div>
        <Separator />
        <div className="space-y-1.5">
          <Label>Install Types</Label>
          <MultiSelectBadges
            options={INSTALL_TYPES}
            selected={prefs.preferredInstallTypes}
            onChange={(v) =>
              setPrefs((p) => ({ ...p, preferredInstallTypes: v }))
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField id="buyer-thickness" label="Min Thickness (mm)">
            <Input
              id="buyer-thickness"
              type="number"
              min={0}
              step={0.5}
              value={prefs.minThicknessMm}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, minThicknessMm: e.target.value }))
              }
              placeholder="e.g. 12"
            />
          </FormField>
          <FormField id="buyer-wear-layer" label="Min Wear Layer (mil)">
            <Input
              id="buyer-wear-layer"
              type="number"
              min={0}
              step={1}
              value={prefs.minWearLayerMil}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, minWearLayerMil: e.target.value }))
              }
              placeholder="e.g. 12"
            />
          </FormField>
        </div>
        <FormField id="buyer-species" label="Species (comma-separated)">
          <Input
            id="buyer-species"
            value={prefs.preferredSpecies}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, preferredSpecies: e.target.value }))
            }
            placeholder="e.g. Oak, Maple"
          />
        </FormField>
        <div className="flex items-center gap-3">
          <input
            id="buyer-waterproof"
            type="checkbox"
            checked={prefs.waterproofRequired}
            onChange={(e) =>
              setPrefs((p) => ({
                ...p,
                waterproofRequired: e.target.checked,
              }))
            }
            className="h-4 w-4 accent-primary"
          />
          <Label htmlFor="buyer-waterproof">Waterproof only</Label>
        </div>
        <div className="space-y-1.5">
          <Label>Certifications</Label>
          <MultiSelectBadges
            options={CERTIFICATIONS}
            selected={prefs.preferredCertifications}
            onChange={(v) =>
              setPrefs((p) => ({ ...p, preferredCertifications: v }))
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function BuyerStep3({
  prefs,
  setPrefs,
}: {
  prefs: BuyerPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<BuyerPrefs>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget &amp; Urgency</CardTitle>
        <CardDescription>Set your price range and timeline</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField id="buyer-price-min" label="Min Price / sqft ($)">
            <Input
              id="buyer-price-min"
              type="number"
              min={0}
              step={0.01}
              value={prefs.priceMinPerSqFt}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, priceMinPerSqFt: e.target.value }))
              }
              placeholder="e.g. 1.00"
            />
          </FormField>
          <FormField id="buyer-price-max" label="Max Price / sqft ($)">
            <Input
              id="buyer-price-max"
              type="number"
              min={0}
              step={0.01}
              value={prefs.priceMaxPerSqFt}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, priceMaxPerSqFt: e.target.value }))
              }
              placeholder="e.g. 5.00"
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField id="buyer-lot-min" label="Min Lot Size (sqft)">
            <Input
              id="buyer-lot-min"
              type="number"
              min={0}
              value={prefs.minLotSizeSqFt}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, minLotSizeSqFt: e.target.value }))
              }
              placeholder="e.g. 500"
            />
          </FormField>
          <FormField id="buyer-lot-max" label="Max Lot Size (sqft)">
            <Input
              id="buyer-lot-max"
              type="number"
              min={0}
              value={prefs.maxLotSizeSqFt}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, maxLotSizeSqFt: e.target.value }))
              }
              placeholder="e.g. 10000"
            />
          </FormField>
        </div>
        <FormField id="buyer-urgency" label="Purchase Urgency">
          <Select
            value={prefs.urgency}
            onValueChange={(v) =>
              setPrefs((p) => ({
                ...p,
                urgency: v as BuyerPrefs["urgency"],
              }))
            }
          >
            <SelectTrigger id="buyer-urgency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {URGENCY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </CardContent>
    </Card>
  );
}

// ─── Seller Prefs ─────────────────────────────────────────────────────────────

type SellerPrefs = {
  originZip: string;
  shipCapable: boolean;
  leadTimeDaysMin: string;
  leadTimeDaysMax: string;
  palletizationCapable: boolean;
  typicalMaterialTypes: MaterialType[];
  avgLotSqFt: string;
  canSplitLots: boolean;
  inventorySource: InventorySource[];
  pricingStyle: "fixed" | "negotiable" | "tiered";
  preferredBuyerRadiusMiles: number;
  partialQuantityMarkupPercent: string;
  automaticMarkdownEnabled: boolean;
  automaticMarkdownFloorPercent: string;
  automaticMarkdownIntervalDays: string;
  defaultAllowOffers: boolean;
  allowSampleRequests: boolean;
  sellingTerritoryMode: "unrestricted" | "allowed_states";
  allowedDestinationStates: (typeof US_STATE_CODES)[number][];
  freightMode: FreightUiMode;
  sellerFreightStates: (typeof US_STATE_CODES)[number][];
  freightDropCharge: string;
  taxRegisteredStates: (typeof US_STATE_CODES)[number][];
};

type ActiveListingApplySummary = {
  activeListingCount: number;
  eligibleListingCount: number;
  changedListingCount: number;
  unchangedListingCount: number;
  skippedAcceptedOfferListingCount: number;
  skippedAcceptedOfferCount: number;
  warnings: {
    pendingOrCounteredOfferCount: number;
    listingsWithPendingOrCounteredOffers: number;
    activeOrderCount: number;
    listingsWithActiveOrders: number;
    openSampleRequestCount: number;
    listingsWithOpenSampleRequests: number;
  };
};

const defaultSellerPrefs: SellerPrefs = {
  originZip: "",
  shipCapable: false,
  leadTimeDaysMin: "",
  leadTimeDaysMax: "",
  palletizationCapable: false,
  typicalMaterialTypes: [],
  avgLotSqFt: "",
  canSplitLots: false,
  inventorySource: [],
  pricingStyle: "fixed",
  preferredBuyerRadiusMiles: 250,
  partialQuantityMarkupPercent: "",
  automaticMarkdownEnabled: false,
  automaticMarkdownFloorPercent: "",
  automaticMarkdownIntervalDays: "",
  defaultAllowOffers: true,
  allowSampleRequests: false,
  sellingTerritoryMode: "unrestricted",
  allowedDestinationStates: [],
  freightMode: "buyer_pays",
  sellerFreightStates: [],
  freightDropCharge: "",
  taxRegisteredStates: [],
};

function numberOrNull(value: string): number | null {
  return value.trim().length > 0 ? Number(value) : null;
}

function getSellerCommercialDefaultsInput(prefs: SellerPrefs) {
  const freightDefaults = getFreightPersistenceValues(
    prefs.freightMode,
    prefs.sellerFreightStates,
  );

  return {
    canSplitLots: prefs.canSplitLots,
    partialQuantityMarkupPercent: prefs.canSplitLots
      ? numberOrNull(prefs.partialQuantityMarkupPercent)
      : null,
    automaticMarkdownEnabled: prefs.automaticMarkdownEnabled,
    automaticMarkdownFloorPercent: prefs.automaticMarkdownEnabled
      ? numberOrNull(prefs.automaticMarkdownFloorPercent)
      : null,
    automaticMarkdownIntervalDays: prefs.automaticMarkdownEnabled
      ? numberOrNull(prefs.automaticMarkdownIntervalDays)
      : null,
    defaultAllowOffers: prefs.defaultAllowOffers,
    allowSampleRequests: prefs.allowSampleRequests,
    sellingTerritoryMode: prefs.sellingTerritoryMode,
    allowedDestinationStates:
      prefs.sellingTerritoryMode === "allowed_states"
        ? prefs.allowedDestinationStates
        : [],
    freightPaymentMode: freightDefaults.freightPaymentMode,
    sellerFreightStates: freightDefaults.sellerFreightStates,
    freightDropCharge:
      prefs.freightMode !== "buyer_pays"
        ? numberOrNull(prefs.freightDropCharge)
        : null,
  };
}

function SellerStep1({
  prefs,
  setPrefs,
}: {
  prefs: SellerPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<SellerPrefs>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Location &amp; Shipping</CardTitle>
        <CardDescription>Where are you shipping from?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField id="seller-zip" label="Origin ZIP Code">
          <Input
            id="seller-zip"
            value={prefs.originZip}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, originZip: e.target.value }))
            }
            placeholder="e.g. 30301"
            maxLength={5}
            pattern="[0-9]{5}"
          />
        </FormField>
        <div className="flex items-center gap-3">
          <input
            id="seller-ship"
            type="checkbox"
            checked={prefs.shipCapable}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, shipCapable: e.target.checked }))
            }
            className="h-4 w-4 accent-primary"
          />
          <Label htmlFor="seller-ship">I can ship nationwide</Label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField id="seller-lead-min" label="Lead Time Min (days)">
            <Input
              id="seller-lead-min"
              type="number"
              min={0}
              max={90}
              value={prefs.leadTimeDaysMin}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, leadTimeDaysMin: e.target.value }))
              }
              placeholder="e.g. 3"
            />
          </FormField>
          <FormField id="seller-lead-max" label="Lead Time Max (days)">
            <Input
              id="seller-lead-max"
              type="number"
              min={0}
              max={90}
              value={prefs.leadTimeDaysMax}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, leadTimeDaysMax: e.target.value }))
              }
              placeholder="e.g. 7"
            />
          </FormField>
        </div>
        <div className="flex items-center gap-3">
          <input
            id="seller-pallet"
            type="checkbox"
            checked={prefs.palletizationCapable}
            onChange={(e) =>
              setPrefs((p) => ({
                ...p,
                palletizationCapable: e.target.checked,
              }))
            }
            className="h-4 w-4 accent-primary"
          />
          <Label htmlFor="seller-pallet">Lots can be palletized</Label>
        </div>
      </CardContent>
    </Card>
  );
}

function SellerStep2({
  prefs,
  setPrefs,
}: {
  prefs: SellerPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<SellerPrefs>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory</CardTitle>
        <CardDescription>
          Tell buyers about your typical inventory
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Typical Material Types</Label>
          <MultiSelectBadges
            options={MATERIAL_TYPES}
            selected={prefs.typicalMaterialTypes}
            onChange={(v) =>
              setPrefs((p) => ({ ...p, typicalMaterialTypes: v }))
            }
          />
        </div>
        <FormField id="seller-lot-size" label="Average Lot Size (sqft)">
          <Input
            id="seller-lot-size"
            type="number"
            min={0}
            value={prefs.avgLotSqFt}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, avgLotSqFt: e.target.value }))
            }
            placeholder="e.g. 2000"
          />
        </FormField>
        <div className="flex items-center gap-3">
          <input
            id="seller-split"
            type="checkbox"
            checked={prefs.canSplitLots}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, canSplitLots: e.target.checked }))
            }
            className="h-4 w-4 accent-primary"
          />
          <Label htmlFor="seller-split">I can split lots</Label>
        </div>
        <div className="space-y-1.5">
          <Label>Inventory Sources</Label>
          <MultiSelectBadges
            options={INVENTORY_SOURCES}
            selected={prefs.inventorySource}
            onChange={(v) =>
              setPrefs((p) => ({ ...p, inventorySource: v }))
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SellerStep3({
  prefs,
  setPrefs,
}: {
  prefs: SellerPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<SellerPrefs>>;
}) {
  const sampleListPrice = 1.99;
  const partialMarkupPercent = Number(prefs.partialQuantityMarkupPercent || 0);
  const partialPreviewPrice =
    Math.round(sampleListPrice * (1 + partialMarkupPercent / 100) * 100) / 100;
  const markdownFloorPercent = Number(
    prefs.automaticMarkdownFloorPercent || 0,
  );
  const markdownIntervalDays = Number(
    prefs.automaticMarkdownIntervalDays || 0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing &amp; Negotiation</CardTitle>
        <CardDescription>
          Set the default pricing behavior new listings should inherit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <FormField id="seller-pricing" label="Pricing Style">
          <Select
            value={prefs.pricingStyle}
            onValueChange={(v) =>
              setPrefs((p) => ({
                ...p,
                pricingStyle: v as SellerPrefs["pricingStyle"],
              }))
            }
          >
            <SelectTrigger id="seller-pricing">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRICING_STYLES.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          id="seller-buyer-radius"
          label={`Preferred Buyer Radius: ${prefs.preferredBuyerRadiusMiles} miles`}
        >
          <input
            id="seller-buyer-radius"
            type="range"
            min={25}
            max={1000}
            step={25}
            value={prefs.preferredBuyerRadiusMiles}
            onChange={(e) =>
              setPrefs((p) => ({
                ...p,
                preferredBuyerRadiusMiles: Number(e.target.value),
              }))
            }
            className="w-full accent-primary"
            aria-label={`Preferred buyer radius: ${prefs.preferredBuyerRadiusMiles} miles`}
          />
        </FormField>

        <Separator />

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
            <div className="space-y-1">
              <Label htmlFor="seller-default-offers" className="text-sm font-medium">
                Allow offers by default
              </Label>
              <p className="text-sm text-muted-foreground">
                Buyers can submit an offer and each side can accept, decline, or
                counter when it is their turn.
              </p>
            </div>
            <Switch
              id="seller-default-offers"
              checked={prefs.defaultAllowOffers}
              onCheckedChange={(checked) =>
                setPrefs((p) => ({
                  ...p,
                  defaultAllowOffers: checked,
                }))
              }
            />
          </div>

          <div className="rounded-2xl border bg-card p-4">
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="font-medium">Default lot strategy</div>
                <p className="text-sm text-muted-foreground">
                  Choose whether new listings are full-lot only or support
                  partial purchases with a higher per-foot price.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <ChoiceCard
                  title="Full lot only"
                  description="Buyers must purchase the entire listing quantity."
                  selected={!prefs.canSplitLots}
                  onClick={() =>
                    setPrefs((p) => ({
                      ...p,
                      canSplitLots: false,
                      partialQuantityMarkupPercent: "",
                    }))
                  }
                />
                <ChoiceCard
                  title="Allow partial quantities"
                  description="Let buyers take less than the full lot and add a markup for those smaller orders."
                  selected={prefs.canSplitLots}
                  onClick={() =>
                    setPrefs((p) => ({
                      ...p,
                      canSplitLots: true,
                    }))
                  }
                />
              </div>

              {prefs.canSplitLots ? (
                <div className="space-y-2">
                  <Label htmlFor="seller-partial-markup">
                    Partial-order markup (%)
                  </Label>
                  <Input
                    id="seller-partial-markup"
                    type="number"
                    min={0}
                    max={500}
                    step={1}
                    value={prefs.partialQuantityMarkupPercent}
                    onChange={(e) =>
                      setPrefs((p) => ({
                        ...p,
                        partialQuantityMarkupPercent: e.target.value,
                      }))
                    }
                    placeholder="e.g. 20"
                  />
                  <p className="text-xs text-muted-foreground">
                    At ${sampleListPrice.toFixed(2)}/sq ft, a{" "}
                    {partialMarkupPercent || 0}% markup prices partial orders at{" "}
                    ${partialPreviewPrice.toFixed(2)}/sq ft.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  New listings will require the full lot unless you override the
                  setting on that listing.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <Label
                  htmlFor="seller-automatic-markdown"
                  className="text-sm font-medium"
                >
                  Automatic markdown
                </Label>
                <p className="text-sm text-muted-foreground">
                  Step inventory down in four equal intervals until it reaches
                  your floor.
                </p>
              </div>
              <Switch
                id="seller-automatic-markdown"
                checked={prefs.automaticMarkdownEnabled}
                onCheckedChange={(checked) =>
                  setPrefs((p) => ({
                    ...p,
                    automaticMarkdownEnabled: checked,
                  }))
                }
              />
            </div>

            {prefs.automaticMarkdownEnabled ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    id="seller-markdown-floor"
                    label="Lowest allowed percent of original ask"
                  >
                    <Input
                      id="seller-markdown-floor"
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={prefs.automaticMarkdownFloorPercent}
                      onChange={(e) =>
                        setPrefs((p) => ({
                          ...p,
                          automaticMarkdownFloorPercent: e.target.value,
                        }))
                      }
                      placeholder="e.g. 60"
                    />
                  </FormField>
                  <FormField
                    id="seller-markdown-interval"
                    label="Days between markdown steps"
                  >
                    <Input
                      id="seller-markdown-interval"
                      type="number"
                      min={1}
                      max={365}
                      step={1}
                      value={prefs.automaticMarkdownIntervalDays}
                      onChange={(e) =>
                        setPrefs((p) => ({
                          ...p,
                          automaticMarkdownIntervalDays: e.target.value,
                        }))
                      }
                      placeholder="e.g. 21"
                    />
                  </FormField>
                </div>

                {markdownFloorPercent > 0 && markdownIntervalDays > 0 ? (
                  <AutomaticMarkdownPreview
                    baseUnitPrice={sampleListPrice}
                    floorPercent={markdownFloorPercent}
                    intervalDays={markdownIntervalDays}
                    description="Preview shown from a $1.99 ask. Each listing uses its own price and starts the schedule when it goes live."
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Add both values to preview the full markdown ladder.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SellerStep4({
  prefs,
  setPrefs,
}: {
  prefs: SellerPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<SellerPrefs>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Freight, Territory &amp; Compliance</CardTitle>
        <CardDescription>
          Set the operating defaults for freight coverage, territory
          restrictions, and account-level tax records.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <SellerCommercialFulfillmentFields
          territoryChoiceGridClassName="md:grid-cols-2"
          freightChoiceGridClassName="md:grid-cols-3"
          copy={{
            sampleLabel: "Allow sample requests by default",
            sampleDescription:
              "This only enables the request workflow. It does not promise free samples or platform-managed relay shipping.",
            territoryDescription:
              "Restricted listings are discoverable only to buyers whose verified business state is allowed.",
            territoryNationwideDescription:
              "Allow any eligible buyer to engage the listing.",
            territoryRestrictedDescription:
              "Limit visibility and purchasing to your approved territory.",
            freightHeading: "Freight coverage default",
            freightDescription:
              "Choose who funds freight on new listings. A seller contribution is deducted from the order's net payout, and an optional buyer drop charge lets the buyer cover part of the quote.",
            freightBuyerPaysDescription:
              "Default to buyer-funded shipping quotes.",
            freightStateHelperText:
              "Outside these states, new listings fall back to buyer-paid freight.",
            freightDropChargeLabel:
              "Default buyer drop charge (optional)",
            freightDropChargeDescription:
              "The buyer pays this amount toward freight. The remaining freight quote becomes the seller shipping contribution.",
          }}
          sampleRequests={{
            id: "seller-samples",
            enabled: prefs.allowSampleRequests,
            onChange: (checked) =>
              setPrefs((p) => ({
                ...p,
                allowSampleRequests: checked,
              })),
          }}
          territory={{
            mode: prefs.sellingTerritoryMode,
            selectedStates: prefs.allowedDestinationStates,
            onChange: ({ mode, selectedStates }) =>
              setPrefs((p) => ({
                ...p,
                sellingTerritoryMode: mode,
                allowedDestinationStates: selectedStates,
              })),
          }}
          freight={{
            mode: prefs.freightMode,
            selectedStates: prefs.sellerFreightStates,
            onChange: ({ mode, selectedStates, shouldClearDropCharge }) =>
              setPrefs((p) => ({
                ...p,
                freightMode: mode,
                sellerFreightStates: selectedStates,
                freightDropCharge: shouldClearDropCharge
                  ? ""
                  : p.freightDropCharge,
              })),
            dropChargeInputId: "seller-freight-drop-charge",
            dropChargeValue: prefs.freightDropCharge,
            onDropChargeChange: (value) =>
              setPrefs((p) => ({
                ...p,
                freightDropCharge: value,
              })),
          }}
        />

        <div className="rounded-2xl border bg-card p-4">
          <StateBadgeSelector
            label="Registered sales-tax states"
            selected={prefs.taxRegisteredStates}
            onChange={(states) =>
              setPrefs((p) => ({
                ...p,
                taxRegisteredStates: states,
              }))
            }
            helperText="Stored for seller operations. Automatic tax calculation and remittance are not yet live in checkout."
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function ActiveListingApplyPanel({
  enabled,
  onEnabledChange,
  confirmed,
  onConfirmedChange,
  preview,
  isPreviewLoading,
  previewError,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  preview: ActiveListingApplySummary | undefined;
  isPreviewLoading: boolean;
  previewError: string | null;
}) {
  const warningCount = preview
    ? preview.warnings.pendingOrCounteredOfferCount +
      preview.warnings.activeOrderCount +
      preview.warnings.openSampleRequestCount
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apply these defaults</CardTitle>
        <CardDescription>
          Saving normally changes defaults for future listings only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label
          htmlFor="apply-defaults-to-active-listings"
          className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4"
        >
          <input
            id="apply-defaults-to-active-listings"
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span className="space-y-1">
            <span className="block font-medium">
              Also apply to my active listings
            </span>
            <span className="block text-sm text-muted-foreground">
              Off by default. Prices, quantities, listing status, and existing
              order terms will not be changed.
            </span>
          </span>
        </label>

        {enabled ? (
          <div
            className="space-y-4 rounded-2xl border bg-muted/30 p-4"
            aria-live="polite"
          >
            {isPreviewLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
                Checking active listings and open activity…
              </div>
            ) : previewError ? (
              <div
                className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                role="alert"
              >
                {previewError}
              </div>
            ) : preview ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border bg-background p-3">
                    <div className="text-2xl font-semibold">
                      {preview.changedListingCount}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      active listing
                      {preview.changedListingCount === 1 ? "" : "s"} will
                      update
                    </div>
                  </div>
                  <div className="rounded-xl border bg-background p-3">
                    <div className="text-2xl font-semibold">
                      {preview.unchangedListingCount}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      already match these defaults
                    </div>
                  </div>
                </div>

                {preview.skippedAcceptedOfferListingCount > 0 ? (
                  <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
                      aria-hidden="true"
                    />
                    <p>
                      {preview.skippedAcceptedOfferListingCount} listing
                      {preview.skippedAcceptedOfferListingCount === 1
                        ? " is"
                        : "s are"}{" "}
                      protected because an accepted offer is awaiting checkout.
                      Those listings will be skipped.
                    </p>
                  </div>
                ) : null}

                {warningCount > 0 ? (
                  <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      <AlertTriangle
                        className="h-4 w-4 text-amber-700"
                        aria-hidden="true"
                      />
                      Review open activity
                    </div>
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      {preview.warnings.pendingOrCounteredOfferCount > 0 ? (
                        <li>
                          {preview.warnings.pendingOrCounteredOfferCount} pending
                          or countered offer
                          {preview.warnings.pendingOrCounteredOfferCount === 1
                            ? ""
                            : "s"}{" "}
                          across{" "}
                          {
                            preview.warnings
                              .listingsWithPendingOrCounteredOffers
                          }{" "}
                          listing
                          {preview.warnings
                            .listingsWithPendingOrCounteredOffers === 1
                            ? ""
                            : "s"}
                        </li>
                      ) : null}
                      {preview.warnings.activeOrderCount > 0 ? (
                        <li>
                          {preview.warnings.activeOrderCount} active order
                          {preview.warnings.activeOrderCount === 1 ? "" : "s"}{" "}
                          across {preview.warnings.listingsWithActiveOrders}{" "}
                          listing
                          {preview.warnings.listingsWithActiveOrders === 1
                            ? ""
                            : "s"}
                        </li>
                      ) : null}
                      {preview.warnings.openSampleRequestCount > 0 ? (
                        <li>
                          {preview.warnings.openSampleRequestCount} open sample
                          request
                          {preview.warnings.openSampleRequestCount === 1
                            ? ""
                            : "s"}{" "}
                          across{" "}
                          {preview.warnings.listingsWithOpenSampleRequests}{" "}
                          listing
                          {preview.warnings.listingsWithOpenSampleRequests === 1
                            ? ""
                            : "s"}
                        </li>
                      ) : null}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      These are warnings, not blockers. Existing offer and order
                      snapshots remain unchanged.
                    </p>
                  </div>
                ) : null}

                {preview.changedListingCount > 0 ? (
                  <label
                    htmlFor="confirm-active-listing-defaults"
                    className="flex cursor-pointer items-start gap-3 rounded-xl border bg-background p-3"
                  >
                    <input
                      id="confirm-active-listing-defaults"
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) =>
                        onConfirmedChange(event.target.checked)
                      }
                      className="mt-1 h-4 w-4 accent-primary"
                    />
                    <span className="text-sm">
                      I reviewed this preview and want to replace the pricing
                      and selling rules on {preview.changedListingCount} active
                      listing
                      {preview.changedListingCount === 1 ? "" : "s"}.
                    </span>
                  </label>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No eligible active listing rules need to change. Your saved
                    defaults will still apply to future listings.
                  </p>
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function PreferencesPage() {
  const { user } = useAuthStore();
  const role = (user?.role ?? "buyer") as "buyer" | "seller";

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"wizard" | "dashboard">("wizard");
  const [buyerPrefs, setBuyerPrefs] = useState<BuyerPrefs>(defaultBuyerPrefs);
  const [sellerPrefs, setSellerPrefs] =
    useState<SellerPrefs>(defaultSellerPrefs);
  const [isSaving, setIsSaving] = useState(false);
  const [applyToActiveListings, setApplyToActiveListings] = useState(false);
  const [applyToActiveListingsConfirmed, setApplyToActiveListingsConfirmed] =
    useState(false);
  const [lastApplySummary, setLastApplySummary] =
    useState<ActiveListingApplySummary | null>(null);

  // Load existing prefs and hydrate form state
  const { data: existingPrefs, isLoading } = trpc.preferences.get.useQuery();

  // Switch to dashboard mode when existing preferences are loaded
  useEffect(() => {
    if (existingPrefs) {
      setMode("dashboard");
    }
  }, [existingPrefs]);

  useEffect(() => {
    if (!existingPrefs) return;
    if (role === "buyer") {
      setBuyerPrefs((p) => ({
        ...p,
        preferredZip: existingPrefs.preferredZip ?? "",
        preferredRadiusMiles: existingPrefs.preferredRadiusMiles ?? 100,
        preferredShippingMode:
          (existingPrefs.preferredShippingMode as BuyerPrefs["preferredShippingMode"]) ??
          "both",
        preferredMaterialTypes:
          (existingPrefs.preferredMaterialTypes as MaterialType[]) ?? [],
        preferredInstallTypes:
          (existingPrefs.preferredInstallTypes as InstallType[]) ?? [],
        minThicknessMm: existingPrefs.minThicknessMm?.toString() ?? "",
        minWearLayerMil: existingPrefs.minWearLayerMil?.toString() ?? "",
        waterproofRequired: existingPrefs.waterproofRequired ?? false,
        preferredSpecies: existingPrefs.preferredSpecies?.join(", ") ?? "",
        preferredCertifications:
          (existingPrefs.preferredCertifications as Certification[]) ?? [],
        priceMinPerSqFt: existingPrefs.priceMinPerSqFt?.toString() ?? "",
        priceMaxPerSqFt: existingPrefs.priceMaxPerSqFt?.toString() ?? "",
        minLotSizeSqFt: existingPrefs.minLotSizeSqFt?.toString() ?? "",
        maxLotSizeSqFt: existingPrefs.maxLotSizeSqFt?.toString() ?? "",
        urgency:
          (existingPrefs.urgency as BuyerPrefs["urgency"]) ?? "flexible",
      }));
    } else {
      setSellerPrefs((p) => ({
        ...p,
        originZip: existingPrefs.originZip ?? "",
        shipCapable: existingPrefs.shipCapable ?? false,
        leadTimeDaysMin: existingPrefs.leadTimeDaysMin?.toString() ?? "",
        leadTimeDaysMax: existingPrefs.leadTimeDaysMax?.toString() ?? "",
        palletizationCapable: existingPrefs.palletizationCapable ?? false,
        typicalMaterialTypes:
          (existingPrefs.typicalMaterialTypes as MaterialType[]) ?? [],
        avgLotSqFt: existingPrefs.avgLotSqFt?.toString() ?? "",
        canSplitLots: existingPrefs.canSplitLots ?? false,
        inventorySource:
          (existingPrefs.inventorySource as InventorySource[]) ?? [],
        pricingStyle:
          (existingPrefs.pricingStyle as SellerPrefs["pricingStyle"]) ??
          "fixed",
        preferredBuyerRadiusMiles:
          existingPrefs.preferredBuyerRadiusMiles ?? 250,
        partialQuantityMarkupPercent:
          existingPrefs.partialQuantityMarkupPercent?.toString() ?? "",
        automaticMarkdownEnabled:
          existingPrefs.automaticMarkdownEnabled ?? false,
        automaticMarkdownFloorPercent:
          existingPrefs.automaticMarkdownFloorPercent?.toString() ?? "",
        automaticMarkdownIntervalDays:
          existingPrefs.automaticMarkdownIntervalDays?.toString() ?? "",
        defaultAllowOffers: existingPrefs.defaultAllowOffers ?? true,
        allowSampleRequests: existingPrefs.allowSampleRequests ?? false,
        sellingTerritoryMode:
          (existingPrefs.sellingTerritoryMode as
            SellerPrefs["sellingTerritoryMode"]) ?? "unrestricted",
        allowedDestinationStates:
          (existingPrefs.allowedDestinationStates as SellerPrefs["allowedDestinationStates"]) ??
          [],
        freightMode: getFreightUiMode({
          freightPaymentMode:
            (existingPrefs.freightPaymentMode as "buyer_pays" | "seller_pays" | null) ??
            null,
          sellerFreightStates:
            (existingPrefs.sellerFreightStates as SellerPrefs["sellerFreightStates"]) ??
            [],
        }),
        sellerFreightStates:
          (existingPrefs.sellerFreightStates as SellerPrefs["sellerFreightStates"]) ??
          [],
        freightDropCharge: existingPrefs.freightDropCharge?.toString() ?? "",
        taxRegisteredStates:
          (existingPrefs.taxRegisteredStates as SellerPrefs["taxRegisteredStates"]) ??
          [],
      }));
    }
  }, [existingPrefs, role]);

  const utils = trpc.useUtils();
  const upsertMutation = trpc.preferences.upsert.useMutation();
  const sellerCommercialDefaults =
    getSellerCommercialDefaultsInput(sellerPrefs);
  const sellerCommercialDefaultsKey = JSON.stringify(
    sellerCommercialDefaults,
  );
  const activeListingPreview =
    trpc.preferences.previewActiveListingDefaultsApply.useQuery(
      sellerCommercialDefaults,
      {
        enabled:
          role === "seller" &&
          mode === "dashboard" &&
          applyToActiveListings,
        retry: false,
      },
    );
  const applyActiveListingDefaultsMutation =
    trpc.preferences.applySellerDefaultsToActiveListings.useMutation();

  useEffect(() => {
    setApplyToActiveListingsConfirmed(false);
    setLastApplySummary(null);
  }, [sellerCommercialDefaultsKey]);

  const buyerStepLabels = [
    "Location & Shipping",
    "Materials & Specs",
    "Budget & Urgency",
  ];
  const sellerStepLabels = [
    "Location & Shipping",
    "Inventory",
    "Pricing & Negotiation",
    "Territory, Samples & Tax",
  ];
  const stepLabels = role === "buyer" ? buyerStepLabels : sellerStepLabels;
  const totalSteps = stepLabels.length;

  const handleSave = async () => {
    const shouldApplyToActiveListings =
      role === "seller" &&
      mode === "dashboard" &&
      applyToActiveListings;
    if (shouldApplyToActiveListings) {
      if (
        activeListingPreview.isLoading ||
        activeListingPreview.isFetching
      ) {
        toast.error("Wait for the active-listing preview to finish.");
        return;
      }
      if (!activeListingPreview.data || activeListingPreview.error) {
        toast.error(
          activeListingPreview.error?.message ??
            "Review the active-listing preview before saving.",
        );
        return;
      }
      if (
        activeListingPreview.data.changedListingCount > 0 &&
        !applyToActiveListingsConfirmed
      ) {
        toast.error(
          "Confirm the active-listing changes shown in the preview.",
        );
        return;
      }
    }

    setIsSaving(true);
    let preferencesSaved = false;
    try {
      if (role === "buyer") {
        await upsertMutation.mutateAsync({
          role: "buyer",
          preferredZip: buyerPrefs.preferredZip || undefined,
          preferredRadiusMiles: buyerPrefs.preferredRadiusMiles,
          preferredShippingMode: buyerPrefs.preferredShippingMode,
          preferredMaterialTypes: buyerPrefs.preferredMaterialTypes.length
            ? buyerPrefs.preferredMaterialTypes
            : undefined,
          preferredInstallTypes: buyerPrefs.preferredInstallTypes.length
            ? buyerPrefs.preferredInstallTypes
            : undefined,
          minThicknessMm: buyerPrefs.minThicknessMm
            ? Number(buyerPrefs.minThicknessMm)
            : undefined,
          minWearLayerMil: buyerPrefs.minWearLayerMil
            ? Number(buyerPrefs.minWearLayerMil)
            : undefined,
          waterproofRequired: buyerPrefs.waterproofRequired || undefined,
          preferredSpecies: buyerPrefs.preferredSpecies
            ? buyerPrefs.preferredSpecies
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          preferredCertifications:
            buyerPrefs.preferredCertifications.length
              ? buyerPrefs.preferredCertifications
              : undefined,
          priceMinPerSqFt: buyerPrefs.priceMinPerSqFt
            ? Number(buyerPrefs.priceMinPerSqFt)
            : undefined,
          priceMaxPerSqFt: buyerPrefs.priceMaxPerSqFt
            ? Number(buyerPrefs.priceMaxPerSqFt)
            : undefined,
          minLotSizeSqFt: buyerPrefs.minLotSizeSqFt
            ? Number(buyerPrefs.minLotSizeSqFt)
            : undefined,
          maxLotSizeSqFt: buyerPrefs.maxLotSizeSqFt
            ? Number(buyerPrefs.maxLotSizeSqFt)
            : undefined,
          urgency: buyerPrefs.urgency,
        });
      } else {
        const freightDefaults = getFreightPersistenceValues(
          sellerPrefs.freightMode,
          sellerPrefs.sellerFreightStates,
        );
        await upsertMutation.mutateAsync({
          role: "seller",
          originZip: sellerPrefs.originZip || undefined,
          shipCapable: sellerPrefs.shipCapable,
          leadTimeDaysMin: sellerPrefs.leadTimeDaysMin
            ? Number(sellerPrefs.leadTimeDaysMin)
            : undefined,
          leadTimeDaysMax: sellerPrefs.leadTimeDaysMax
            ? Number(sellerPrefs.leadTimeDaysMax)
            : undefined,
          palletizationCapable: sellerPrefs.palletizationCapable,
          typicalMaterialTypes: sellerPrefs.typicalMaterialTypes.length
            ? sellerPrefs.typicalMaterialTypes
            : undefined,
          avgLotSqFt: sellerPrefs.avgLotSqFt
            ? Number(sellerPrefs.avgLotSqFt)
            : undefined,
          canSplitLots: sellerPrefs.canSplitLots,
          inventorySource: sellerPrefs.inventorySource.length
            ? sellerPrefs.inventorySource
            : undefined,
          pricingStyle: sellerPrefs.pricingStyle,
          preferredBuyerRadiusMiles: sellerPrefs.preferredBuyerRadiusMiles,
          partialQuantityMarkupPercent:
            sellerCommercialDefaults.partialQuantityMarkupPercent,
          automaticMarkdownEnabled: sellerPrefs.automaticMarkdownEnabled,
          automaticMarkdownFloorPercent:
            sellerCommercialDefaults.automaticMarkdownFloorPercent,
          automaticMarkdownIntervalDays:
            sellerCommercialDefaults.automaticMarkdownIntervalDays,
          defaultAllowOffers: sellerPrefs.defaultAllowOffers,
          allowSampleRequests: sellerPrefs.allowSampleRequests,
          sellingTerritoryMode: sellerPrefs.sellingTerritoryMode,
          allowedDestinationStates:
            sellerPrefs.allowedDestinationStates.length > 0
              ? sellerPrefs.allowedDestinationStates
              : [],
          freightPaymentMode: freightDefaults.freightPaymentMode,
          sellerFreightStates: freightDefaults.sellerFreightStates,
          freightDropCharge: sellerCommercialDefaults.freightDropCharge,
          taxRegisteredStates:
            sellerPrefs.taxRegisteredStates.length > 0
              ? sellerPrefs.taxRegisteredStates
              : [],
        });
      }
      preferencesSaved = true;

      let applySummary: ActiveListingApplySummary | null = null;
      if (shouldApplyToActiveListings) {
        applySummary =
          await applyActiveListingDefaultsMutation.mutateAsync({
            defaults: sellerCommercialDefaults,
            confirmed: true,
          });
        setLastApplySummary(applySummary);
        setApplyToActiveListings(false);
        setApplyToActiveListingsConfirmed(false);
        await utils.listing.invalidate();
      }

      // Invalidate so the query refetches on next visit
      await Promise.all([
        utils.preferences.get.invalidate(),
        utils.auth.getOnboardingProgress.invalidate(),
      ]);

      if (mode === "wizard") {
        celebrateMilestone("Preferences Saved!", "You'll now see personalized recommendations based on your preferences.");
        setMode("dashboard");
      } else if (applySummary) {
        toast.success(
          `Defaults saved. ${applySummary.changedListingCount} active listing${
            applySummary.changedListingCount === 1 ? "" : "s"
          } updated${
            applySummary.skippedAcceptedOfferListingCount > 0
              ? `; ${applySummary.skippedAcceptedOfferListingCount} protected listing${
                  applySummary.skippedAcceptedOfferListingCount === 1
                    ? ""
                    : "s"
                } skipped`
              : ""
          }.`,
        );
      } else {
        toast.success("Preferences saved");
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to save preferences. Please try again.";
      toast.error(
        preferencesSaved && shouldApplyToActiveListings
          ? `Defaults were saved for future listings, but active listings were not changed. ${msg}`
          : msg,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const renderBuyerStep = () => {
    if (step === 1)
      return <BuyerStep1 prefs={buyerPrefs} setPrefs={setBuyerPrefs} />;
    if (step === 2)
      return <BuyerStep2 prefs={buyerPrefs} setPrefs={setBuyerPrefs} />;
    return <BuyerStep3 prefs={buyerPrefs} setPrefs={setBuyerPrefs} />;
  };

  const renderSellerStep = () => {
    if (step === 1)
      return <SellerStep1 prefs={sellerPrefs} setPrefs={setSellerPrefs} />;
    if (step === 2)
      return <SellerStep2 prefs={sellerPrefs} setPrefs={setSellerPrefs} />;
    if (step === 3)
      return <SellerStep3 prefs={sellerPrefs} setPrefs={setSellerPrefs} />;
    return <SellerStep4 prefs={sellerPrefs} setPrefs={setSellerPrefs} />;
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-72 mt-2" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border bg-card p-6 space-y-4"
          >
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ─── Dashboard mode: all cards stacked, single save ──────────────────────────
  if (mode === "dashboard") {
    const updatedAt = (existingPrefs as Record<string, unknown>)?.updatedAt as string | undefined;
    const activeApplyBlocked =
      role === "seller" &&
      applyToActiveListings &&
      (activeListingPreview.isLoading ||
        activeListingPreview.isFetching ||
        !activeListingPreview.data ||
        Boolean(activeListingPreview.error) ||
        (activeListingPreview.data.changedListingCount > 0 &&
          !applyToActiveListingsConfirmed));

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Your Preferences</h1>
          <p className="text-muted-foreground mt-1">
            {updatedAt ? (
              <>Last updated {new Date(updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</>
            ) : (
              <>Edit your {role === "buyer" ? "buyer request" : "listing"} preferences below.</>
            )}
          </p>
        </div>

        {role === "buyer" ? (
          <div className="space-y-6">
            <BuyerStep1 prefs={buyerPrefs} setPrefs={setBuyerPrefs} />
            <BuyerStep2 prefs={buyerPrefs} setPrefs={setBuyerPrefs} />
            <BuyerStep3 prefs={buyerPrefs} setPrefs={setBuyerPrefs} />
          </div>
        ) : (
          <div className="space-y-6">
            <SellerStep1 prefs={sellerPrefs} setPrefs={setSellerPrefs} />
            <SellerStep2 prefs={sellerPrefs} setPrefs={setSellerPrefs} />
            <SellerStep3 prefs={sellerPrefs} setPrefs={setSellerPrefs} />
            <SellerStep4 prefs={sellerPrefs} setPrefs={setSellerPrefs} />
            <ActiveListingApplyPanel
              enabled={applyToActiveListings}
              onEnabledChange={(enabled) => {
                setApplyToActiveListings(enabled);
                setApplyToActiveListingsConfirmed(false);
                setLastApplySummary(null);
              }}
              confirmed={applyToActiveListingsConfirmed}
              onConfirmedChange={setApplyToActiveListingsConfirmed}
              preview={activeListingPreview.data}
              isPreviewLoading={
                activeListingPreview.isLoading ||
                activeListingPreview.isFetching
              }
              previewError={activeListingPreview.error?.message ?? null}
            />
            {lastApplySummary ? (
              <div
                className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm"
                role="status"
              >
                <div className="font-medium">Active listings updated</div>
                <p className="mt-1 text-muted-foreground">
                  {lastApplySummary.changedListingCount} listing
                  {lastApplySummary.changedListingCount === 1 ? "" : "s"}{" "}
                  updated, {lastApplySummary.unchangedListingCount} already
                  matched, and{" "}
                  {lastApplySummary.skippedAcceptedOfferListingCount} protected
                  listing
                  {lastApplySummary.skippedAcceptedOfferListingCount === 1
                    ? ""
                    : "s"}{" "}
                  skipped.
                </p>
              </div>
            ) : null}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || activeApplyBlocked}
          >
            {isSaving ? (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {applyToActiveListings
              ? "Save & Apply Confirmed Changes"
              : "Save Changes"}
          </Button>
        </div>
      </div>
    );
  }

  // ─── Wizard mode: step-by-step for first-time users ──────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Preferences</h1>
        <p className="text-muted-foreground mt-1">
          Help us match you with the best{" "}
          {role === "buyer" ? "listings" : "buyer requests"}.
        </p>
      </div>

      <StepProgress
        current={step}
        total={totalSteps}
        labels={stepLabels}
      />

      {step === 1 && (
        <OnboardingTip id="preferences-tip">
          Setting preferences unlocks personalized recommendations and alerts for listings matching your needs.
        </OnboardingTip>
      )}

      {role === "buyer" ? renderBuyerStep() : renderSellerStep()}

      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 1}
          aria-label="Go to previous step"
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Back
        </Button>

        {step < totalSteps ? (
          <Button
            onClick={() => setStep((s) => s + 1)}
            aria-label="Go to next step"
          >
            Next
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Save Preferences
          </Button>
        )}
      </div>
    </div>
  );
}
