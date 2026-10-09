"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
  SPREADSHEET_FIELDS, listingMappingProblems,
  type ListingColumnMapping, type ListingSpreadsheet,
} from "@/lib/csv/listing-column-mapping";

interface Props {
  sheet: ListingSpreadsheet;
  mapping: ListingColumnMapping;
  onMappingChange: (mapping: ListingColumnMapping) => void;
  onReview: () => void;
  onReset: () => void;
  remember: boolean;
  onRememberChange: (remember: boolean) => void;
  notice: string | null;
  disabled: boolean;
}
export function CsvColumnReview({ sheet, mapping, onMappingChange, onReview, onReset, remember, onRememberChange, notice, disabled }: Props) {
  const id = useId();
  const problems = listingMappingProblems(sheet.headers, mapping);
  const indices = Object.values(mapping);
  const needsAttention = SPREADSHEET_FIELDS.filter((field) => {
    const index = mapping[field.key];
    return (field.required && index === undefined) || (index !== undefined && (!Number.isInteger(index) || index < 0 || index >= sheet.headers.length || indices.filter((value) => value === index).length > 1));
  });
  const matched = SPREADSHEET_FIELDS.filter((field) => mapping[field.key] !== undefined && !needsAttention.includes(field));
  const remainingOptional = SPREADSHEET_FIELDS.filter((field) => !field.required && mapping[field.key] === undefined);
  const used = new Set(Object.values(mapping));
  const excluded = sheet.headers.filter((_, index) => !used.has(index));
  const row = (field: (typeof SPREADSHEET_FIELDS)[number]) => {
    const index = mapping[field.key];
    const example = index === undefined ? null : sheet.records.find((record) => record.cells[index]?.trim() && !record.cells[mapping.title]?.startsWith("INSTRUCTIONS") && !record.cells[mapping.title]?.startsWith("⬇"))?.cells[index];
    return <div key={field.key} className="grid min-w-0 gap-2 border-b py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-5">
      <div className="min-w-0">
        <label htmlFor={`${id}-${field.key}`} className="text-sm font-medium">{field.label}{field.required && <span className="ml-1 text-xs text-muted-foreground">Required</span>}</label>
        <p id={`${id}-${field.key}-hint`} className="mt-1 text-xs text-muted-foreground break-words">{field.description}{field.validValues && ` Values: ${field.validValues.join(", ")}.`}</p>
      </div>
      <div className="min-w-0">
        <select id={`${id}-${field.key}`} aria-describedby={`${id}-${field.key}-hint ${id}-${field.key}-sample`} value={index ?? ""} disabled={disabled} className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary" onChange={(event) => {
          const next = { ...mapping };
          if (event.target.value === "") delete next[field.key]; else next[field.key] = Number(event.target.value);
          onMappingChange(next);
        }}>
          <option value="">{field.required ? "Choose a column" : "Exclude this field"}</option>
          {sheet.headers.map((header, sourceIndex) => <option key={sourceIndex} value={sourceIndex}>{header}</option>)}
        </select>
        <p id={`${id}-${field.key}-sample`} className="mt-1 text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">{index === undefined ? "No source column selected" : `Example: ${example || "Blank in this file"}`}</p>
      </div>
    </div>;
  };
  return <section aria-labelledby={`${id}-heading`} className="max-w-3xl space-y-4">
    <div>
      <h2 id={`${id}-heading`} className="text-xl font-semibold">Match your columns</h2>
      <p className="mt-1 text-sm text-muted-foreground break-words">{sheet.fileName} · {sheet.headers.length} columns. Choose which column supplies each field, then review the inventory rows.</p>
      <p className="mt-2 text-sm text-muted-foreground">Prices are USD per square foot, weights are pounds and pallet dimensions are inches. Values and units are checked as supplied.</p>
    </div>
    {notice && <p role="status" className="text-sm break-words">{notice}</p>}
    {needsAttention.length > 0 && <div><h3 className="text-sm font-semibold">Choose or correct these columns</h3>{needsAttention.map(row)}</div>}
    {matched.length > 0 && <details className="border-b pb-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Review matched columns ({matched.length})</summary>{matched.map(row)}</details>}
    <details className="border-b pb-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Add optional fields ({remainingOptional.length})</summary>{remainingOptional.map(row)}</details>
    {excluded.length > 0 && <p className="text-sm text-muted-foreground break-words [overflow-wrap:anywhere]">Excluded columns: {excluded.join(", ")}. Their values will not be imported.</p>}
    {problems.length > 0 && <div role="status" className="border-l-2 border-amber-600 pl-3 text-sm"><p className="font-medium">Complete the column review</p><ul className="mt-1 space-y-1">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></div>}
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={remember} disabled={disabled} onChange={(event) => onRememberChange(event.target.checked)} className="h-4 w-4 shrink-0"/>Remember these columns for my account on this browser</label>
    <p className="text-xs text-muted-foreground">Only column choices are saved. Each file’s prices, quantities, specifications and inventory still need review.</p>
    <div className="flex flex-wrap gap-3">
      <Button className="min-h-11" disabled={disabled || problems.length > 0} onClick={onReview}>{disabled ? "Checking inventory…" : "Review inventory rows"}</Button>
      <Button className="min-h-11" variant="outline" disabled={disabled} onClick={onReset}>Choose another file</Button>
    </div>
  </section>;
}
