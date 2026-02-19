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
import { ArrowLeft, ArrowRight, Check, Loader2, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { celebrateMilestone } from "@/lib/utils/celebrate";
import { OnboardingTip } from "@/components/ui/onboarding-tip";

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
};

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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing</CardTitle>
        <CardDescription>
          How do you prefer to price your inventory?
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PreferencesPage() {
  const { user } = useAuthStore();
  const role = (user?.role ?? "buyer") as "buyer" | "seller";

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"wizard" | "dashboard">("wizard");
  const [buyerPrefs, setBuyerPrefs] = useState<BuyerPrefs>(defaultBuyerPrefs);
  const [sellerPrefs, setSellerPrefs] =
    useState<SellerPrefs>(defaultSellerPrefs);
  const [isSaving, setIsSaving] = useState(false);

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
      }));
    }
  }, [existingPrefs, role]);

  const utils = trpc.useUtils();
  const upsertMutation = trpc.preferences.upsert.useMutation();

  const buyerStepLabels = [
    "Location & Shipping",
    "Materials & Specs",
    "Budget & Urgency",
  ];
  const sellerStepLabels = ["Location & Shipping", "Inventory", "Pricing"];
  const stepLabels = role === "buyer" ? buyerStepLabels : sellerStepLabels;
  const totalSteps = stepLabels.length;

  const handleSave = async () => {
    setIsSaving(true);
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
        await upsertMutation.mutateAsync({
          role: "seller",
          originZip: sellerPrefs.originZip || undefined,
          shipCapable: sellerPrefs.shipCapable || undefined,
          leadTimeDaysMin: sellerPrefs.leadTimeDaysMin
            ? Number(sellerPrefs.leadTimeDaysMin)
            : undefined,
          leadTimeDaysMax: sellerPrefs.leadTimeDaysMax
            ? Number(sellerPrefs.leadTimeDaysMax)
            : undefined,
          palletizationCapable:
            sellerPrefs.palletizationCapable || undefined,
          typicalMaterialTypes: sellerPrefs.typicalMaterialTypes.length
            ? sellerPrefs.typicalMaterialTypes
            : undefined,
          avgLotSqFt: sellerPrefs.avgLotSqFt
            ? Number(sellerPrefs.avgLotSqFt)
            : undefined,
          canSplitLots: sellerPrefs.canSplitLots || undefined,
          inventorySource: sellerPrefs.inventorySource.length
            ? sellerPrefs.inventorySource
            : undefined,
          pricingStyle: sellerPrefs.pricingStyle,
          preferredBuyerRadiusMiles:
            sellerPrefs.preferredBuyerRadiusMiles,
        });
      }
      // Invalidate so the query refetches on next visit
      utils.preferences.get.invalidate();

      if (mode === "wizard") {
        celebrateMilestone("Preferences Saved!", "You'll now see personalized recommendations based on your preferences.");
        setMode("dashboard");
      } else {
        toast.success("Preferences saved");
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to save preferences. Please try again.";
      toast.error(msg);
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
    return <SellerStep3 prefs={sellerPrefs} setPrefs={setSellerPrefs} />;
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

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Your Preferences</h1>
          <p className="text-muted-foreground mt-1">
            {updatedAt ? (
              <>Last updated {new Date(updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</>
            ) : (
              <>Edit your {role === "buyer" ? "listing" : "buyer request"} preferences below.</>
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
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Save Changes
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
