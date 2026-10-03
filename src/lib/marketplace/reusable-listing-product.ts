import { listingProductReuseSchema, type ListingFormInput } from "@/lib/validators/listing";
import { getWearLayerOptionsForSingle, THICKNESS_OPTIONS, WIDTH_OPTIONS } from "@/lib/constants/flooring";

export type ReusableProductKey = keyof typeof listingProductReuseSchema.shape;
export type ReusableProduct = Partial<Pick<ListingFormInput, ReusableProductKey>>;
export const REUSABLE_PRODUCT_KEYS = Object.keys(listingProductReuseSchema.shape) as ReusableProductKey[];
export const REUSABLE_PRODUCT_LABELS: Record<ReusableProductKey, string> = {
  materialType: "Material", species: "Species", finish: "Finish", grade: "Grade", color: "Color", colorFamily: "Color family",
  thickness: "Thickness", width: "Width", length: "Length", wearLayer: "Wear layer", brand: "Brand", modelNumber: "Model",
  sqFtPerBox: "Sq ft per box", installationMethod: "Installation", waterResistance: "Water performance", certifications: "Certifications",
};
const matchPreset = (value: number, options: readonly { value: number }[]) =>
  options.find(option => Math.abs(option.value - value) <= Math.max(1, option.value) * 1e-6)?.value;

/** Project each field independently so legacy data cannot prevent private preparation. */
export function getReusableProductDetails(source: Record<string, unknown>): { product: ReusableProduct; omittedFields: ReusableProductKey[] } {
  const product: Record<string, unknown> = {};
  const omittedFields: ReusableProductKey[] = [];
  for (const key of REUSABLE_PRODUCT_KEYS) {
    const value = source[key];
    if (value == null || value === "") {
      if (key === "certifications") product[key] = [];
      continue;
    }
    const parsed = listingProductReuseSchema.shape[key].safeParse(value);
    if (!parsed.success || (typeof parsed.data === "number" && !Number.isFinite(parsed.data))) {
      omittedFields.push(key);
      continue;
    }
    product[key] = Array.isArray(parsed.data) ? [...parsed.data] : parsed.data;
  }
  for (const [key, options] of [["thickness", THICKNESS_OPTIONS], ["width", WIDTH_OPTIONS]] as const) {
    if (typeof product[key] === "number") product[key] = matchPreset(product[key], options) ?? product[key];
  }
  if (typeof product.wearLayer === "number") {
    const preset = matchPreset(product.wearLayer, getWearLayerOptionsForSingle(product.materialType as string | undefined));
    if (preset === undefined) {
      delete product.wearLayer;
      omittedFields.push("wearLayer");
    } else product.wearLayer = preset;
  }
  return { product: product as ReusableProduct, omittedFields };
}

/** Replace the entire product group, preserving the latest lot-specific edits. */
export function replaceProductDetails(current: Record<string, unknown>, source: Record<string, unknown>): Partial<ListingFormInput> {
  const next = { ...current };
  for (const key of REUSABLE_PRODUCT_KEYS) next[key] = undefined;
  return { ...next, ...getReusableProductDetails(source).product } as Partial<ListingFormInput>;
}
