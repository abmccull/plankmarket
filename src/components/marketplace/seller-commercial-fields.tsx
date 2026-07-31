"use client";

import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldHint } from "@/components/ui/field-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn, formatCurrency } from "@/lib/utils";
import { previewAutomaticMarkdownSchedule } from "@/lib/listing-pricing";
import { US_STATE_CODES } from "@/lib/selling-territory";

export type UsStateCode = (typeof US_STATE_CODES)[number];

const US_REGION_PRESETS = [
  {
    label: "Northeast",
    states: ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"],
  },
  {
    label: "Midwest",
    states: [
      "IL",
      "IN",
      "MI",
      "OH",
      "WI",
      "IA",
      "KS",
      "MN",
      "MO",
      "NE",
      "ND",
      "SD",
    ],
  },
  {
    label: "South",
    states: [
      "DE",
      "FL",
      "GA",
      "MD",
      "NC",
      "SC",
      "VA",
      "WV",
      "AL",
      "KY",
      "MS",
      "TN",
      "AR",
      "LA",
      "OK",
      "TX",
    ],
  },
  {
    label: "West",
    states: [
      "AZ",
      "CO",
      "ID",
      "MT",
      "NV",
      "NM",
      "UT",
      "WY",
      "AK",
      "CA",
      "HI",
      "OR",
      "WA",
    ],
  },
] satisfies ReadonlyArray<{
  label: string;
  states: readonly UsStateCode[];
}>;

export type FreightUiMode =
  | "buyer_pays"
  | "seller_pays_all"
  | "seller_pays_selected";
export type SellerTerritoryMode = "unrestricted" | "allowed_states";

export interface CommercialReviewSummaryItem {
  label: string;
  value: string;
  badge?: string;
}

export function getFreightUiMode(input: {
  freightPaymentMode?: "buyer_pays" | "seller_pays" | null;
  sellerFreightStates?: readonly string[] | null;
}): FreightUiMode {
  if (input.freightPaymentMode !== "seller_pays") {
    return "buyer_pays";
  }

  return (input.sellerFreightStates?.length ?? 0) > 0
    ? "seller_pays_selected"
    : "seller_pays_all";
}

export function getFreightPersistenceValues(
  mode: FreightUiMode,
  selectedStates: readonly UsStateCode[],
) {
  if (mode === "buyer_pays") {
    return {
      freightPaymentMode: "buyer_pays" as const,
      sellerFreightStates: [] as UsStateCode[],
    };
  }

  return {
    freightPaymentMode: "seller_pays" as const,
    sellerFreightStates:
      mode === "seller_pays_selected" ? [...selectedStates] : ([] as UsStateCode[]),
  };
}

function formatStateList(states: readonly string[]) {
  if (states.length === 0) return "None selected";
  if (states.length <= 4) return states.join(", ");
  return `${states.slice(0, 4).join(", ")} +${states.length - 4} more`;
}

function buildDescribedBy(
  ...ids: Array<string | undefined | false>
): string | undefined {
  const value = ids.filter(Boolean).join(" ").trim();
  return value.length > 0 ? value : undefined;
}

