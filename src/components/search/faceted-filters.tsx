"use client";

import { useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, SlidersHorizontal } from "lucide-react";
import type {
  SearchFilters,
  MaterialType,
  ConditionType,
  Species,
  ColorFamily,
  FinishType,
  Certification,
} from "@/types";
import { WIDTH_OPTIONS, THICKNESS_OPTIONS, DISTANCE_OPTIONS, getWearLayerOptions } from "@/lib/constants/flooring";

const MATERIAL_OPTIONS: { value: MaterialType; label: string }[] = [
  { value: "hardwood", label: "Hardwood" },
  { value: "engineered", label: "Engineered" },
  { value: "laminate", label: "Laminate" },
  { value: "vinyl_lvp", label: "Vinyl / LVP" },
  { value: "bamboo", label: "Bamboo" },
  { value: "tile", label: "Tile" },
];

const CONDITION_OPTIONS: { value: ConditionType; label: string }[] = [
  { value: "new_overstock", label: "New Overstock" },
  { value: "discontinued", label: "Discontinued" },
  { value: "closeout", label: "Closeout" },
  { value: "slight_damage", label: "Slight Damage" },
  { value: "returns", label: "Returns" },
  { value: "seconds", label: "Seconds" },
  { value: "remnants", label: "Remnants" },
];

const SPECIES_OPTIONS: { value: Species; label: string }[] = [
  { value: "oak", label: "Oak" },
  { value: "maple", label: "Maple" },
  { value: "walnut", label: "Walnut" },
  { value: "hickory", label: "Hickory" },
  { value: "cherry", label: "Cherry" },
  { value: "ash", label: "Ash" },
  { value: "birch", label: "Birch" },
  { value: "pine", label: "Pine" },
];

const COLOR_FAMILY_OPTIONS: { value: ColorFamily; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "dark", label: "Dark" },
  { value: "gray", label: "Gray" },
  { value: "white", label: "White" },
  { value: "brown", label: "Brown" },
  { value: "natural", label: "Natural" },
];

const FINISH_OPTIONS: { value: FinishType; label: string }[] = [
  { value: "matte", label: "Matte" },
  { value: "semi_gloss", label: "Semi-Gloss" },
  { value: "gloss", label: "Gloss" },
  { value: "wire_brushed", label: "Wire Brushed" },
  { value: "hand_scraped", label: "Hand Scraped" },
  { value: "smooth", label: "Smooth" },
  { value: "textured", label: "Textured" },
];

const CERTIFICATION_OPTIONS: { value: Certification; label: string }[] = [
  { value: "fsc", label: "FSC" },
  { value: "floorscore", label: "FloorScore" },
  { value: "greenguard", label: "Greenguard" },
  { value: "carb2", label: "CARB2" },
];

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

const badgeClass = (isActive: boolean | undefined) =>
  `inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer min-h-9 ${
    isActive
      ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
      : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
  }`;

interface FacetedFiltersProps {
  filters: SearchFilters;
  onFiltersChange: (updates: Partial<SearchFilters>) => void;
  onClearFilters: () => void;
}

