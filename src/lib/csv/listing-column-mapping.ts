import Papa from "papaparse";
import { CSV_COLUMNS, type CsvColumnMeta } from "@/lib/constants/csv-columns";
import { CSV_LISTING_FIELDS, csvListingRowSchema } from "@/lib/validators/listing";
import type { CsvParseResult } from "./parse-listings";

export interface ListingSpreadsheet {
  fileName: string;
  headers: string[];
  records: { cells: string[]; rowNumber: number }[];
}
export type ListingColumnMapping = Record<string, number>;
export const SPREADSHEET_FIELDS: CsvColumnMeta[] = CSV_LISTING_FIELDS.map((key) =>
  CSV_COLUMNS.find((field) => field.key === key) ?? {
    key,
    label: key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()),
    required: false,
    description: "Optional selling or freight rule. Use the supported CSV value; review before creating drafts.",
  },
);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_RECORDS = 1000;
const MAX_COLUMNS = 80;
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
// These aliases name a specific field/unit. Ambiguous "price" or "quantity"
// headers intentionally require the seller to choose a field.
const ALIASES: Record<string, string[]> = {
  title: ["Product name", "Listing name"],
  totalSqFt: ["Available Sq Ft", "Available square feet"],
  askPricePerSqFt: ["USD per Sq Ft", "Asking price per square foot"],
  modelNumber: ["SKU", "Product SKU"],
  locationZip: ["Warehouse ZIP", "ZIP"],
};

export async function readListingSpreadsheet(file: File): Promise<ListingSpreadsheet> {
  if (!/\.csv$/i.test(file.name)) throw new Error("Choose a CSV file. Export Excel files as CSV UTF-8 first.");
  if (file.size > MAX_FILE_BYTES) throw new Error("This CSV is larger than 5 MB. Split it into files with up to 100 inventory rows.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    if (text.includes("\0")) throw new Error("Unsupported binary or UTF-16 text");
  } catch {
    throw new Error("This file is not readable UTF-8 CSV. Export it as CSV UTF-8 and try again.");
  }
  if (!text.trim()) throw new Error("This CSV is empty. Include column headers and inventory rows.");
  let headers: string[] | null = null;
  const records: ListingSpreadsheet["records"] = [];
  let failure: Error | null = null;
  let recordNumber = 0;
  Papa.parse<string[]>(text, {
    skipEmptyLines: false,
    step: (result, parser) => {
      recordNumber++;
      const cells = result.data;
      const formattingErrors = result.errors.filter((error) => error.code !== "UndetectableDelimiter");
      if (formattingErrors.length) {
        failure = new Error(`CSV formatting error near row ${recordNumber}: ${formattingErrors.map((error) => error.message).join("; ")}`);
      } else if (!headers) {
        headers = cells.map((value) => value.trim().replace(/^\uFEFF/, ""));
        if (headers.length > MAX_COLUMNS || headers.some((header) => !header || header.length > 200)) {
          failure = new Error("Use up to 80 columns, each with a nonempty header of 200 characters or fewer.");
        } else if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) {
          failure = new Error("Two columns have the same header. Give each column a unique name before uploading.");
        }
      } else if (recordNumber > MAX_RECORDS + 1) {
        failure = new Error("This CSV has too many records, including blank or instruction rows. Keep each file to 100 inventory rows and at most 1,000 records.");
      } else if (!cells.every((cell) => cell.trim() === "")) {
        if (cells.length !== headers.length) {
          failure = new Error(`CSV row ${recordNumber} has ${cells.length} values for ${headers.length} columns. Check commas and quoted cells.`);
        } else {
          records.push({ cells, rowNumber: recordNumber });
        }
      }
      if (failure) parser.abort();
    },
  });
  if (failure) throw failure;
  if (!headers || !records.length) throw new Error("This CSV has no inventory rows. Add inventory below the headers.");
  return { fileName: file.name, headers, records };
}

export function suggestListingColumns(headers: string[]): ListingColumnMapping {
  const mapping: ListingColumnMapping = {};
  for (const field of SPREADSHEET_FIELDS) {
    const names = [field.key, field.label, ...(ALIASES[field.key] ?? [])].map(normalize);
    const candidates = headers.flatMap((header, index) => names.includes(normalize(header)) ? [index] : []);
    if (candidates.length === 1) mapping[field.key] = candidates[0];
  }
  // Never let a source header silently populate two different business fields.
  const indices = Object.values(mapping);
  return Object.fromEntries(Object.entries(mapping).filter(([, index]) => indices.filter((value) => value === index).length === 1));
}

