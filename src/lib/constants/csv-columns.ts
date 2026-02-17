export interface CsvColumnMeta {
  key: string;
  label: string;
  required: boolean;
  description: string;
  validValues?: string[];
}

export const CSV_COLUMNS: CsvColumnMeta[] = [
  { key: "title", label: "Title", required: true, description: "Listing title (min 1 character)" },
  { key: "materialType", label: "Material Type", required: true, description: "Type of flooring material", validValues: ["hardwood", "engineered", "laminate", "vinyl_lvp", "bamboo", "tile", "other"] },
  { key: "totalSqFt", label: "Total Sq Ft", required: true, description: "Total square footage available" },
  { key: "askPricePerSqFt", label: "Price Per Sq Ft", required: true, description: "Asking price per square foot in USD" },
  { key: "condition", label: "Condition", required: true, description: "Product condition", validValues: ["new_overstock", "discontinued", "slight_damage", "returns", "seconds", "remnants", "closeout", "other"] },
  { key: "species", label: "Species", required: false, description: "Wood species (e.g., Oak, Maple)" },
  { key: "finish", label: "Finish", required: false, description: "Surface finish type", validValues: ["matte", "semi_gloss", "gloss", "wire_brushed", "hand_scraped", "distressed", "smooth", "textured", "oiled", "unfinished", "other"] },
  { key: "grade", label: "Grade", required: false, description: "Product grade", validValues: ["select", "1_common", "2_common", "3_common", "cabin", "character", "rustic", "premium", "standard", "economy", "other"] },
  { key: "color", label: "Color", required: false, description: "Color name" },
  { key: "thickness", label: "Thickness", required: false, description: "Thickness in inches" },
  { key: "width", label: "Width", required: false, description: "Width in inches" },
  { key: "length", label: "Length", required: false, description: "Length in inches" },
  { key: "sqFtPerBox", label: "Sq Ft Per Box", required: false, description: "Square footage per box" },
  { key: "boxesPerPallet", label: "Boxes Per Pallet", required: false, description: "Number of boxes per pallet" },
  { key: "totalPallets", label: "Total Pallets", required: false, description: "Total number of pallets" },
  { key: "moq", label: "MOQ", required: false, description: "Minimum order quantity in sq ft" },
  { key: "locationCity", label: "City", required: false, description: "Warehouse city" },
  { key: "locationState", label: "State", required: false, description: "Warehouse state (2-letter code)" },
  { key: "locationZip", label: "ZIP Code", required: false, description: "Warehouse ZIP code" },
  { key: "buyNowPrice", label: "Buy Now Price", required: false, description: "Buy now price per sq ft in USD" },
  { key: "description", label: "Description", required: false, description: "Product description" },
  { key: "palletWeight", label: "Pallet Weight", required: false, description: "Weight per pallet in lbs" },
  { key: "palletLength", label: "Pallet Length", required: false, description: "Pallet length in inches" },
  { key: "palletWidth", label: "Pallet Width", required: false, description: "Pallet width in inches" },
  { key: "palletHeight", label: "Pallet Height", required: false, description: "Pallet height in inches" },
];
