import Papa from "papaparse";
import { csvListingRowSchema, CSV_LISTING_FIELDS } from "@/lib/validators/listing";
import type { z } from "zod";
import { CSV_COLUMNS } from "@/lib/constants/csv-columns";

export type ParsedListingRow = z.infer<typeof csvListingRowSchema>;

export interface CsvRowError {
  row: number;
  field: string;
  message: string;
}

export interface CsvParseResult {
  validRows: ParsedListingRow[];
  errors: CsvRowError[];
  warnings: string[];
  totalRows: number;
}

const MAX_ROWS = 100;

export function parseListingsCsv(file: File): Promise<CsvParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().replace(/^\uFEFF/, ""),
      complete: (results) => {
        const unknown = (results.meta.fields ?? []).filter((field) => !CSV_LISTING_FIELDS.includes(field));
        const warnings = unknown.length ? [`Ignored unrecognized columns: ${unknown.join(", ")}. Their values will not be imported; rename them to supported columns if you need this data.`] : [];
        const missing = CSV_COLUMNS.filter((column) => column.required && !(results.meta.fields ?? []).includes(column.key)).map((column) => column.key);
        if (missing.length) { reject(new Error(`Missing required CSV columns: ${missing.join(", ")}.`)); return; }
        if (results.errors.length) { reject(new Error(`CSV formatting error: ${results.errors.map((error) => error.message).join("; ")}`)); return; }
        // Filter out instruction/helper rows (start with ⬇ or "INSTRUCTIONS")
        const rawRows = (results.data as Record<string, string>[]).filter(
          (row) => !row.title?.startsWith("⬇") && !row.title?.startsWith("INSTRUCTIONS")
        );

        if (rawRows.length > MAX_ROWS) {
          reject(new Error(`CSV exceeds maximum of ${MAX_ROWS} rows. Found ${rawRows.length} rows.`));
          return;
        }

        const validRows: ParsedListingRow[] = [];
        const errors: CsvRowError[] = [];

        rawRows.forEach((raw, index) => {
          // Unknown fields are intentionally ignored only after returning a visible warning.
          const known = Object.fromEntries(Object.entries(raw).filter(([key]) => CSV_LISTING_FIELDS.includes(key)));
          const result = csvListingRowSchema.safeParse(known);
          if (result.success) {
            validRows.push(result.data);
          } else {
            result.error.issues.forEach((issue) => {
              errors.push({
                row: index + 1,
                field: issue.path.join("."),
                message: issue.message,
              });
            });
          }
        });

        resolve({
          validRows,
          errors,
          warnings,
          totalRows: rawRows.length,
        });
      },
      error: (error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      },
    });
  });
}