export function listingMappingProblems(headers: string[], mapping: ListingColumnMapping): string[] {
  const problems: string[] = [];
  for (const field of SPREADSHEET_FIELDS) {
    const index = mapping[field.key];
    if (index === undefined) {
      if (field.required) problems.push(`Choose a column for ${field.label}.`);
    } else if (!Number.isInteger(index) || index < 0 || index >= headers.length) {
      problems.push(`Choose an available column for ${field.label}.`);
    }
  }
  if (Object.keys(mapping).some((key) => !CSV_LISTING_FIELDS.includes(key))) problems.push("This mapping contains an unsupported field. Review the columns again.");
  const used = Object.values(mapping);
  for (const index of new Set(used)) {
    if (used.filter((value) => value === index).length > 1) problems.push(`Use “${headers[index] ?? "this column"}” for only one marketplace field.`);
  }
  return problems;
}

export function validateMappedListings(sheet: ListingSpreadsheet, mapping: ListingColumnMapping): CsvParseResult {
  const problems = listingMappingProblems(sheet.headers, mapping);
  if (problems.length) throw new Error(problems.join(" "));
  const entries = Object.entries(mapping).sort(([left], [right]) => CSV_LISTING_FIELDS.indexOf(left) - CSV_LISTING_FIELDS.indexOf(right));
  const used = new Set(entries.map(([, index]) => index));
  const ignored = sheet.headers.filter((_, index) => !used.has(index));
  const result: CsvParseResult = {
    validRows: [], validRowNumbers: [], errors: [], totalRows: 0,
    warnings: ignored.length ? [`Excluded columns: ${ignored.join(", ")}. Their values will not be imported.`] : [],
  };
  for (const record of sheet.records) {
    const title = record.cells[mapping.title];
    if (title.startsWith("⬇") || title.startsWith("INSTRUCTIONS")) continue;
    result.totalRows++;
    if (result.totalRows > 100) throw new Error("CSV exceeds maximum of 100 inventory rows. Split the file and try again.");
    const parsed = csvListingRowSchema.safeParse(Object.fromEntries(entries.map(([key, index]) => [key, record.cells[index]])));
    if (parsed.success) {
      result.validRows.push(parsed.data);
      result.validRowNumbers.push(record.rowNumber);
    } else {
      result.errors.push(...parsed.error.issues.map((issue) => ({
        row: record.rowNumber, field: issue.path.join("."),
        message: issue.code === "invalid_type" && issue.expected === "number" ? "Enter a valid number." : issue.message,
      })));
    }
  }
  if (!result.totalRows) throw new Error("This CSV has no inventory rows after excluding instructions.");
  return result;
}

interface SavedProfile { headers: string[]; mapping: ListingColumnMapping }
interface SavedMappings { version: 1; sellerId: string; profiles: SavedProfile[] }
const storageKey = (sellerId: string) => `plankmarket-csv-mappings:${sellerId}`;
function readProfiles(sellerId: string): SavedMappings {
  const raw = localStorage.getItem(storageKey(sellerId));
  if (!raw) return { version: 1, sellerId, profiles: [] };
  if (raw.length > 100_000) throw new Error("Unsupported saved mapping");
  const saved = JSON.parse(raw) as SavedMappings;
  if (saved?.version !== 1 || saved.sellerId !== sellerId || !Array.isArray(saved.profiles) || saved.profiles.length > 5) throw new Error("Unsupported saved mapping");
  for (const profile of saved.profiles) {
    if (!profile || !Array.isArray(profile.headers) || !profile.headers.length || profile.headers.length > MAX_COLUMNS || profile.headers.some((header) => typeof header !== "string" || !header || header.length > 200) || !profile.mapping || typeof profile.mapping !== "object" || Array.isArray(profile.mapping) || listingMappingProblems(profile.headers, profile.mapping).length) throw new Error("Unsupported saved mapping");
  }
  return saved;
}
export function restoreListingMapping(sellerId: string, headers: string[]): { mapping: ListingColumnMapping; reused: boolean; warning: string | null } {
  const suggested = suggestListingColumns(headers);
  try {
    const profile = readProfiles(sellerId).profiles.find((entry) => JSON.stringify(entry.headers) === JSON.stringify(headers));
    return { mapping: profile ? { ...profile.mapping } : suggested, reused: !!profile, warning: null };
  } catch {
    return { mapping: suggested, reused: false, warning: "Saved columns could not be restored. Review the suggestions below." };
  }
}
export function saveListingMapping(sellerId: string, headers: string[], mapping: ListingColumnMapping): string | null {
  if (listingMappingProblems(headers, mapping).length) return "Review all required columns before saving this mapping.";
  try {
    // A corrupt old profile should not prevent an explicitly reviewed replacement.
    let saved: SavedMappings;
    try { saved = readProfiles(sellerId); } catch { saved = { version: 1, sellerId, profiles: [] }; }
    const profiles = [{ headers, mapping }, ...saved.profiles.filter((entry) => JSON.stringify(entry.headers) !== JSON.stringify(headers))].slice(0, 5);
    localStorage.setItem(storageKey(sellerId), JSON.stringify({ version: 1, sellerId, profiles }));
    return null;
  } catch {
    return "These columns could not be saved in this browser. Review them again when importing your next file.";
  }
}
