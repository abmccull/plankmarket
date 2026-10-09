import { getWearLayerOptionsForSingle } from "@/lib/constants/flooring";

export type CsvWearLayerUnit = "mm" | "mil";
export const MIN_CSV_WEAR_LAYER_MM = 0.001;
export const MAX_CSV_WEAR_LAYER_MM = 25.4;

/** Source units stay in the CSV transport; call this once when persisting mm. */
export function normalizeCsvWearLayer(
  wearLayer: number | undefined,
  wearLayerUnit: CsvWearLayerUnit | undefined,
  materialType: string,
): { millimeters: number; method: "millimeters" | "form_preset" | "mil_conversion" } | null {
  if (wearLayer === undefined && wearLayerUnit === undefined) return null;
  if (wearLayer === undefined) throw new Error("Add wearLayer, or leave both wear-layer cells blank.");
  if (wearLayerUnit !== "mm" && wearLayerUnit !== "mil") {
    throw new Error("Add wearLayerUnit: mm or mil. The source unit cannot be inferred.");
  }
  if (!Number.isFinite(wearLayer) || wearLayer <= 0) {
    throw new Error("Wear layer must be a finite positive number.");
  }

  // Match the declared mil label exactly, never by value magnitude or proximity.
  const preset = wearLayerUnit === "mil"
    ? getWearLayerOptionsForSingle(materialType).find((option) => option.label === `${wearLayer} mil`)
    : undefined;
  const millimeters = wearLayerUnit === "mm"
    ? wearLayer
    : preset?.value ?? Number((wearLayer * 0.0254).toPrecision(12));

  if (!Number.isFinite(millimeters) || millimeters < MIN_CSV_WEAR_LAYER_MM || millimeters > MAX_CSV_WEAR_LAYER_MM) {
    throw new Error(`Wear layer must convert to between ${MIN_CSV_WEAR_LAYER_MM} and ${MAX_CSV_WEAR_LAYER_MM} mm (up to 1000 mil).`);
  }
  return {
    millimeters,
    method: wearLayerUnit === "mm" ? "millimeters" : preset ? "form_preset" : "mil_conversion",
  };
}
