"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Wand2, Check } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Confidence = "high" | "medium" | "low";

// The draft record returned by listingAssistant.extract
// extractedFields is a JSON object with field values
// confidence is a JSON object mapping field names to confidence strings
type DraftRecord = {
  id: string;
  extractedFields: Record<string, unknown> | null;
  confidence: Record<string, string> | null;
  status: string;
};

type FieldEntry = {
  key: string;
  label: string;
  value: unknown;
  confidence: Confidence;
};

export interface SpecExtractorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (fields: Record<string, unknown>) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toConfidence(val: string | undefined): Confidence {
  if (val === "high" || val === "medium" || val === "low") return val;
  return "medium";
}

function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const styles: Record<Confidence, string> = {
    high: "bg-green-100 text-green-800 border-green-300 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800",
    medium:
      "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800",
    low: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  };

  return (
    <Badge
      variant="outline"
      className={`text-xs ${styles[confidence]}`}
      aria-label={`Confidence: ${confidence}`}
    >
      {confidence.charAt(0).toUpperCase() + confidence.slice(1)}
    </Badge>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return (value as unknown[]).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function draftToFields(draft: DraftRecord): FieldEntry[] {
  if (!draft.extractedFields) return [];
  const confidenceMap = draft.confidence ?? {};

  return Object.entries(draft.extractedFields)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => ({
      key,
      label: humanize(key),
      value,
      confidence: toConfidence(confidenceMap[key]),
    }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SpecExtractor({ open, onOpenChange, onApply }: SpecExtractorProps) {
  const [rawText, setRawText] = useState("");
  const [fields, setFields] = useState<FieldEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hasExtracted, setHasExtracted] = useState(false);

  const extractMutation = trpc.listingAssistant.extract.useMutation();

  const handleExtract = async () => {
    if (!rawText.trim()) {
      toast.error("Please paste some product specs first.");
      return;
    }

    try {
      // Cast through unknown: tRPC infers the exact DB row type;
      // we need the local DraftRecord shape for UI consumption.
      const draft = (await extractMutation.mutateAsync({
        rawText,
      })) as unknown as DraftRecord;

      if (draft.status === "failed") {
        toast.error(
          "Extraction failed. The AI could not parse the provided text."
        );
        return;
      }

      const extracted = draftToFields(draft);
      setFields(extracted);
      // Auto-select high and medium confidence fields
      setSelected(
        new Set(
          extracted
            .filter((f) => f.confidence !== "low")
            .map((f) => f.key)
        )
      );
      setHasExtracted(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Extraction failed. Please try again.";
      toast.error(msg);
    }
  };

  const toggleField = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleApplySelected = () => {
    const toApply: Record<string, unknown> = {};
    for (const field of fields) {
      if (selected.has(field.key)) {
        toApply[field.key] = field.value;
      }
    }

    if (Object.keys(toApply).length === 0) {
      toast.error("Please select at least one field to apply.");
      return;
    }

    onApply(toApply);
    handleClose();
    toast.success(
      `Applied ${Object.keys(toApply).length} extracted field${
        Object.keys(toApply).length !== 1 ? "s" : ""
      }.`
    );
  };

  const handleClose = () => {
    setRawText("");
    setFields([]);
    setSelected(new Set());
    setHasExtracted(false);
    onOpenChange(false);
  };

  const selectedCount = selected.size;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" aria-hidden="true" />
            AI Spec Extractor
          </DialogTitle>
          <DialogDescription>
            Paste manufacturer specs, a product description, or any raw text.
            The AI will extract structured flooring fields.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Input area */}
          <div className="space-y-1.5">
            <Label htmlFor="spec-text">Product Specs / Description</Label>
            <Textarea
              id="spec-text"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={6}
              maxLength={10000}
              placeholder="Paste any product spec text here — SKUs, spec sheets, product descriptions, etc."
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground text-right">
              {rawText.length}/10000
            </p>
          </div>

          <Button
            onClick={handleExtract}
            disabled={extractMutation.isPending || !rawText.trim()}
            className="w-full"
          >
            {extractMutation.isPending ? (
              <>
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
                Extracting...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Extract Fields
              </>
            )}
          </Button>

          {/* Results */}
          {hasExtracted && fields.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No fields could be extracted. Try providing more detailed specs.
            </p>
          )}

          {fields.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Extracted Fields ({fields.length})
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      onClick={() =>
                        setSelected(new Set(fields.map((f) => f.key)))
                      }
                    >
                      Select all
                    </button>
                    <span className="text-xs text-muted-foreground">&middot;</span>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      onClick={() => setSelected(new Set())}
                    >
                      None
                    </button>
                  </div>
                </div>

                <ul className="space-y-2" aria-label="Extracted fields">
                  {fields.map((field) => {
                    const isChecked = selected.has(field.key);
                    return (
                      <li key={field.key}>
                        <label
                          className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/40 cursor-pointer transition-colors"
                          htmlFor={`field-${field.key}`}
                        >
                          <input
                            id={`field-${field.key}`}
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleField(field.key)}
                            className="mt-0.5 h-4 w-4 accent-primary shrink-0"
                            aria-label={`Include ${field.label}`}
                          />
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">
                                {field.label}
                              </span>
                              <ConfidenceBadge confidence={field.confidence} />
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {formatValue(field.value)}
                            </p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {fields.length > 0 && (
            <Button
              onClick={handleApplySelected}
              disabled={selectedCount === 0}
              aria-label={`Apply ${selectedCount} selected field${selectedCount !== 1 ? "s" : ""}`}
            >
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              Apply {selectedCount} Field{selectedCount !== 1 ? "s" : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
