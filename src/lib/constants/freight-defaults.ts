type MaterialType =
  | "hardwood"
  | "engineered"
  | "laminate"
  | "vinyl_lvp"
  | "bamboo"
  | "tile"
  | "other";

interface FreightDefaults {
  nmfcCode: string;
  freightClass: string;
}

const FREIGHT_DEFAULTS_MAP: Partial<Record<MaterialType, FreightDefaults>> = {
  tile: { nmfcCode: "182570", freightClass: "60" },
  hardwood: { nmfcCode: "37860", freightClass: "55" },
  engineered: { nmfcCode: "34730", freightClass: "60" },
  laminate: { nmfcCode: "34735", freightClass: "60" },
  vinyl_lvp: { nmfcCode: "34730", freightClass: "60" },
  bamboo: { nmfcCode: "37860", freightClass: "55" },
};

export function getFreightDefaults(
  materialType: string | undefined
): FreightDefaults | null {
  if (!materialType) return null;
  return FREIGHT_DEFAULTS_MAP[materialType as MaterialType] ?? null;
}

export const FREIGHT_CLASS_OPTIONS = [
  "50",
  "55",
  "60",
  "65",
  "70",
  "77.5",
  "85",
  "92.5",
  "100",
  "110",
  "125",
  "150",
  "175",
  "200",
  "250",
  "300",
  "400",
  "500",
];
