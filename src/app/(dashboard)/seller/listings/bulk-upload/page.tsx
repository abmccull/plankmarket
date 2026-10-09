"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { StatePanelLoading } from "@/components/ui/state-panel";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { trpc } from "@/lib/trpc/client";
import { ProGate } from "@/components/pro-gate";
import {
  type CsvParseResult,
  type ParsedListingRow,
  type CsvRowError,
} from "@/lib/csv/parse-listings";
import {
  readListingSpreadsheet, restoreListingMapping, saveListingMapping,
  validateMappedListings, listingMappingProblems, SPREADSHEET_FIELDS,
  type ListingColumnMapping, type ListingSpreadsheet,
} from "@/lib/csv/listing-column-mapping";
import { CsvColumnReview } from "@/components/listings/csv-column-review";
import { CSV_COLUMNS } from "@/lib/constants/csv-columns";
import { normalizeCsvWearLayer } from "@/lib/csv/wear-layer";
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
import { useAuthStore } from "@/lib/stores/auth-store";

type PageState = "upload" | "mapping" | "preview" | "submitting";

export default function BulkUploadPage() {
  const user = useAuthStore((state) => state.user);
  if (!user) return <StatePanelLoading label="Loading your import" rows={2} />;
  return <OwnedBulkImport key={user.id} actorId={user.id} />;
}
function OwnedBulkImport({ actorId }: { actorId: string }) {
  const router = useRouter();
  const { setBatch, bindSeller, sellerId, batchId, storageWarning } =
    useBulkUploadStore();
  const mounted = useRef(false),
    submitting = useRef(false),
    parseGeneration = useRef(0);
  const invalidated = useRef(false);
  const [accountChanged, setAccountChanged] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ count: number } | null>(null);
  const current = () =>
    mounted.current &&
    !invalidated.current &&
    useAuthStore.getState().user?.id === actorId &&
    useBulkUploadStore.getState().sellerId === actorId;
  useEffect(() => {
    mounted.current = true;
    bindSeller(actorId);
    const unsubscribe = useAuthStore.subscribe((next) => {
      if (next.user?.id === actorId) return;
      invalidated.current = true;
      parseGeneration.current++;
      setAccountChanged(true);
      setIsParsing(false);
    });
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [actorId, bindSeller]);
  const { user } = useAuthStore();

  const [state, setState] = useState<PageState>("upload");
  const [validRows, setValidRows] = useState<ParsedListingRow[]>([]);
  const [validRowNumbers, setValidRowNumbers] = useState<number[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [errors, setErrors] = useState<CsvRowError[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [spreadsheet, setSpreadsheet] = useState<ListingSpreadsheet | null>(null);
  const [columnMapping, setColumnMapping] = useState<ListingColumnMapping>({});
  const [mappingNotice, setMappingNotice] = useState<string | null>(null);
  const [rememberMapping, setRememberMapping] = useState(true);
  const requiresVerification =
    !!user && user.role !== "admin" && user.verificationStatus !== "verified";

  const bulkCreateMutation = trpc.listing.bulkCreate.useMutation({
    retry: false,
    onSuccess: (data) => {
      if (!current()) return;
      // Keep the submit lock through this terminal receipt.
      setCreated({ count: data.count });
      setImportError(null);
      setBatch(
        actorId,
        data.batchId,
        data.listings.map((listing) => ({
          ...listing,
          hasPhotos: false,
          mediaCount: 0,
        })),
      );
      toast.success(
        data.count +
          " draft listing" +
          (data.count === 1 ? "" : "s") +
          " created",
      );
    },
    onError: (error) => {
      if (!current()) return;
      submitting.current = false;
      setState("preview");
      setImportError(
        getErrorMessage(error, "We could not confirm the import.") +
          " Check Drafts before retrying. Retrying this file keeps the same import request identity.",
      );
    },
  });
  useEffect(() => {
    if (!requiresVerification) return;

    toast.error("Verification is required before creating listings.");
    router.replace("/seller/verification");
  }, [requiresVerification, router]);

  const preparePreview = useCallback(
    async (result: CsvParseResult, generation: number) => {
        if (
          !mounted.current ||
          invalidated.current ||
          useAuthStore.getState().user?.id !== actorId ||
          parseGeneration.current !== generation
        )
          return;
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(result.validRows)),
        );
        const fingerprint = Array.from(new Uint8Array(digest), (value) =>
          value.toString(16).padStart(2, "0"),
        ).join("");
        if (
          !mounted.current ||
          invalidated.current ||
          useAuthStore.getState().user?.id !== actorId ||
          parseGeneration.current !== generation
        )
          return;
        const storageKey = "plankmarket-import:" + actorId + ":" + fingerprint;
        let id: string;
        try {
          const savedId = localStorage.getItem(storageKey);
          if (
            savedId !== null &&
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              savedId,
            )
          )
            throw new Error("Unreadable import identity");
          id = savedId ?? crypto.randomUUID();
          localStorage.setItem(storageKey, id);
        } catch {
          throw new Error(
            "This browser could not save or restore the import retry key. Check your saved drafts and allow browser storage before importing this file.",
          );
        }
        setRequestId(id);
        setValidRows(result.validRows);
        setValidRowNumbers(result.validRowNumbers);
        setErrors(result.errors);
        setWarnings(result.warnings ?? []);
        setTotalRows(result.totalRows);

        if (result.totalRows === 0) {
          toast.error("CSV file is empty");
          return;
        }

        setState("preview");
    },
    [actorId],
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (!mounted.current || invalidated.current || submitting.current || useAuthStore.getState().user?.id !== actorId) return;
      const generation = ++parseGeneration.current;
      setIsParsing(true);
      setState("upload");
      setImportError(null);
      setSpreadsheet(null);
      setColumnMapping({});
      setMappingNotice(null);
      setValidRows([]);
      setValidRowNumbers([]);
      setErrors([]);
      setWarnings([]);
      setTotalRows(0);
      setRequestId(null);
      try {
        const sheet = await readListingSpreadsheet(file);
        if (!mounted.current || invalidated.current || useAuthStore.getState().user?.id !== actorId || parseGeneration.current !== generation) return;
        const restored = restoreListingMapping(actorId, sheet.headers);
        setSpreadsheet(sheet);
        setColumnMapping(restored.mapping);
        setMappingNotice(restored.warning ?? (restored.reused ? "Your saved columns are loaded. Review them for this file before continuing." : null));
        const canonicalTemplate = !restored.reused && !listingMappingProblems(sheet.headers, restored.mapping).length && CSV_COLUMNS.filter((field) => field.required).every((field) => sheet.headers[restored.mapping[field.key]] === field.key);
        if (canonicalTemplate) {
          await preparePreview(validateMappedListings(sheet, restored.mapping), generation);
        } else {
          setState("mapping");
        }
      } catch (error) {
        if (
          mounted.current &&
          !invalidated.current &&
          useAuthStore.getState().user?.id === actorId &&
          parseGeneration.current === generation
        )
          setImportError(getErrorMessage(error, "Failed to parse CSV"));
      } finally {
        if (mounted.current && !invalidated.current && useAuthStore.getState().user?.id === actorId && parseGeneration.current === generation) setIsParsing(false);
      }
    },
    [actorId, preparePreview],
  );

  const handleReviewColumns = async () => {
    if (!current() || !spreadsheet || isParsing || submitting.current) return;
    const generation = ++parseGeneration.current;
    setIsParsing(true);
    setImportError(null);
    setRequestId(null);
    try {
      const result = validateMappedListings(spreadsheet, columnMapping);
      if (rememberMapping) {
        const warning = saveListingMapping(actorId, spreadsheet.headers, columnMapping);
        setMappingNotice(warning ?? "Column choices saved for your account on this browser.");
      }
      await preparePreview(result, generation);
    } catch (error) {
      if (current() && parseGeneration.current === generation) setImportError(getErrorMessage(error, "Check your column choices and try again."));
    } finally {
      if (current() && parseGeneration.current === generation) setIsParsing(false);
    }
  };

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        handleFile(acceptedFiles[0]);
      }
    },
    [handleFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
    onDropRejected: (files) => {
      if (!current()) return;
      setImportError(files.some((file) => file.errors.some((error) => error.code === "file-too-large")) ? "This CSV is larger than 5 MB. Split it into files with up to 100 inventory rows." : "Choose one CSV file. Export Excel files as CSV UTF-8 first.");
    },
    disabled: state === "submitting" || isParsing || accountChanged,
  });

  const errorsByRow = errors.reduce<Record<number, CsvRowError[]>>(
    (acc, err) => {
      if (!acc[err.row]) acc[err.row] = [];
      acc[err.row].push(err);
      return acc;
    },
    {},
  );

  const handleRemoveInvalid = () => {
    const invalidRowNumbers = new Set(errors.map((e) => e.row));
    // validRows are already only the valid ones from parsing
    // errors reference original row numbers — just clear errors
    setErrors([]);
    setTotalRows(validRows.length);
    toast.success(
      `Removed ${invalidRowNumbers.size} invalid row${invalidRowNumbers.size !== 1 ? "s" : ""}`,
    );
  };

  const handleSubmit = () => {
    if (!current() || isParsing || submitting.current || created || !requestId) return;
    if (errors.length) {
      toast.error("Correct or remove invalid rows before importing");
      return;
    }
    if (validRows.length === 0) {
      toast.error("No valid rows to submit");
      return;
    }
    setState("submitting");
    submitting.current = true;
    bulkCreateMutation.mutate({ requestId, rows: validRows });
  };

  const handleReset = () => {
    if (!current() || submitting.current) return;
    parseGeneration.current++;
    setImportError(null);
    setState("upload");
    setValidRows([]);
    setValidRowNumbers([]);
    setWarnings([]);
    setErrors([]);
    setTotalRows(0);
    setRequestId(null);
    setSpreadsheet(null);
    setColumnMapping({});
    setMappingNotice(null);
    // Keep the seller/file retry key: re-upload must not replay as a new import.
  };

  if (requiresVerification) return null;
  if (accountChanged) return <section className="space-y-3"><h1 className="text-xl font-semibold">Reload your inventory import</h1><p role="alert" className="text-sm">The signed-in account changed. Reload to review inventory for the current account.</p><Button className="min-h-11" onClick={() => window.location.reload()}>Reload import</Button></section>;
  if (sellerId !== actorId)
    return <StatePanelLoading label="Loading your import" rows={2} />;
  if (created)
    return (
      <section
        className="max-w-2xl space-y-4"
        aria-labelledby="import-created-title"
      >
        <h1 id="import-created-title" className="text-3xl font-bold">
          Draft listings created
        </h1>
        <p>
          {created.count} draft listing{created.count === 1 ? "" : "s"} saved.
          Add photos next, or return later from Drafts.
        </p>
        {storageWarning && <p role="alert">{storageWarning}</p>}
        <div className="flex flex-wrap gap-3">
          <Button asChild className="min-h-11">
            <Link href="/seller/listings/bulk-upload/photos">
              Add listing photos
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/seller/listings?status=draft">Open saved drafts</Link>
          </Button>
        </div>
      </section>
    );

  return (
    <ProGate feature="Bulk CSV Import">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Bulk Upload</h1>
          <p className="text-muted-foreground mt-1">
            Use your inventory CSV, match its columns and review draft listings before adding photos.
          </p>
        </div>

        {importError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 p-3 text-sm"
          >
            {importError}
          </p>
        )}
        {batchId && state === "upload" && (
          <p className="text-sm">
            You have an imported photo session.{" "}
            <Link
              className="inline-flex min-h-11 items-center underline"
              href="/seller/listings/bulk-upload/photos"
            >
              Resume imported drafts
            </Link>{" "}
            or{" "}
            <Link
              className="inline-flex min-h-11 items-center underline"
              href="/seller/listings?status=draft"
            >
              open all saved drafts
            </Link>
            .
          </p>
        )}
        {state === "upload" && (
          <div className="space-y-6">
            {/* Download template */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-4">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Need a template?</p>
                <p className="text-xs text-muted-foreground">
                  Use your existing CSV, or start with our column headers and an example row.
                </p>
              </div>
                <Button asChild variant="outline" size="sm" className="min-h-11">
                  <a href="/templates/bulk-listing-template.csv" download>
                  <Download className="mr-2 h-4 w-4" />
                  Download Template
                  </a>
                </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              Adding a wear layer? Include <code>wearLayerUnit</code> as{" "}
              <code>mm</code> or <code>mil</code>. Values without a source unit
              need correction before import. Leave both cells blank if unknown.
            </p>

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
                {isParsing ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
              </div>
              <p className="text-sm font-medium mb-1">
                {isParsing ? "Checking your inventory rows…" : isDragActive
                  ? "Drop CSV file here"
                  : "Drag and drop a CSV file, or click to select"}
              </p>
              <p className="text-xs text-muted-foreground">
                CSV UTF-8 · Up to 100 inventory rows · 5 MB maximum
              </p>
            </div>

            {/* Column reference */}
            <details className="rounded-lg border p-4">
              <summary className="text-sm font-medium cursor-pointer">
                Column Reference ({SPREADSHEET_FIELDS.filter((c) => c.required).length}{" "}
                required, {SPREADSHEET_FIELDS.filter((c) => !c.required).length}{" "}
                optional)
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
                    {SPREADSHEET_FIELDS.map((col) => (
                      <TableRow key={col.key}>
                        <TableCell className="font-mono text-xs">
                          {col.key}
                        </TableCell>
                        <TableCell>
                          {col.required ? (
                            <Badge variant="default">Required</Badge>
                          ) : (
                            <Badge variant="secondary">Optional</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {col.description}
                        </TableCell>
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

        {state === "mapping" && spreadsheet && <CsvColumnReview
          sheet={spreadsheet} mapping={columnMapping} onMappingChange={setColumnMapping}
          onReview={handleReviewColumns} onReset={handleReset}
          remember={rememberMapping} onRememberChange={setRememberMapping}
          notice={mappingNotice} disabled={isParsing}
        />}

        {(state === "preview" || state === "submitting") && mappingNotice && <p role="status" className="text-sm break-words">{mappingNotice}</p>}

        {(state === "preview" || state === "submitting") &&
          warnings.length > 0 && (
            <div
              role="status"
              className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
            >
              <p className="font-medium">Excluded columns</p>
              {warnings.map((warning) => (
                <p key={warning} className="mt-1 break-words [overflow-wrap:anywhere]">
                  {warning}
                </p>
              ))}
            </div>
          )}
        {(state === "preview" || state === "submitting") && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center justify-between flex-wrap gap-3 rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium">
                    {validRows.length} valid
                  </span>
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
                {spreadsheet && <Button variant="outline" size="sm" className="min-h-11" disabled={state === "submitting" || isParsing} onClick={() => {
                  if (!current() || submitting.current) return;
                  setImportError(null);
                  setRequestId(null);
                  setState("mapping");
                }}>Change columns</Button>}
                {errors.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11"
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
                  className="min-h-11"
                  onClick={handleReset}
                  disabled={state === "submitting"}
                >
                  <RotateCcw className="mr-2 h-3 w-3" />
                  Re-upload
                </Button>
              </div>
            </div>

            {errors.length > 0 && (
              <section aria-labelledby="import-corrections-title" className="space-y-2 border-l-2 border-destructive pl-3">
                <h2 id="import-corrections-title" className="text-sm font-semibold">Correct {Object.keys(errorsByRow).length} CSV row{Object.keys(errorsByRow).length === 1 ? "" : "s"} before importing</h2>
                <p className="text-sm text-muted-foreground">Fix these rows in your spreadsheet and re-upload, or remove invalid rows to import only the valid ones. CSV row numbers include the header and skipped rows.</p>
                <ul className="space-y-2 text-sm">
                  {Object.entries(errorsByRow).map(([rowNumber, rowErrors]) => (
                    <li key={rowNumber}>
                      <span className="font-medium">Row {rowNumber}: </span>
                      {rowErrors.map((error) => `${CSV_COLUMNS.find((column) => column.key === error.field)?.label ?? error.field}: ${error.message}`).join("; ")}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="text-sm text-muted-foreground">
              Wear layers are saved in millimeters. Review the source unit and
              saved value below before creating drafts.
            </p>

            {/* Preview table */}
            <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">CSV row</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">Sq Ft</TableHead>
                      <TableHead className="text-right">Price/SqFt</TableHead>
                      <TableHead>Wear layer (saved mm)</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>ZIP</TableHead>
                      <TableHead className="text-right">MOQ</TableHead>
                      <TableHead className="w-20">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validRows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">
                          {validRowNumbers[i]}
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {row.title}
                        </TableCell>
                        <TableCell>{row.materialType}</TableCell>
                        <TableCell className="text-right">
                          {row.totalSqFt.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(row.askPricePerSqFt)}
                        </TableCell>
                        <TableCell>
                          <WearLayerPreview row={row} />
                        </TableCell>
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
                  </TableBody>
                </Table>
            </div>

            {/* Submit */}
            <div className="flex justify-end">
              <Button
                onClick={handleSubmit}
                className="min-h-11"
                disabled={
                  validRows.length === 0 ||
                  errors.length > 0 ||
                  state === "submitting" || isParsing || !requestId
                }
                size="lg"
              >
                {state === "submitting" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating {validRows.length} Draft
                    {validRows.length !== 1 ? "s" : ""}...
                  </>
                ) : (
                  <>
                    Create {validRows.length} Draft Listing
                    {validRows.length !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ProGate>
  );
}

function WearLayerPreview({ row }: { row: ParsedListingRow }) {
  const normalized = normalizeCsvWearLayer(
    row.wearLayer,
    row.wearLayerUnit,
    row.materialType,
  );
  if (!normalized)
    return <span className="text-muted-foreground">Not provided</span>;
  return (
    <div className="min-w-40 space-y-1 text-sm">
      <p>
        {row.wearLayerUnit === "mm"
          ? `${row.wearLayer} mm`
          : `${row.wearLayer} mil → ${normalized.millimeters} mm`}
      </p>
      {normalized.method === "form_preset" && (
        <p className="text-xs text-muted-foreground">
          Uses the existing form preset.
        </p>
      )}
      {normalized.method === "mil_conversion" && (
        <p className="text-xs text-muted-foreground">
          Converted at 0.0254 mm per mil.
        </p>
      )}
    </div>
  );
}
