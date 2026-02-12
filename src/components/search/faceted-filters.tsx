"use client";

import { useSearchStore } from "@/lib/stores/search-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import type { MaterialType, ConditionType } from "@/types";

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

export function FacetedFilters() {
  const { filters, setFilters, clearFilters } = useSearchStore();

  const toggleMaterial = (value: MaterialType) => {
    const current = filters.materialType || [];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setFilters({ materialType: updated.length > 0 ? updated : undefined });
  };

  const toggleCondition = (value: ConditionType) => {
    const current = filters.condition || [];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setFilters({ condition: updated.length > 0 ? updated : undefined });
  };

  const hasActiveFilters =
    (filters.materialType && filters.materialType.length > 0) ||
    (filters.condition && filters.condition.length > 0) ||
    filters.priceMin !== undefined ||
    filters.priceMax !== undefined ||
    filters.minLotSize !== undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Filters</h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
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
        <div className="flex flex-wrap gap-1.5">
          {MATERIAL_OPTIONS.map((opt) => {
            const isActive = filters.materialType?.includes(opt.value);
            return (
              <Badge
                key={opt.value}
                variant={isActive ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => toggleMaterial(opt.value)}
              >
                {opt.label}
              </Badge>
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
        <div className="flex flex-wrap gap-1.5">
          {CONDITION_OPTIONS.map((opt) => {
            const isActive = filters.condition?.includes(opt.value);
            return (
              <Badge
                key={opt.value}
                variant={isActive ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => toggleCondition(opt.value)}
              >
                {opt.label}
              </Badge>
            );
          })}
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
              setFilters({
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
              setFilters({
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
              setFilters({
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
              setFilters({
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

      {/* Thickness */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">
          Thickness (inches)
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            placeholder="Min"
            step="0.01"
            value={filters.thicknessMin ?? ""}
            onChange={(e) =>
              setFilters({
                thicknessMin: e.target.value
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
            value={filters.thicknessMax ?? ""}
            onChange={(e) =>
              setFilters({
                thicknessMax: e.target.value
                  ? parseFloat(e.target.value)
                  : undefined,
              })
            }
            className="h-8 text-xs"
          />
        </div>
      </div>
    </div>
  );
}
