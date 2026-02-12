// Standard flooring size options used in filters and listing forms

export const WIDTH_OPTIONS = [
  { label: '2-1/4"', value: 2.25 },
  { label: '3-1/4"', value: 3.25 },
  { label: '4"', value: 4 },
  { label: '5"', value: 5 },
  { label: '6"', value: 6 },
  { label: '7"', value: 7 },
  { label: '8"', value: 8 },
  { label: '9"+', value: 9 },
] as const;

export const THICKNESS_OPTIONS = [
  { label: "6mm", value: 0.24 },
  { label: "7mm", value: 0.28 },
  { label: "8mm", value: 0.31 },
  { label: "10mm", value: 0.39 },
  { label: "12mm", value: 0.47 },
  { label: '3/8"', value: 0.375 },
  { label: '1/2"', value: 0.5 },
  { label: '5/8"', value: 0.625 },
  { label: '3/4"', value: 0.75 },
] as const;

// Wear layer stored in mm, display varies by material type
export const WEAR_LAYER_VINYL = [
  { label: "6 mil", value: 0.15 },
  { label: "8 mil", value: 0.2 },
  { label: "12 mil", value: 0.3 },
  { label: "20 mil", value: 0.51 },
  { label: "28 mil", value: 0.71 },
  { label: "40 mil", value: 1.02 },
] as const;

export const WEAR_LAYER_ENGINEERED = [
  { label: "0.6mm", value: 0.6 },
  { label: "1mm", value: 1 },
  { label: "2mm", value: 2 },
  { label: "3mm", value: 3 },
  { label: "4mm", value: 4 },
  { label: "6mm", value: 6 },
] as const;

export const WEAR_LAYER_LAMINATE = [
  { label: "0.2mm", value: 0.2 },
  { label: "0.3mm", value: 0.3 },
  { label: "0.5mm", value: 0.5 },
  { label: "0.7mm", value: 0.7 },
] as const;

export type MaterialTypeKey = "vinyl_lvp" | "engineered" | "laminate";

export function getWearLayerOptions(materialType?: string | string[]) {
  const types = Array.isArray(materialType)
    ? materialType
    : materialType
      ? [materialType]
      : [];

  if (types.length === 0) {
    // Show all grouped options
    return [
      ...WEAR_LAYER_VINYL.map((o) => ({ ...o, group: "Vinyl/LVP" })),
      ...WEAR_LAYER_ENGINEERED.map((o) => ({ ...o, group: "Engineered" })),
      ...WEAR_LAYER_LAMINATE.map((o) => ({ ...o, group: "Laminate" })),
    ];
  }

  const options: { label: string; value: number; group: string }[] = [];
  if (types.includes("vinyl_lvp")) {
    options.push(...WEAR_LAYER_VINYL.map((o) => ({ ...o, group: "Vinyl/LVP" })));
  }
  if (types.includes("engineered")) {
    options.push(...WEAR_LAYER_ENGINEERED.map((o) => ({ ...o, group: "Engineered" })));
  }
  if (types.includes("laminate")) {
    options.push(...WEAR_LAYER_LAMINATE.map((o) => ({ ...o, group: "Laminate" })));
  }
  return options;
}

export function getWearLayerOptionsForSingle(materialType?: string) {
  switch (materialType) {
    case "vinyl_lvp":
      return [...WEAR_LAYER_VINYL];
    case "engineered":
      return [...WEAR_LAYER_ENGINEERED];
    case "laminate":
      return [...WEAR_LAYER_LAMINATE];
    default:
      return [];
  }
}

export const DISTANCE_OPTIONS = [
  { label: "25 mi", value: 25 },
  { label: "50 mi", value: 50 },
  { label: "100 mi", value: 100 },
  { label: "250 mi", value: 250 },
  { label: "500 mi", value: 500 },
  { label: "Nationwide", value: 0 },
] as const;
