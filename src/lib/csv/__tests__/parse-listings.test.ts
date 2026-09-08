import { describe, expect, it } from "vitest";
import { csvListingRowSchema } from "@/lib/validators/listing";
import { parseListingsCsv } from "../parse-listings";
const row = { title: "Oak lot", materialType: "hardwood", totalSqFt: "1000", askPricePerSqFt: "2", condition: "new_overstock", locationZip: "80202", totalPallets: "1", palletWeight: "1000", palletLength: "48", palletWidth: "40", palletHeight: "40", moq: "100", moqUnit: "sqft" };
describe("CSV input preservation", () => {
  it("normalizes optional empty enum and number cells without inventing zero", () => {
    const parsed = csvListingRowSchema.parse({ ...row, finish: "", grade: "", thickness: "", buyNowPrice: "" });
    expect(parsed.finish).toBeUndefined(); expect(parsed.thickness).toBeUndefined(); expect(parsed.buyNowPrice).toBeUndefined();
  });
  it("preserves buyer search and specification fields", () => {
    const parsed = csvListingRowSchema.parse({ ...row, brand: "Acme", modelNumber: "SKU123", wearLayer: "20", colorFamily: "gray" });
    expect(parsed).toMatchObject({ brand: "Acme", modelNumber: "SKU123", wearLayer: 20, colorFamily: "gray" });
  });
  it("warns about unknown columns while preserving otherwise valid rows", async () => {
    const data = { ...row, manufacturerTypo: "Acme" };
    const file = new File([Object.keys(data).join(",") + "\n" + Object.values(data).join(",")], "stock.csv", { type: "text/csv" });
    const parsed = await parseListingsCsv(file);
    expect(parsed.errors).toEqual([]);
    expect(parsed.validRows).toHaveLength(1);
    expect(parsed.validRows[0]).toMatchObject({ title: "Oak lot", materialType: "hardwood" });
    expect(parsed.validRows[0]).not.toHaveProperty("manufacturerTypo");
    expect(parsed.warnings[0]).toContain("manufacturerTypo");
  });
  it("rejects missing required headers", async () => {
    const { title, ...missingTitle } = row;
    expect(title).toBeTruthy();
    const file = new File([Object.keys(missingTitle).join(",") + "\n" + Object.values(missingTitle).join(",")], "stock.csv", { type: "text/csv" });
    await expect(parseListingsCsv(file)).rejects.toThrow("Missing required CSV columns: title");
  });
  it("keeps invalid required values out of the valid import set", async () => {
    const data = { ...row, askPricePerSqFt: "not-a-price" };
    const file = new File([Object.keys(data).join(",") + "\n" + Object.values(data).join(",")], "stock.csv", { type: "text/csv" });
    const parsed = await parseListingsCsv(file);
    expect(parsed.validRows).toHaveLength(0);
    expect(parsed.errors.some((error) => error.field === "askPricePerSqFt")).toBe(true);
  });
  it("rejects malformed CSV even when it includes extra columns", async () => {
    const file = new File([Object.keys(row).join(",") + ',extra\n"unterminated'], "stock.csv", { type: "text/csv" });
    await expect(parseListingsCsv(file)).rejects.toThrow("CSV formatting error");
  });
  it("does not strip an unknown API field silently", () => {
    expect(csvListingRowSchema.safeParse({ ...row, manufacturerTypo: "Acme" }).success).toBe(false);
  });
});
