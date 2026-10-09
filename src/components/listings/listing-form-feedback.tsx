"use client";

import type { ChangeEvent, FocusEvent, FormEvent } from "react";
import type { FieldErrors, UseFormRegisterReturn } from "react-hook-form";
import type { ListingFormInput } from "@/lib/validators/listing";

const FIELD_META = {
  warehouseId: ["Pickup warehouse", 2], warehouseRevision: ["Pickup warehouse details", 2],
  title: ["Listing title", 1], description: ["Description", 1], materialType: ["Material type", 1], species: ["Species", 1], finish: ["Finish", 1], grade: ["Grade", 1], thickness: ["Thickness", 1], width: ["Width", 1], length: ["Length", 1], wearLayer: ["Wear layer", 1], color: ["Color", 1], colorFamily: ["Color family", 1], brand: ["Brand", 1], modelNumber: ["Model number", 1], packagingType: ["Packaging", 1], installationMethod: ["Installation method", 1], waterResistance: ["Water performance", 1], lotNumber: ["Manufacturer lot number", 1],
  totalSqFt: ["Total square footage", 2], totalPallets: ["Total pallets", 2], sqFtPerBox: ["Square feet per box", 2], boxesPerPallet: ["Boxes per pallet", 2], moq: ["Minimum order quantity", 2], moqUnit: ["Minimum order unit", 2], palletWeight: ["Pallet weight (pounds)", 2], palletLength: ["Pallet length (inches)", 2], palletWidth: ["Pallet width (inches)", 2], palletHeight: ["Pallet height (inches)", 2], locationCity: ["Warehouse city", 2], locationState: ["Warehouse state", 2], locationZip: ["Warehouse ZIP code", 2], nmfcCode: ["NMFC code", 2], freightClass: ["Freight class", 2],
  askPricePerSqFt: ["Asking price per square foot", 3], buyNowPrice: ["Buy now price", 3], allowOffers: ["Allow offers", 3], floorPrice: ["Internal floor price", 3], fullLotOnly: ["Purchase structure", 3], partialQuantityMarkupPercent: ["Partial-order markup", 3], automaticMarkdownEnabled: ["Automatic markdown", 3], automaticMarkdownFloorPercent: ["Markdown floor percent", 3], automaticMarkdownIntervalDays: ["Days between markdowns", 3], allowSampleRequests: ["Sample requests", 3], territoryMode: ["Sales territory", 3], allowedDestinationStates: ["Allowed destination states", 3], freightPaymentMode: ["Freight funding", 3], sellerFreightStates: ["Seller-funded freight states", 3], freightDropCharge: ["Buyer drop charge", 3],
  condition: ["Condition", 4], reasonCode: ["Reason for sale", 4], certifications: ["Certifications", 4], mediaIds: ["Photos", 5],
} as const satisfies Partial<Record<keyof ListingFormInput, readonly [string, number]>>;
type KnownField = keyof typeof FIELD_META;

export function preserveListingNumberInput(registration: UseFormRegisterReturn) {
  const formEvent = (event: ChangeEvent<HTMLInputElement> | FocusEvent<HTMLInputElement>) =>
    event.target.validity.badInput
      // A number input reports value="" for malformed text. Give RHF the invalid
      // number directly, keeping native text in the DOM and genuine clears distinct.
      ? { target: { name: registration.name, value: Number.NaN }, type: event.type }
      : event;
  return {
    ...registration,
    onChange: (event: ChangeEvent<HTMLInputElement>) => registration.onChange(formEvent(event)),
    // Blur runs before a switch click; it must not turn the same malformed text into a clear.
    onBlur: (event: FocusEvent<HTMLInputElement>) => registration.onBlur(formEvent(event)),
  };
}

export const LISTING_STEP_FIELDS: Record<number, (keyof ListingFormInput)[]> = Object.fromEntries(
  [1, 2, 3, 4, 5, 6].map((step) => [step, (Object.keys(FIELD_META) as KnownField[]).filter((field) => FIELD_META[field][1] === step)]),
);

export function getListingFormIssues(errors: FieldErrors<ListingFormInput>) {
  return Object.keys(errors).flatMap((field) => {
    const entry = errors[field as keyof ListingFormInput];
    if (typeof entry?.message !== "string") return [];
    const meta = FIELD_META[field as KnownField];
    const label = meta?.[0] ?? "Listing details";
    const message = /Invalid input|received (undefined|NaN)|expected number/i.test(entry.message)
      ? `Enter a valid value for ${label.toLowerCase()}.`
      : entry.message;
    return [{ field: field as keyof ListingFormInput, label, step: meta?.[1] ?? 1, message }];
  });
}

export function focusListingField(field: string) {
  const escaped = CSS.escape(field);
  const element = document.querySelector<HTMLElement>(`[data-listing-field="${escaped}"], [name="${escaped}"], #${escaped}`);
  if (!element) return false;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  requestAnimationFrame(() => {
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "center", behavior: "auto" });
  });
  return true;
}

export function revealListingNativeError(event: FormEvent<HTMLFormElement>) {
  const input = event.target;
  if (input instanceof HTMLInputElement) {
    // Reveal synchronously, then let native validation focus the first invalid input.
    // Scheduling a separate focus for every invalid event would select the last one.
    for (let parent = input.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
  }
}

export function ListingFieldError({ field, errors }: { field: keyof ListingFormInput; errors: FieldErrors<ListingFormInput> }) {
  const issue = getListingFormIssues(errors).find((entry) => entry.field === field);
  return issue ? <p id={`${field}-error`} className="text-sm text-destructive">{issue.message}</p> : null;
}

export function ListingFormIssueSummary({ errors, onChoose = focusListingField }: {
  errors: FieldErrors<ListingFormInput>;
  onChoose?: (field: keyof ListingFormInput) => void;
}) {
  const issues = getListingFormIssues(errors);
  if (!issues.length) return null;
  return (
    <section role="alert" aria-labelledby="listing-form-issues-title" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <h2 id="listing-form-issues-title" className="font-semibold">Check these listing details</h2>
      <p className="mt-1 text-sm text-muted-foreground">Your changes are still here. Select a field to fix it.</p>
      <ul className="mt-2 space-y-1">
        {issues.map((issue) => <li key={issue.field}><button type="button" className="min-h-11 rounded-sm text-left text-sm text-destructive underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onChoose(issue.field)}>{issue.label}: {issue.message}</button></li>)}
      </ul>
    </section>
  );
}
