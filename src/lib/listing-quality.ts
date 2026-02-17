import type { Listing } from "@/server/db/schema/listings";

export interface QualityResult {
  score: number;
  shipReady: boolean;
  missingFields: string[];
  missingByCategory: {
    product: string[];
    lot: string[];
    shipping: string[];
    photos: string[];
    pricing: string[];
  };
  requiredMissing: string[];
  suggestedMissing: string[];
}

type ListingInput = Partial<Listing> & {
  photoCount?: number;
};

const MATERIAL_LABELS: Record<string, string> = {
  hardwood: "Hardwood",
  engineered: "Engineered Hardwood",
  laminate: "Laminate",
  vinyl_lvp: "Vinyl LVP",
  bamboo: "Bamboo",
  tile: "Tile",
  other: "Other",
};

const CONDITION_LABELS: Record<string, string> = {
  new_overstock: "New Overstock",
  discontinued: "Discontinued",
  slight_damage: "Slight Damage",
  returns: "Returns",
  seconds: "Seconds",
  remnants: "Remnants",
  closeout: "Closeout",
  other: "Other",
};

const FINISH_LABELS: Record<string, string> = {
  matte: "Matte",
  semi_gloss: "Semi-Gloss",
  gloss: "Gloss",
  wire_brushed: "Wire-Brushed",
  hand_scraped: "Hand-Scraped",
  distressed: "Distressed",
  smooth: "Smooth",
  textured: "Textured",
  oiled: "Oiled",
  unfinished: "Unfinished",
  other: "Other",
};

