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
  validRowNumbers: number[];
  errors: CsvRowError[];
  warnings: string[];
  totalRows: number;
}

const MAX_ROWS = 100;

export function parseListingsCsv(file: File): Promise<CsvParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: false,
      transformHeader: (header) => header.trim().replace(/^\uFEFF/, ""),
      complete: (results) => {
        const unknown = (results.meta.fields ?? []).filter((field) => !CSV_LISTING_FIELDS.includes(field));
        const warnings = unknown.length ? [`Ignored unrecognized columns: ${unknown.join(", ")}. Their values will not be imported; rename them to supported columns if you need this data.`] : [];
        const missing = CSV_COLUMNS.filter((column) => column.required && !(results.meta.fields ?? []).includes(column.key)).map((column) => column.key);
        if (missing.length) { reject(new Error(`Missing required CSV columns: ${missing.join(", ")}.`)); return; }
        // Keep original spreadsheet record positions before excluding empty or helper rows.
        const parsedRows = results.data as Record<string, string>[];
        const emptyRows = new Set(parsedRows.flatMap((row, index) =>
          Object.values(row).every((value) => typeof value === "string" && value.trim() === "") ? [index] : []
        ));
        const formattingErrors = results.errors.filter((error) =>
          !(error.type === "FieldMismatch" && error.row !== undefined && emptyRows.has(error.row))
        );
        if (formattingErrors.length) { reject(new Error(`CSV formatting error: ${formattingErrors.map((error) => error.message).join("; ")}`)); return; }
        // Filter out instruction/helper rows (start with ⬇ or "INSTRUCTIONS")
        const rawRows = parsedRows.map((data, index) => ({ data, rowNumber: index + 2 })).filter(
          ({ data, rowNumber }) => !emptyRows.has(rowNumber - 2) && !data.title?.startsWith("⬇") && !data.title?.startsWith("INSTRUCTIONS")
        );

        if (rawRows.length > MAX_ROWS) {
          reject(new Error(`CSV exceeds maximum of ${MAX_ROWS} rows. Found ${rawRows.length} rows.`));
          return;
        }

        const validRows: ParsedListingRow[] = [];
        const validRowNumbers: number[] = [];
        const errors: CsvRowError[] = [];

        rawRows.forEach(({ data: raw, rowNumber }) => {
          // Unknown fields are intentionally ignored only after returning a visible warning.
          const known = Object.fromEntries(Object.entries(raw).filter(([key]) => CSV_LISTING_FIELDS.includes(key)));
          const result = csvListingRowSchema.safeParse(known);
          if (result.success) {
            validRows.push(result.data);
            validRowNumbers.push(rowNumber);
          } else {
            result.error.issues.forEach((issue) => {
              errors.push({
                row: rowNumber,
                field: issue.path.join("."),
                message: issue.code === "invalid_type" && issue.expected === "number"
                  ? "Enter a valid number."
                  : issue.message,
              });
            });
          }
        });

        resolve({
          validRows,
          validRowNumbers,
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