function SectionError({
  id,
  message,
}: {
  id?: string;
  message?: string;
}) {
  if (!message) {
    return null;
  }

  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

interface SellerCommercialFulfillmentCopy {
  sampleLabel: string;
  sampleDescription: string;
  territoryHeading: string;
  territoryDescription: string;
  territoryNationwideTitle: string;
  territoryNationwideDescription: string;
  territoryRestrictedTitle: string;
  territoryRestrictedDescription: string;
  territoryStateLabel: string;
  territoryStateHelperText: string;
  freightHeading: string;
  freightDescription: string;
  freightBuyerPaysTitle: string;
  freightBuyerPaysDescription: string;
  freightAllStatesTitle: string;
  freightAllStatesDescription: string;
  freightSelectedStatesTitle: string;
  freightSelectedStatesDescription: string;
  freightStateLabel: string;
  freightStateHelperText: string;
  freightDropChargeLabel: string;
  freightDropChargeDescription: string;
  freightDropChargePlaceholder?: string;
}

const DEFAULT_FULFILLMENT_COPY: SellerCommercialFulfillmentCopy = {
  sampleLabel: "Allow sample requests",
  sampleDescription:
    "Enable the sample request workflow. This does not promise free samples or platform-managed relay shipping.",
  territoryHeading: "Sales territory",
  territoryDescription:
    "Restrict visibility and checkout to approved states when needed.",
  territoryNationwideTitle: "Nationwide",
  territoryNationwideDescription:
    "Show the listing to buyers in all supported states.",
  territoryRestrictedTitle: "Only selected states",
  territoryRestrictedDescription:
    "Show the listing only to buyers whose verified business state is in your territory.",
  territoryStateLabel: "Allowed destination states",
  territoryStateHelperText:
    "Only buyers with a verified business state in this list can discover or purchase the listing. Buyers without a verified state cannot see it.",
  freightHeading: "Freight funding",
  freightDescription:
    "Decide who pays the freight quote. Seller-funded freight is deducted from your net payout, and an optional buyer drop charge lets the buyer cover part of it.",
  freightBuyerPaysTitle: "Buyer pays freight",
  freightBuyerPaysDescription:
    "Charge the buyer the full freight quote at checkout.",
  freightAllStatesTitle: "Seller sponsors freight everywhere",
  freightAllStatesDescription:
    "Fund the quote in every destination, less any buyer drop charge.",
  freightSelectedStatesTitle: "Seller sponsors selected states",
  freightSelectedStatesDescription:
    "Fund freight only where your margin supports it.",
  freightStateLabel: "States with seller-funded freight",
  freightStateHelperText:
    "Outside these states, the listing falls back to buyer-paid freight.",
  freightDropChargeLabel: "Buyer drop charge (optional)",
  freightDropChargeDescription:
    "The buyer pays this amount toward freight. You fund the rest through the order's net payout.",
  freightDropChargePlaceholder: "e.g. 95",
};

export interface SellerCommercialFulfillmentFieldsProps {
  className?: string;
  territoryChoiceGridClassName?: string;
  freightChoiceGridClassName?: string;
  copy?: Partial<SellerCommercialFulfillmentCopy>;
  sampleRequests: {
    id: string;
    enabled: boolean;
    onChange: (checked: boolean) => void;
  };
  territory: {
    mode: SellerTerritoryMode;
    selectedStates: UsStateCode[];
    onChange: (next: {
      mode: SellerTerritoryMode;
      selectedStates: UsStateCode[];
    }) => void;
    error?: string;
  };
  freight: {
    mode: FreightUiMode;
    selectedStates: UsStateCode[];
    onChange: (next: {
      mode: FreightUiMode;
      selectedStates: UsStateCode[];
      persistence: ReturnType<typeof getFreightPersistenceValues>;
      shouldClearDropCharge: boolean;
    }) => void;
    dropChargeInputId: string;
    dropChargeValue: string;
    onDropChargeChange: (value: string) => void;
    statesError?: string;
    dropChargeError?: string;
  };
}

export function SellerCommercialFulfillmentFields({
  className,
  territoryChoiceGridClassName,
  freightChoiceGridClassName,
  copy: copyOverrides,
  sampleRequests,
  territory,
  freight,
}: SellerCommercialFulfillmentFieldsProps) {
  const copy = { ...DEFAULT_FULFILLMENT_COPY, ...copyOverrides };
  const territoryErrorId = useId();
  const freightStatesErrorId = useId();
  const dropChargeDescriptionId = useId();
  const dropChargeErrorId = useId();

  const updateTerritory = (mode: SellerTerritoryMode) => {
    territory.onChange({
      mode,
      selectedStates:
        mode === "allowed_states" ? territory.selectedStates : [],
    });
  };

  const updateFreightMode = (mode: FreightUiMode) => {
    const selectedStates =
      mode === "seller_pays_selected" ? freight.selectedStates : [];

    freight.onChange({
      mode,
      selectedStates,
      persistence: getFreightPersistenceValues(mode, selectedStates),
      shouldClearDropCharge: mode === "buyer_pays",
    });
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-2xl border bg-card p-4">
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="font-medium">{copy.territoryHeading}</div>
            <p className="text-sm text-muted-foreground">
              {copy.territoryDescription}
            </p>
          </div>

          <div
            className={cn("grid gap-3", territoryChoiceGridClassName)}
          >
            <ChoiceCard
              title={copy.territoryNationwideTitle}
              description={copy.territoryNationwideDescription}
              selected={territory.mode === "unrestricted"}
              onClick={() => updateTerritory("unrestricted")}
            />
            <ChoiceCard
              title={copy.territoryRestrictedTitle}
              description={copy.territoryRestrictedDescription}
              selected={territory.mode === "allowed_states"}
              onClick={() => updateTerritory("allowed_states")}
            />
          </div>

          {territory.mode === "allowed_states" ? (
            <div className="space-y-2">
              <StateBadgeSelector
                label={copy.territoryStateLabel}
                selected={territory.selectedStates}
                onChange={(selectedStates) =>
                  territory.onChange({
                    mode: "allowed_states",
                    selectedStates,
                  })
                }
                helperText={copy.territoryStateHelperText}
                describedBy={
                  territory.error ? territoryErrorId : undefined
                }
                invalid={Boolean(territory.error)}
              />
              <SectionError
                id={territory.error ? territoryErrorId : undefined}
                message={territory.error}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="font-medium">{copy.freightHeading}</div>
            <p className="text-sm text-muted-foreground">
              {copy.freightDescription}
            </p>
          </div>

          <div className={cn("grid gap-3", freightChoiceGridClassName)}>
            <ChoiceCard
              title={copy.freightBuyerPaysTitle}
              description={copy.freightBuyerPaysDescription}
              selected={freight.mode === "buyer_pays"}
              onClick={() => updateFreightMode("buyer_pays")}
            />
            <ChoiceCard
              title={copy.freightAllStatesTitle}
              description={copy.freightAllStatesDescription}
              selected={freight.mode === "seller_pays_all"}
              onClick={() => updateFreightMode("seller_pays_all")}
            />
            <ChoiceCard
              title={copy.freightSelectedStatesTitle}
              description={copy.freightSelectedStatesDescription}
              selected={freight.mode === "seller_pays_selected"}
              onClick={() => updateFreightMode("seller_pays_selected")}
            />
          </div>

          {freight.mode === "seller_pays_selected" ? (
            <div className="space-y-2">
              <StateBadgeSelector
                label={copy.freightStateLabel}
                selected={freight.selectedStates}
                onChange={(selectedStates) =>
                  freight.onChange({
                    mode: "seller_pays_selected",
                    selectedStates,
                    persistence: getFreightPersistenceValues(
                      "seller_pays_selected",
                      selectedStates,
                    ),
                    shouldClearDropCharge: false,
                  })
                }
                helperText={copy.freightStateHelperText}
                describedBy={
                  freight.statesError ? freightStatesErrorId : undefined
                }
                invalid={Boolean(freight.statesError)}
              />
              <SectionError
                id={
                  freight.statesError ? freightStatesErrorId : undefined
                }
                message={freight.statesError}
              />
            </div>
          ) : null}

          {freight.mode !== "buyer_pays" ? (
            <div className="space-y-2">
              <Label htmlFor={freight.dropChargeInputId}>
                {copy.freightDropChargeLabel}
              </Label>
              <Input
                id={freight.dropChargeInputId}
                type="number"
                min={0}
                step="1"
                value={freight.dropChargeValue}
                onChange={(event) =>
                  freight.onDropChargeChange(event.target.value)
                }
                placeholder={copy.freightDropChargePlaceholder}
                aria-invalid={Boolean(freight.dropChargeError)}
                aria-describedby={buildDescribedBy(
                  dropChargeDescriptionId,
                  freight.dropChargeError && dropChargeErrorId,
                )}
              />
              <p
                id={dropChargeDescriptionId}
                className="text-xs text-muted-foreground"
              >
                {copy.freightDropChargeDescription}
              </p>
              <SectionError
                id={
                  freight.dropChargeError ? dropChargeErrorId : undefined
                }
                message={freight.dropChargeError}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <Label
              htmlFor={sampleRequests.id}
              className="text-sm font-medium"
            >
              {copy.sampleLabel}
            </Label>
            <p className="text-sm text-muted-foreground">
              {copy.sampleDescription}
            </p>
          </div>
          <Switch
            id={sampleRequests.id}
            checked={sampleRequests.enabled}
            onCheckedChange={sampleRequests.onChange}
          />
        </div>
      </div>
    </div>
  );
}

export function getCommercialReviewSummary(input: {
  fullLotOnly?: boolean;
  partialQuantityMarkupPercent?: number | null;
  automaticMarkdownEnabled?: boolean;
  automaticMarkdownFloorPercent?: number | null;
  automaticMarkdownIntervalDays?: number | null;
  allowOffers?: boolean;
  floorPrice?: number | null;
  allowSampleRequests?: boolean;
  territoryMode?: "unrestricted" | "allowed_states" | null;
  allowedDestinationStates?: readonly string[] | null;
  freightPaymentMode?: "buyer_pays" | "seller_pays" | null;
  sellerFreightStates?: readonly UsStateCode[] | null;
  freightDropCharge?: number | null;
}): CommercialReviewSummaryItem[] {
  const freightMode = getFreightUiMode({
    freightPaymentMode: input.freightPaymentMode,
    sellerFreightStates: input.sellerFreightStates,
  });

  const lotStrategy = input.fullLotOnly
    ? "Full lot only"
    : input.partialQuantityMarkupPercent != null
      ? `Partial quantities allowed at +${input.partialQuantityMarkupPercent}%`
      : "Partial quantities allowed at list price";

  const markdown = input.automaticMarkdownEnabled
    ? `Every ${input.automaticMarkdownIntervalDays ?? "?"} days down to ${input.automaticMarkdownFloorPercent ?? "?"}% of the original ask`
    : "Off";

  const offers = input.allowOffers
    ? input.floorPrice != null
      ? `On with hidden floor at ${formatCurrency(input.floorPrice)}/sq ft`
      : "On without a hidden floor price"
    : "Off";

  const samples = input.allowSampleRequests ? "Enabled" : "Off";

  const territory =
    input.territoryMode === "allowed_states"
      ? formatStateList(input.allowedDestinationStates ?? [])
      : "Nationwide";

  const freightBase =
    freightMode === "buyer_pays"
      ? "Buyer pays freight"
      : freightMode === "seller_pays_all"
        ? "Seller sponsors freight nationwide"
        : `Seller sponsors freight in ${formatStateList(input.sellerFreightStates ?? [])}`;

  const freightValue =
    input.freightDropCharge != null && freightMode !== "buyer_pays"
      ? `${freightBase} - Buyer pays ${formatCurrency(input.freightDropCharge)} toward each shipment`
      : freightBase;

  return [
    { label: "Lot strategy", value: lotStrategy },
    { label: "Automatic markdown", value: markdown },
    { label: "Offers", value: offers },
    { label: "Samples", value: samples },
    { label: "Territory", value: territory },
    { label: "Freight funding", value: freightValue },
  ];
}

function intervalLabel(step: number, intervalDays: number) {
  if (step === 0) {
    return "Starts immediately";
  }

  const days = intervalDays * step;
  return `After ${days} day${days === 1 ? "" : "s"}`;
}

export function ChoiceCard({
  title,
  description,
  selected,
  onClick,
  badge,
  disabled = false,
}: {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-2xl border p-4 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        disabled && "cursor-not-allowed opacity-60",
        selected
          ? "border-primary bg-primary/[0.05] shadow-sm"
          : "border-border bg-card hover:border-primary/40 hover:bg-muted/40",
      )}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="font-medium">{title}</div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        {badge ? (
          <Badge variant={selected ? "default" : "outline"}>{badge}</Badge>
        ) : null}
      </div>
    </button>
  );
}

export function StateBadgeSelector({
  label,
  selected,
  onChange,
  helperText,
  describedBy,
  invalid = false,
}: {
  label: string;
  selected: UsStateCode[];
  onChange: (states: UsStateCode[]) => void;
  helperText?: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  const labelId = useId();
  const helperTextId = useId();

  const toggle = (code: UsStateCode) => {
    onChange(
      selected.includes(code)
        ? selected.filter((state) => state !== code)
        : [...selected, code],
    );
  };

  const toggleRegion = (states: readonly UsStateCode[]) => {
    const next = new Set(selected);
    const regionIsSelected = states.every((state) => next.has(state));

    for (const state of states) {
      if (regionIsSelected) {
        next.delete(state);
      } else {
        next.add(state);
      }
    }

    onChange(US_STATE_CODES.filter((state) => next.has(state)));
  };

  return (
    <div
      className="space-y-3"
      role="group"
      aria-labelledby={labelId}
      aria-describedby={buildDescribedBy(helperTextId, describedBy)}
      data-invalid={invalid ? "true" : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <div id={labelId} className="text-sm font-medium">
            {label}
          </div>
          {helperText ? (
            <p
              id={helperTextId}
              className="text-xs text-muted-foreground"
            >
              {helperText}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => onChange([...US_STATE_CODES])}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => onChange([])}
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Quick select
        </span>
        {US_REGION_PRESETS.map((region) => {
          const active = region.states.every((state) =>
            selected.includes(state),
          );

          return (
            <Button
              key={region.label}
              type="button"
              variant={active ? "secondary" : "outline"}
              size="sm"
              className="h-8 rounded-full px-3 text-xs"
              aria-pressed={active}
              onClick={() => toggleRegion(region.states)}
            >
              {region.label}
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {US_STATE_CODES.map((code) => {
          const active = selected.includes(code);

          return (
            <button
              key={code}
              type="button"
              onClick={() => toggle(code)}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
              aria-pressed={active}
            >
              <Badge
                variant={active ? "default" : "outline"}
                className="cursor-pointer px-2.5 py-1 font-medium"
              >
                {code}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AutomaticMarkdownPreview({
  baseUnitPrice,
  floorPercent,
  intervalDays,
  heading = "Automatic markdown preview",
  description = "The listing price starts at your ask, then moves through four equal markdown steps until it reaches the floor.",
}: {
  baseUnitPrice: number;
  floorPercent: number;
  intervalDays: number;
  heading?: string;
  description?: string;
}) {
  const preview = previewAutomaticMarkdownSchedule({
    baseUnitPrice,
    floorPercent,
    intervalDays,
  });

  if (!preview.isValid) {
    return null;
  }

  return (
    <Card className="border-dashed bg-muted/30">
      <CardContent className="space-y-4 pt-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{heading}</p>
            <FieldHint hint="A listing at $3.00 and a 60% floor will move through 100%, 90%, 80%, 70%, and 60% of the original ask." />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>

        <div>
          <table className="w-full text-sm">
            <thead className="hidden sm:table-header-group">
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Timing</th>
                <th className="pb-2 pr-4 font-medium">Percent</th>
                <th className="pb-2 pr-4 font-medium">Price</th>
                <th className="pb-2 font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="block sm:table-row-group">
              {preview.entries.map((entry) => (
                <tr
                  key={entry.step}
                  className="grid grid-cols-2 gap-x-4 gap-y-3 border-b py-3 last:border-b-0 sm:table-row sm:py-0"
                >
                  <td className="text-muted-foreground sm:py-2 sm:pr-4">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide sm:hidden">
                      Timing
                    </span>
                    {intervalLabel(entry.step, intervalDays)}
                  </td>
                  <td className="font-medium sm:py-2 sm:pr-4">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
                      Percent
                    </span>
                    {entry.percentOfOriginal}%
                  </td>
                  <td className="font-medium sm:py-2 sm:pr-4">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
                      Price
                    </span>
                    {formatCurrency(entry.unitPrice)}
                  </td>
                  <td className="text-muted-foreground sm:py-2">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide sm:hidden">
                      Change
                    </span>
                    {entry.discountPercent === 0
                      ? "Initial ask"
                      : `${entry.discountPercent}% below original`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