export function FacetedFilters({
  filters,
  onFiltersChange,
  onClearFilters,
}: FacetedFiltersProps) {
  const user = useAuthStore((s) => s.user);
  const [localZip, setLocalZip] = useState(filters.buyerZip || user?.zipCode || "");

  const updateArrayFilter = <
    Key extends keyof SearchFilters,
    Value extends string | number,
  >(
    key: Key,
    value: Value,
  ) => {
    const current = (filters[key] as Value[] | undefined) || [];
    const updated = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];

    return updated.length > 0 ? updated : undefined;
  };

  const toggleMaterial = (value: MaterialType) => {
    const updatedMaterialType = updateArrayFilter("materialType", value) as
      | SearchFilters["materialType"]
      | undefined;
    const allowedWearLayerValues = new Set(
      getWearLayerOptions(updatedMaterialType).map((option) => option.value),
    );
    const nextWearLayer = filters.wearLayer?.filter((layer) =>
      allowedWearLayerValues.has(layer),
    );

    onFiltersChange({
      materialType: updatedMaterialType,
      wearLayer: nextWearLayer?.length ? nextWearLayer : undefined,
    });
  };

  const toggleCondition = (value: ConditionType) => {
    onFiltersChange({
      condition: updateArrayFilter("condition", value) as
        | SearchFilters["condition"]
        | undefined,
    });
  };

  const toggleSpecies = (value: Species) => {
    onFiltersChange({
      species: updateArrayFilter("species", value) as
        | SearchFilters["species"]
        | undefined,
    });
  };

  const toggleColorFamily = (value: ColorFamily) => {
    onFiltersChange({
      colorFamily: updateArrayFilter("colorFamily", value) as
        | SearchFilters["colorFamily"]
        | undefined,
    });
  };

  const toggleFinish = (value: FinishType) => {
    onFiltersChange({
      finishType: updateArrayFilter("finishType", value) as
        | SearchFilters["finishType"]
        | undefined,
    });
  };

  const toggleState = (value: string) => {
    onFiltersChange({
      state: updateArrayFilter("state", value) as SearchFilters["state"] | undefined,
    });
  };

  const toggleCertification = (value: Certification) => {
    onFiltersChange({
      certifications: updateArrayFilter("certifications", value) as
        | SearchFilters["certifications"]
        | undefined,
    });
  };

  const toggleWidth = (value: number) => {
    onFiltersChange({
      width: updateArrayFilter("width", value) as SearchFilters["width"] | undefined,
    });
  };

  const toggleThickness = (value: number) => {
    onFiltersChange({
      thickness: updateArrayFilter("thickness", value) as
        | SearchFilters["thickness"]
        | undefined,
    });
  };

  const toggleWearLayer = (value: number) => {
    onFiltersChange({
      wearLayer: updateArrayFilter("wearLayer", value) as
        | SearchFilters["wearLayer"]
        | undefined,
    });
  };

  const wearLayerOptions = getWearLayerOptions(filters.materialType);

  const hasActiveFilters =
    (filters.materialType && filters.materialType.length > 0) ||
    (filters.condition && filters.condition.length > 0) ||
    (filters.species && filters.species.length > 0) ||
    (filters.colorFamily && filters.colorFamily.length > 0) ||
    (filters.finishType && filters.finishType.length > 0) ||
    (filters.state && filters.state.length > 0) ||
    (filters.certifications && filters.certifications.length > 0) ||
    (filters.width && filters.width.length > 0) ||
    (filters.thickness && filters.thickness.length > 0) ||
    (filters.wearLayer && filters.wearLayer.length > 0) ||
    filters.priceMin !== undefined ||
    filters.priceMax !== undefined ||
    filters.minLotSize !== undefined ||
    filters.maxLotSize !== undefined ||
    filters.buyerZip !== undefined ||
    filters.maxDistance !== undefined ||
    filters.sellerVerified !== undefined ||
    filters.freightReady !== undefined ||
    filters.fullLotOnly !== undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-secondary" />
          Filters
        </h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLocalZip(user?.zipCode || "");
              onClearFilters();
            }}
            className="text-xs"
          >
            Clear all
            <X className="ml-1 h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Material Type */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">
          Material Type
        </Label>
        <div
          className="flex flex-wrap gap-1.5"
          role="listbox"
          aria-multiselectable="true"
          aria-label="Material type filters"
        >
          {MATERIAL_OPTIONS.map((opt) => {
            const isActive = filters.materialType?.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isActive}

                onClick={() => toggleMaterial(opt.value)}
                className={badgeClass(isActive)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Condition */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">
          Condition
        </Label>
        <div
          className="flex flex-wrap gap-1.5"
          role="listbox"
          aria-multiselectable="true"
          aria-label="Condition filters"
        >
          {CONDITION_OPTIONS.map((opt) => {
            const isActive = filters.condition?.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isActive}

                onClick={() => toggleCondition(opt.value)}
                className={badgeClass(isActive)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Buying confidence */}
      <div>
        <Label className="mb-2 block text-xs font-medium text-muted-foreground">
          Buying confidence
        </Label>
        <div className="flex flex-wrap gap-1.5" aria-label="Buying confidence filters">
          <button
            type="button"
            aria-pressed={filters.sellerVerified === true}
            onClick={() =>
              onFiltersChange({
                sellerVerified:
                  filters.sellerVerified === true ? undefined : true,
              })
            }
            className={badgeClass(filters.sellerVerified === true)}
          >
            Verified sellers
          </button>
          <button
            type="button"
            aria-pressed={filters.freightReady === true}
            onClick={() =>
              onFiltersChange({
                freightReady: filters.freightReady === true ? undefined : true,
              })
            }
            className={badgeClass(filters.freightReady === true)}
          >
            Freight quote ready
          </button>
        </div>
      </div>

      <Separator />

      {/* Lot format */}
      <div>
        <Label className="mb-2 block text-xs font-medium text-muted-foreground">
          Lot format
        </Label>
        <div className="flex flex-wrap gap-1.5" aria-label="Lot format filters">
          <button
            type="button"
            aria-pressed={filters.fullLotOnly === true}
            onClick={() =>
              onFiltersChange({
                fullLotOnly: filters.fullLotOnly === true ? undefined : true,
              })
            }
            className={badgeClass(filters.fullLotOnly === true)}
          >
            Full lot only
          </button>
          <button
            type="button"
            aria-pressed={filters.fullLotOnly === false}
            onClick={() =>
              onFiltersChange({
                fullLotOnly: filters.fullLotOnly === false ? undefined : false,
              })
            }
            className={badgeClass(filters.fullLotOnly === false)}
          >
            Split lots allowed
          </button>
        </div>
      </div>

      <Separator />

      {/* Price Range */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">
          Price per Sq Ft ($)
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            placeholder="Min"
            step="0.01"
            value={filters.priceMin ?? ""}
            onChange={(e) =>
              onFiltersChange({
                priceMin: e.target.value
                  ? parseFloat(e.target.value)
                  : undefined,
              })
            }
            className="h-8 text-xs"
          />
          <Input
            type="number"
            placeholder="Max"
            step="0.01"
            value={filters.priceMax ?? ""}
            onChange={(e) =>
              onFiltersChange({
                priceMax: e.target.value
                  ? parseFloat(e.target.value)
                  : undefined,
              })
            }
            className="h-8 text-xs"
          />
        </div>
      </div>

      <Separator />

      {/* Lot Size */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">
          Lot Size (Sq Ft)
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={filters.minLotSize ?? ""}
            onChange={(e) =>
              onFiltersChange({
                minLotSize: e.target.value
                  ? parseInt(e.target.value)
                  : undefined,
              })
            }
            className="h-8 text-xs"
          />
          <Input
            type="number"
            placeholder="Max"
            value={filters.maxLotSize ?? ""}
            onChange={(e) =>
              onFiltersChange({
                maxLotSize: e.target.value
                  ? parseInt(e.target.value)
                  : undefined,
              })
            }
            className="h-8 text-xs"
          />
        </div>
      </div>

      <Separator />

      {/* Width - Badge Toggles */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">
          Width
        </Label>
        <div
          className="flex flex-wrap gap-1.5"
          role="listbox"
          aria-multiselectable="true"
          aria-label="Width filters"
        >
          {WIDTH_OPTIONS.map((opt) => {
            const isActive = filters.width?.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isActive}

                onClick={() => toggleWidth(opt.value)}
                className={badgeClass(isActive)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Thickness - Badge Toggles */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">
          Thickness
        </Label>
        <div
          className="flex flex-wrap gap-1.5"
          role="listbox"
          aria-multiselectable="true"
          aria-label="Thickness filters"
        >
          {THICKNESS_OPTIONS.map((opt) => {
            const isActive = filters.thickness?.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isActive}

                onClick={() => toggleThickness(opt.value)}
                className={badgeClass(isActive)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Wear Layer - Badge Toggles (conditional on material type) */}
      {wearLayerOptions.length > 0 && (
        <>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-2 block">
              Wear Layer
            </Label>
            <div
              className="flex flex-wrap gap-1.5"
              role="listbox"
              aria-multiselectable="true"
              aria-label="Wear layer filters"
            >
              {wearLayerOptions.map((opt) => {
                const isActive = filters.wearLayer?.includes(opt.value);
                return (
                  <button
                    key={`${opt.group}-${opt.value}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
    
                    onClick={() => toggleWearLayer(opt.value)}
                    className={badgeClass(isActive)}
                    title={opt.group}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />
        </>
      )}

      {/* Species */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">
          Species
        </Label>
        <div
          className="flex flex-wrap gap-1.5"
          role="listbox"
          aria-multiselectable="true"
          aria-label="Species filters"
        >
          {SPECIES_OPTIONS.map((opt) => {
            const isActive = filters.species?.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isActive}

                onClick={() => toggleSpecies(opt.value)}
                className={badgeClass(isActive)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Color Family */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">
          Color
        </Label>
        <div
          className="flex flex-wrap gap-1.5"
          role="listbox"
          aria-multiselectable="true"
          aria-label="Color family filters"
        >
          {COLOR_FAMILY_OPTIONS.map((opt) => {
            const isActive = filters.colorFamily?.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isActive}

                onClick={() => toggleColorFamily(opt.value)}
                className={badgeClass(isActive)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Finish Type */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">
          Finish
        </Label>
        <div
          className="flex flex-wrap gap-1.5"
          role="listbox"
          aria-multiselectable="true"
          aria-label="Finish type filters"
        >
          {FINISH_OPTIONS.map((opt) => {
            const isActive = filters.finishType?.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isActive}

                onClick={() => toggleFinish(opt.value)}
                className={badgeClass(isActive)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Distance Filter */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">
          Distance
        </Label>
        <div className="space-y-2">
          <Input
            type="text"
            placeholder="Your ZIP code"
            maxLength={5}
            value={localZip}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 5);
              setLocalZip(val);
              if (val.length === 5) {
                onFiltersChange({ buyerZip: val });
              } else if (val.length === 0) {
                onFiltersChange({
                  buyerZip: undefined,
                  maxDistance: undefined,
                });
              }
            }}
            className="h-8 text-xs"
            aria-label="Buyer ZIP code"
          />
          <Select
            value={filters.maxDistance !== undefined ? String(filters.maxDistance) : ""}
            onValueChange={(v) => {
              const dist = parseInt(v);
              if (dist === 0) {
                onFiltersChange({ maxDistance: undefined });
              } else {
                onFiltersChange({
                  maxDistance: dist,
                  buyerZip: localZip || undefined,
                });
              }
            }}
          >
            <SelectTrigger
              className="h-8 text-xs"
              aria-label="Maximum distance from buyer ZIP code"
            >
              <SelectValue placeholder="Select distance" />
            </SelectTrigger>
            <SelectContent>
              {DISTANCE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Location (State) */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">
          State
        </Label>
        <div
          className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto"
          role="listbox"
          aria-multiselectable="true"
          aria-label="State filters"
        >
          {US_STATES.map((state) => {
            const isActive = filters.state?.includes(state);
            return (
              <button
                key={state}
                type="button"
                role="option"
                aria-selected={isActive}

                onClick={() => toggleState(state)}
                className={badgeClass(isActive)}
              >
                {state}
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Certifications */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">
          Certifications
        </Label>
        <div
          className="flex flex-wrap gap-1.5"
          role="listbox"
          aria-multiselectable="true"
          aria-label="Certification filters"
        >
          {CERTIFICATION_OPTIONS.map((opt) => {
            const isActive = filters.certifications?.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isActive}

                onClick={() => toggleCertification(opt.value)}
                className={badgeClass(isActive)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
