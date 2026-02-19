"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { trpc } from "@/lib/trpc/client";
import { parseListingsCsv, type ParsedListingRow, type CsvRowError } from "@/lib/csv/parse-listings";
import { CSV_COLUMNS } from "@/lib/constants/csv-columns";
import { useBulkUploadStore } from "@/lib/stores/bulk-upload-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency, getErrorMessage } from "@/lib/utils";
import {
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

type PageState = "upload" | "preview" | "submitting";

export default function BulkUploadPage() {
  const router = useRouter();
  const setBatch = useBulkUploadStore((s) => s.setBatch);

  const [state, setState] = useState<PageState>("upload");
  const [validRows, setValidRows] = useState<ParsedListingRow[]>([]);
  const [errors, setErrors] = useState<CsvRowError[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  const bulkCreateMutation = trpc.listing.bulkCreate.useMutation({
    onSuccess: (data) => {
      setBatch(
        data.batchId,
        data.listings.map((l) => ({
          ...l,
          hasPhotos: false,
          mediaCount: 0,
        }))
      );
      toast.success(`${data.count} draft listing${data.count !== 1 ? "s" : ""} created`);
      router.push("/seller/listings/bulk-upload/photos");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to create listings"));
      setState("preview");
    },
  });

  const handleFile = useCallback(async (file: File) => {
    try {
      const result = await parseListingsCsv(file);
      setValidRows(result.validRows);
      setErrors(result.errors);
      setTotalRows(result.totalRows);

      if (result.totalRows === 0) {
        toast.error("CSV file is empty");
        return;
      }

      setState("preview");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to parse CSV"));
    }
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        handleFile(acceptedFiles[0]);
      }
    },
    [handleFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    maxFiles: 1,
    disabled: state === "submitting",
  });

  const errorsByRow = errors.reduce<Record<number, CsvRowError[]>>((acc, err) => {
    if (!acc[err.row]) acc[err.row] = [];
    acc[err.row].push(err);
    return acc;
  }, {});

  const handleRemoveInvalid = () => {
    const invalidRowNumbers = new Set(errors.map((e) => e.row));
    // validRows are already only the valid ones from parsing
    // errors reference original row numbers — just clear errors
    setErrors([]);
    setTotalRows(validRows.length);
    toast.success(`Removed ${invalidRowNumbers.size} invalid row${invalidRowNumbers.size !== 1 ? "s" : ""}`);
  };

  const handleSubmit = () => {
    if (validRows.length === 0) {
      toast.error("No valid rows to submit");
      return;
    }
    setState("submitting");
    bulkCreateMutation.mutate({ rows: validRows });
  };

  const handleReset = () => {
    setState("upload");
    setValidRows([]);
    setErrors([]);
    setTotalRows(0);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bulk Upload</h1>
        <p className="text-muted-foreground mt-1">
          Upload a CSV file to create multiple draft listings at once
        </p>
      </div>

      {state === "upload" && (
        <div className="space-y-6">
          {/* Download template */}
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Need a template?</p>
              <p className="text-xs text-muted-foreground">
                Download our CSV template with the correct column headers and an example row.
              </p>
            </div>
            <a href="/templates/bulk-listing-template.csv" download>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
            </a>
          </div>

          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
          >
            <input {...getInputProps()} aria-label="Upload CSV file" />
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium mb-1">
              {isDragActive ? "Drop CSV file here" : "Drag and drop a CSV file, or click to select"}
            </p>
            <p className="text-xs text-muted-foreground">
              CSV files only, up to 100 rows
            </p>
          </div>

          {/* Column reference */}
          <details className="rounded-lg border p-4">
            <summary className="text-sm font-medium cursor-pointer">
              Column Reference ({CSV_COLUMNS.filter((c) => c.required).length} required, {CSV_COLUMNS.filter((c) => !c.required).length} optional)
            </summary>
            <div className="mt-3 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Column</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Valid Values</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {CSV_COLUMNS.map((col) => (
                    <TableRow key={col.key}>
                      <TableCell className="font-mono text-xs">{col.key}</TableCell>
                      <TableCell>
                        {col.required ? (
                          <Badge variant="default">Required</Badge>
                        ) : (
                          <Badge variant="secondary">Optional</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{col.description}</TableCell>
                      <TableCell className="text-xs">
                        {col.validValues?.join(", ") || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        </div>
      )}

      {(state === "preview" || state === "submitting") && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center justify-between flex-wrap gap-3 rounded-lg border p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium">{validRows.length} valid</span>
              </div>
              {errors.length > 0 && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium">
                    {new Set(errors.map((e) => e.row)).size} invalid
                  </span>
                </div>
              )}
              <span className="text-xs text-muted-foreground">
                {totalRows} total row{totalRows !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {errors.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveInvalid}
                  disabled={state === "submitting"}
                >
                  <Trash2 className="mr-2 h-3 w-3" />
                  Remove Invalid Rows
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={state === "submitting"}
              >
                <RotateCcw className="mr-2 h-3 w-3" />
                Re-upload
              </Button>
            </div>
          </div>

          {/* Preview table */}
          <div className="rounded-lg border overflow-auto">
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Row</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Sq Ft</TableHead>
                    <TableHead className="text-right">Price/SqFt</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>ZIP</TableHead>
                    <TableHead className="text-right">MOQ</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{row.title}</TableCell>
                      <TableCell>{row.materialType}</TableCell>
                      <TableCell className="text-right">{row.totalSqFt.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.askPricePerSqFt)}</TableCell>
                      <TableCell>{row.condition}</TableCell>
                      <TableCell>{row.locationZip}</TableCell>
                      <TableCell className="text-right">
                        {row.moq} {row.moqUnit === "pallets" ? "plt" : "sf"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="success">Valid</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {Object.entries(errorsByRow).map(([rowNum, rowErrors]) => (
                    <TableRow key={`err-${rowNum}`} className="bg-destructive/5">
                      <TableCell className="text-muted-foreground">{rowNum}</TableCell>
                      <TableCell colSpan={7} className="text-destructive text-xs">
                        {rowErrors.map((e) => `${e.field}: ${e.message}`).join("; ")}
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="destructive">Invalid</Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <ul className="space-y-1">
                              {rowErrors.map((e, j) => (
                                <li key={j}>
                                  <strong>{e.field}:</strong> {e.message}
                                </li>
                              ))}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={validRows.length === 0 || state === "submitting"}
              size="lg"
            >
              {state === "submitting" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating {validRows.length} Draft{validRows.length !== 1 ? "s" : ""}...
                </>
              ) : (
                <>
                  Create {validRows.length} Draft Listing{validRows.length !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
