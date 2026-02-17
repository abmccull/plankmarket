import Papa from "papaparse";
import { csvListingRowSchema } from "@/lib/validators/listing";
import type { z } from "zod";

export type ParsedListingRow = z.infer<typeof csvListingRowSchema>;

export interface CsvRowError {
  row: number;
  field: string;
  message: string;
}

export interface CsvParseResult {
  validRows: ParsedListingRow[];
  errors: CsvRowError[];
  totalRows: number;
}

const MAX_ROWS = 100;

export function parseListingsCsv(file: File): Promise<CsvParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rawRows = results.data as Record<string, string>[];

        if (rawRows.length > MAX_ROWS) {
          reject(new Error(`CSV exceeds maximum of ${MAX_ROWS} rows. Found ${rawRows.length} rows.`));
          return;
        }

        const validRows: ParsedListingRow[] = [];
        const errors: CsvRowError[] = [];

        rawRows.forEach((raw, index) => {
          const result = csvListingRowSchema.safeParse(raw);
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
          totalRows: rawRows.length,
        });
      },
      error: (error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      },
    });
  });
}
