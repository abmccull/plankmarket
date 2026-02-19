export interface CsvColumnMeta {
  key: string;
  label: string;
  required: boolean;
  description: string;
  validValues?: string[];
}

export const CSV_COLUMNS: CsvColumnMeta[] = [
  // Required fields
  { key: "title", label: "Title", required: true, description: "Listing title (min 1 character)" },
  { key: "materialType", label: "Material Type", required: true, description: "Type of flooring material", validValues: ["hardwood", "engineered", "laminate", "vinyl_lvp", "bamboo", "tile", "other"] },
  { key: "totalSqFt", label: "Total Sq Ft", required: true, description: "Total square footage available" },
  { key: "askPricePerSqFt", label: "Price Per Sq Ft", required: true, description: "Asking price per square foot in USD" },
  { key: "condition", label: "Condition", required: true, description: "Product condition", validValues: ["new_overstock", "discontinued", "slight_damage", "returns", "seconds", "remnants", "closeout", "other"] },
  { key: "locationZip", label: "ZIP Code", required: true, description: "Warehouse ZIP code (shipping origin)" },
  { key: "totalPallets", label: "Total Pallets", required: true, description: "Total number of pallets" },
  { key: "palletWeight", label: "Pallet Weight", required: true, description: "Weight per pallet in lbs" },
  { key: "palletLength", label: "Pallet Length", required: true, description: "Pallet length in inches (hint: 48)" },
  { key: "palletWidth", label: "Pallet Width", required: true, description: "Pallet width in inches (hint: 40)" },
  { key: "palletHeight", label: "Pallet Height", required: true, description: "Pallet height in inches" },
  { key: "moq", label: "MOQ", required: true, description: "Minimum order quantity (number)" },
  { key: "moqUnit", label: "MOQ Unit", required: true, description: "Unit for minimum order quantity", validValues: ["pallets", "sqft"] },
  // Optional fields
  { key: "species", label: "Species", required: false, description: "Wood species (e.g., Oak, Maple)" },
  { key: "finish", label: "Finish", required: false, description: "Surface finish type", validValues: ["matte", "semi_gloss", "gloss", "wire_brushed", "hand_scraped", "distressed", "smooth", "textured", "oiled", "unfinished", "other"] },
  { key: "grade", label: "Grade", required: false, description: "Product grade", validValues: ["select", "1_common", "2_common", "3_common", "cabin", "character", "rustic", "premium", "standard", "economy", "other"] },
  { key: "color", label: "Color", required: false, description: "Color name" },
  { key: "thickness", label: "Thickness", required: false, description: "Thickness in inches" },
  { key: "width", label: "Width", required: false, description: "Width in inches" },
  { key: "length", label: "Length", required: false, description: "Length in inches" },
  { key: "sqFtPerBox", label: "Sq Ft Per Box", required: false, description: "Square footage per box" },
  { key: "boxesPerPallet", label: "Boxes Per Pallet", required: false, description: "Number of boxes per pallet" },
  { key: "locationCity", label: "City", required: false, description: "Warehouse city (auto-derived from ZIP if blank)" },
  { key: "locationState", label: "State", required: false, description: "Warehouse state (auto-derived from ZIP if blank)" },
  { key: "buyNowPrice", label: "Buy Now Price", required: false, description: "Buy now price per sq ft in USD" },
  { key: "description", label: "Description", required: false, description: "Product description" },
];