export function computeListingQuality(
  listing: ListingInput
): QualityResult {
  let score = 0;
  const requiredMissing: string[] = [];
  const suggestedMissing: string[] = [];
  const missingByCategory = {
    product: [] as string[],
    lot: [] as string[],
    shipping: [] as string[],
    photos: [] as string[],
    pricing: [] as string[],
  };

  const photoCount = listing.photoCount ?? 0;
  const materialType = listing.materialType;

  // === REQUIRED BASELINE (all material types) ===

  if (listing.locationZip) {
    score += 5;
  } else {
    requiredMissing.push("Location ZIP");
    missingByCategory.shipping.push("Location ZIP");
  }

  if (listing.locationState) {
    score += 3;
  } else {
    requiredMissing.push("Location State");
    missingByCategory.shipping.push("Location State");
  }

  if (listing.brand) {
    score += 5;
  } else {
    requiredMissing.push("Brand");
    missingByCategory.product.push("Brand");
  }

  if (listing.color || listing.colorFamily) {
    score += 3;
  } else {
    requiredMissing.push("Color");
    missingByCategory.product.push("Color");
  }

  if (photoCount >= 3) {
    score += 10;
  } else {
    requiredMissing.push(`At least 3 photos (have ${photoCount})`);
    missingByCategory.photos.push("Minimum 3 photos");
  }

  // === MATERIAL-TYPE-SPECIFIC REQUIRED FIELDS ===

  if (materialType === "vinyl_lvp") {
    if (listing.wearLayer) score += 5;
    else {
      requiredMissing.push("Wear Layer (mil)");
      missingByCategory.product.push("Wear Layer");
    }
    if (listing.thickness) score += 5;
    else {
      requiredMissing.push("Thickness");
      missingByCategory.product.push("Thickness");
    }
    if (listing.width) score += 3;
    else {
      requiredMissing.push("Width");
      missingByCategory.product.push("Width");
    }
  }

  if (materialType === "engineered") {
    if (listing.species) score += 5;
    else {
      requiredMissing.push("Species");
      missingByCategory.product.push("Species");
    }
    if (listing.thickness) score += 5;
    else {
      requiredMissing.push("Thickness");
      missingByCategory.product.push("Thickness");
    }
    if (listing.wearLayer) score += 5;
    else {
      requiredMissing.push("Wear Layer");
      missingByCategory.product.push("Wear Layer");
    }
    if (listing.width) score += 3;
    else {
      requiredMissing.push("Width");
      missingByCategory.product.push("Width");
    }
  }

  if (materialType === "hardwood") {
    if (listing.species) score += 5;
    else {
      requiredMissing.push("Species");
      missingByCategory.product.push("Species");
    }
    if (listing.thickness) score += 5;
    else {
      requiredMissing.push("Thickness");
      missingByCategory.product.push("Thickness");
    }
    if (listing.width) score += 3;
    else {
      requiredMissing.push("Width");
      missingByCategory.product.push("Width");
    }
    if (listing.grade) score += 3;
    else {
      requiredMissing.push("Grade");
      missingByCategory.product.push("Grade");
    }
  }

  if (materialType === "laminate") {
    if (listing.thickness) score += 5;
    else {
      requiredMissing.push("Thickness");
      missingByCategory.product.push("Thickness");
    }
    if (listing.wearLayer) score += 3;
    else {
      requiredMissing.push("Wear Layer");
      missingByCategory.product.push("Wear Layer");
    }
  }

  if (materialType === "tile") {
    if (listing.width && listing.length) score += 5;
    else {
      requiredMissing.push("Tile Size (Width × Length)");
      missingByCategory.product.push("Tile Size");
    }
    if (listing.finish) score += 3;
    else {
      requiredMissing.push("Finish");
      missingByCategory.product.push("Finish");
    }
  }

  if (materialType === "bamboo") {
    if (listing.thickness) score += 5;
    else {
      requiredMissing.push("Thickness");
      missingByCategory.product.push("Thickness");
    }
    if (listing.width) score += 3;
    else {
      requiredMissing.push("Width");
      missingByCategory.product.push("Width");
    }
  }

  // === SUGGESTED FIELDS (improve score, don't block) ===

  if (listing.finish && materialType !== "tile") {
    score += 5;
  } else if (materialType !== "tile") {
    suggestedMissing.push("Finish Type");
    missingByCategory.product.push("Finish Type (suggested)");
  }

  if (listing.grade && materialType !== "hardwood") {
    score += 3;
  }

  if (listing.description && listing.description.length >= 50) {
    score += 5;
  } else {
    suggestedMissing.push("Description (50+ characters)");
  }

  if (listing.modelNumber) {
    score += 3;
  } else {
    suggestedMissing.push("Model Number");
    missingByCategory.product.push("Model Number (suggested)");
  }

  if (listing.sqFtPerBox) {
    score += 3;
  } else {
    suggestedMissing.push("Sq Ft Per Box");
    missingByCategory.lot.push("Sq Ft Per Box (suggested)");
  }

  if (listing.boxesPerPallet) {
    score += 3;
  } else {
    suggestedMissing.push("Boxes Per Pallet");
    missingByCategory.lot.push("Boxes Per Pallet (suggested)");
  }

  if (listing.totalPallets) {
    score += 3;
  } else {
    suggestedMissing.push("Total Pallets");
    missingByCategory.lot.push("Total Pallets (suggested)");
  }

  const certs = listing.certifications as string[] | null;
  if (certs && certs.length > 0) {
    score += 3;
  } else {
    suggestedMissing.push("Certifications");
  }

  if (listing.reasonCode) {
    score += 2;
  } else {
    suggestedMissing.push("Reason Code");
  }

  // Photo bonuses
  if (photoCount >= 5) score += 5;
  if (photoCount >= 8) score += 5;

  // === SHIP-READY CHECK ===
  const shipReady =
    !!listing.palletWeight &&
    listing.palletWeight > 0 &&
    !!listing.palletLength &&
    listing.palletLength > 0 &&
    !!listing.palletWidth &&
    listing.palletWidth > 0 &&
    !!listing.palletHeight &&
    listing.palletHeight > 0 &&
    !!listing.locationZip &&
    (!!listing.totalPallets || !!listing.totalSqFt);

  if (!shipReady) {
    if (!listing.palletWeight) {
      suggestedMissing.push("Pallet Weight");
      missingByCategory.shipping.push("Pallet Weight");
    }
    if (!listing.palletLength || !listing.palletWidth || !listing.palletHeight) {
      suggestedMissing.push("Pallet Dimensions (L×W×H)");
      missingByCategory.shipping.push("Pallet Dimensions");
    }
  }

  // Cap at 100
  score = Math.min(100, score);

  return {
    score,
    shipReady,
    missingFields: [...requiredMissing, ...suggestedMissing],
    missingByCategory,
    requiredMissing,
    suggestedMissing,
  };
}

export function generateListingTitle(listing: ListingInput): string {
  const parts: string[] = [];

  if (listing.brand) parts.push(listing.brand);
  if (listing.species) parts.push(listing.species);
  if (listing.finish && FINISH_LABELS[listing.finish]) {
    parts.push(FINISH_LABELS[listing.finish]);
  }

  const materialLabel = listing.materialType
    ? MATERIAL_LABELS[listing.materialType] || listing.materialType
    : "";
  if (materialLabel) parts.push(materialLabel);

  const sqFt = listing.totalSqFt
    ? listing.totalSqFt.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : "0";
  parts.push(`- ${sqFt} sq ft`);

  const conditionLabel = listing.condition
    ? CONDITION_LABELS[listing.condition] || listing.condition
    : "";
  if (conditionLabel) parts.push(conditionLabel);

  let title = parts.join(" ");
  if (title.length > 255) {
    title = title.slice(0, 252) + "...";
  }

  return title;
}
