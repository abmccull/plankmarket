import { z } from "zod";
import type {
  DispatchRequest,
  P1LineItem,
  P1Location,
  P1PickupWindow,
  P1ShipmentStatus,
  ShipmentIdentifier,
  TrackingStatus,
} from "./priority1";
import type { TrackingEvent } from "@/server/db/schema";
import {
  resolveFreightFunding,
  type FreightFundingDecision,
  type FreightFundingMode,
} from "@/lib/freight-funding";
import {
  normalizeUsStateCode,
  type UsStateCode,
} from "@/lib/selling-territory";
import zipcodes from "zipcodes";

type NullableString = string | null | undefined;
type NullableNumber = number | null | undefined;

/** Minimum residual life required at carrier dispatch / capture re-check. */
export const SHIPPING_DISPATCH_SAFETY_BUFFER_MS = 5 * 60 * 1000;
/**
 * Residual life required when creating a PaymentIntent (covers card-entry time).
 */
export const SHIPPING_PAYMENT_BOOKABILITY_BUFFER_MS = 10 * 60 * 1000;
/**
 * Residual life required when minting/offering rates and consuming into an order
 * (covers browse → checkout → pay window).
 */
export const SHIPPING_OFFER_BOOKABILITY_BUFFER_MS = 20 * 60 * 1000;
/** Max Redis TTL for secure quote tokens and booking snapshots. */
export const SHIPPING_QUOTE_ARTIFACT_TTL_CAP_SECONDS = 1800;
/** Max Redis TTL for buyer-agnostic Priority1 rate-response cache. */
export const SHIPPING_RATE_RESPONSE_CACHE_TTL_CAP_SECONDS = 600;

/**
 * A quote is bookable only when it still has enough residual life for the
 * given safety buffer (dispatch / payment / offer).
 */
export function isQuoteBookable(
  expiresAt: Date | string | number,
  nowMs: number = Date.now(),
  bufferMs: number = SHIPPING_DISPATCH_SAFETY_BUFFER_MS,
): boolean {
  const expiresAtMs =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : typeof expiresAt === "number"
        ? expiresAt
        : new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return false;
  return expiresAtMs > nowMs + bufferMs;
}

/**
 * Shared TTL for quote token + booking snapshot artifacts. Returns null when
 * the quote is no longer offer-bookable (do not mint). Caps at residual life
 * minus the offer buffer so Redis keys do not outlive order consume acceptance.
 */
export function quoteArtifactTtlSeconds(
  expiresAt: Date | string | number,
  nowMs: number = Date.now(),
  capSeconds: number = SHIPPING_QUOTE_ARTIFACT_TTL_CAP_SECONDS,
): number | null {
  if (!isQuoteBookable(expiresAt, nowMs, SHIPPING_OFFER_BOOKABILITY_BUFFER_MS)) {
    return null;
  }
  const expiresAtMs =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : typeof expiresAt === "number"
        ? expiresAt
        : new Date(expiresAt).getTime();
  const bookableResidualMs =
    expiresAtMs - nowMs - SHIPPING_OFFER_BOOKABILITY_BUFFER_MS;
  if (bookableResidualMs <= 0) return null;
  return Math.min(
    capSeconds,
    Math.max(1, Math.floor(bookableResidualMs / 1000)),
  );
}

export interface ListingFreightFundingSnapshot {
  freightPaymentMode: "buyer_pays" | "seller_pays" | null | undefined;
  sellerFreightStates: unknown;
  freightDropCharge: number | string | null | undefined;
}

/**
 * Resolves the persisted listing configuration into an immutable order-time
 * freight split. The listing model stores nationwide and selected-state
 * sponsorship under the same seller_pays mode; a non-empty state list selects
 * the narrower order snapshot mode.
 *
 * Malformed runtime data fails closed to buyer-funded freight so a corrupted
 * JSON/default value cannot create an unapproved seller liability.
 */
export function resolveListingFreightFunding(params: {
  listing: ListingFreightFundingSnapshot;
  fullFreightCharge: number;
  destinationState: string | null | undefined;
}): FreightFundingDecision {
  if (params.listing.freightPaymentMode !== "seller_pays") {
    return resolveFreightFunding({
      mode: "buyer_pays",
      fullFreightCharge: params.fullFreightCharge,
    });
  }

  if (
    params.listing.sellerFreightStates != null &&
    !Array.isArray(params.listing.sellerFreightStates)
  ) {
    return resolveFreightFunding({
      mode: "buyer_pays",
      fullFreightCharge: params.fullFreightCharge,
    });
  }

  const sellerFreightStates = (params.listing.sellerFreightStates ??
    []) as unknown[];
  if (sellerFreightStates.some((value) => typeof value !== "string")) {
    return resolveFreightFunding({
      mode: "buyer_pays",
      fullFreightCharge: params.fullFreightCharge,
    });
  }
  const dropCharge =
    params.listing.freightDropCharge == null
      ? null
      : Number(params.listing.freightDropCharge);
  if (
    dropCharge != null &&
    (!Number.isFinite(dropCharge) || dropCharge < 0)
  ) {
    return resolveFreightFunding({
      mode: "buyer_pays",
      fullFreightCharge: params.fullFreightCharge,
    });
  }

  const mode: FreightFundingMode =
    sellerFreightStates.length > 0
      ? "seller_pays_selected_states"
      : "seller_pays";

  return resolveFreightFunding({
    mode,
    fullFreightCharge: params.fullFreightCharge,
    destinationState: params.destinationState,
    sellerSponsoredStates: sellerFreightStates.map((value) =>
      typeof value === "string" ? value : null,
    ),
    buyerDropCharge: dropCharge,
  });
}

export function resolveUsStateForZip(zip: string): UsStateCode {
  const normalizedZip = normalizeUsZip(zip);
  const destinationState = normalizeUsStateCode(
    zipcodes.lookup(normalizedZip)?.state,
  );
  if (!destinationState) {
    throw new Error("The shipping ZIP code could not be matched to a US state");
  }
  return destinationState;
}

export function requireShippingStateMatchesZip(params: {
  shippingState: string;
  shippingZip: string;
}): UsStateCode {
  const normalizedDeclaredState = normalizeUsStateCode(params.shippingState);
  const destinationState = resolveUsStateForZip(params.shippingZip);
  if (
    !normalizedDeclaredState ||
    normalizedDeclaredState !== destinationState
  ) {
    throw new Error("The shipping state does not match the shipping ZIP code");
  }
  return destinationState;
}

export function getSellerFreightFundingIneligibilityReason(params: {
  sellerFreightContribution: number;
  sellerPayout: number;
}): string | null {
  if (
    params.sellerFreightContribution > 0 &&
    (!Number.isFinite(params.sellerPayout) || params.sellerPayout <= 0)
  ) {
    return "This seller-funded freight option would leave no transferable seller payout. The seller must raise the item price, add or increase the buyer drop charge, or switch freight to buyer pays.";
  }
  return null;
}

export interface FreightFundingTerms {
  freightFundingMode: FreightFundingMode;
  buyerFreightCharge: number;
  sellerFreightContribution: number;
}

export function freightFundingMatchesQuotedTerms(params: {
  applied: FreightFundingDecision;
  quoted: FreightFundingTerms;
}): boolean {
  const toCents = (value: number) => Math.round(value * 100);
  return (
    params.quoted.freightFundingMode === params.applied.appliedMode &&
    toCents(params.quoted.buyerFreightCharge) ===
      toCents(params.applied.buyerFreightCharge) &&
    toCents(params.quoted.sellerFreightContribution) ===
      toCents(params.applied.sellerFreightContribution)
  );
}

const providerWindowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const providerLocationSchema = z.object({
  address: z.object({
    addressLine1: z.string().min(1),
    addressLine2: z.string().nullish(),
    city: z.string().min(1),
    state: z.string().min(1),
    postalCode: z.string().regex(/^\d{5}$/),
    country: z.string().min(2),
  }),
  contact: z.object({
    companyName: z.string().min(1),
    contactName: z.string().min(1),
    phoneNumber: z.string().min(7),
    phoneNumberExtension: z.string().nullish(),
    email: z.string().email().nullish(),
  }),
});

const freightLineItemSchema = z.object({
  freightClass: z.string().min(1),
  packagingType: z.string().min(1),
  units: z.number().int().positive(),
  pieces: z.number().int().positive(),
  totalWeight: z.number().positive(),
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  description: z.string().min(1),
  isStackable: z.boolean(),
  isHazardous: z.boolean(),
  isUsed: z.boolean(),
  nmfcItemCode: z.string().min(1).optional(),
  nmfcSubCode: z.string().min(1).optional(),
});

export const shippingBookingSnapshotSchema = z
  .object({
    version: z.literal(1),
    quoteId: z.number().int().positive(),
    listingId: z.string().uuid(),
    buyerId: z.string().uuid(),
    quantitySqFt: z.number().positive(),
    destinationZip: z.string().regex(/^\d{5}$/),
    carrierName: z.string().min(1),
    carrierScac: z.string().min(1),
    carrierRate: z.number().nonnegative(),
    shippingPrice: z.number().nonnegative(),
    accessorialCodes: z
      .array(z.enum(["LGDEL", "RESD", "APPT"]))
      .default([]),
    commercialPolicy: z
      .object({
        version: z.number().int().positive(),
        buyerMarketplaceFeeBps: z.number().int().min(0).max(10_000),
        sellerMarketplaceFeeBps: z.number().int().min(0).max(10_000),
        paymentProcessingRateBps: z.number().int().min(0).max(10_000),
        paymentProcessingFixedFeeCents: z.number().int().nonnegative(),
        shippingMarkupBps: z.number().int().min(0).max(10_000),
        capturedAt: z.string().datetime(),
      })
      .strict()
      .optional(),
    transitDays: z.number().int().nonnegative(),
    quoteExpiresAt: z.string().datetime(),
    originLocation: providerLocationSchema,
    lineItems: z.array(freightLineItemSchema).min(1),
    pickupWindow: providerWindowSchema,
    deliveryWindow: providerWindowSchema,
  })
  .strict();

export type ShippingBookingSnapshot = z.infer<
  typeof shippingBookingSnapshotSchema
>;

export class ShippingBookingReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShippingBookingReviewError";
  }
}

export class ShippingQuoteUnbookableError extends ShippingBookingReviewError {
  constructor(message: string) {
    super(message);
    this.name = "ShippingQuoteUnbookableError";
  }
}

export function getOrderDispatchIneligibilityReason(params: {
  paymentStatus: string | null;
  escrowStatus: string;
  orderStatus: string;
  inventoryReleasedAt: Date | string | null;
  hasOpenDispute: boolean;
}): string | null {
  if (params.paymentStatus !== "succeeded") {
    return `Order payment status is ${params.paymentStatus}`;
  }
  if (params.escrowStatus !== "held") {
    return `Order payment hold status is ${params.escrowStatus}`;
  }
  if (params.inventoryReleasedAt) return "Order inventory was released";
  if (!["confirmed", "processing"].includes(params.orderStatus)) {
    return `Order status ${params.orderStatus} is not dispatchable`;
  }
  if (params.hasOpenDispute) return "Order has an open dispute";
  return null;
}

export interface ShippingSnapshotOrderContext {
  selectedQuoteId: string | null;
  listingId: string;
  buyerId: string;
  quantitySqFt: number | string;
  shippingZip: NullableString;
  carrierRate: number | string | null;
  shippingPrice: number | string | null;
  selectedCarrier: NullableString;
  quoteExpiresAt: Date | string | null;
}

export const SHIPPING_BOOKING_SNAPSHOT_PREFIX = "shipping-booking-snapshot";
export const SHIPPING_BOOKING_SNAPSHOT_TOKEN_PREFIX =
  "shipping-booking-snapshot:token";

/**
 * @deprecated Prefer token-scoped snapshots via
 * {@link getShippingBookingSnapshotKeyByToken}. Global quoteId keys race when
 * the rate cache reuses Priority1 quote IDs across buyers.
 */
export function getShippingBookingSnapshotKey(quoteId: string | number): string {
  return `${SHIPPING_BOOKING_SNAPSHOT_PREFIX}:${quoteId}`;
}

/** Token-scoped booking snapshot — unique per getQuotes mint. */
export function getShippingBookingSnapshotKeyByToken(quoteToken: string): string {
  return `${SHIPPING_BOOKING_SNAPSHOT_TOKEN_PREFIX}:${quoteToken}`;
}

export function getShippingQuoteTokenKey(quoteToken: string): string {
  return `shipping-quote-token:${quoteToken}`;
}

/**
 * Select top shipping quotes: cheapest, fastest (if distinct), then best value
 * among remaining (lowest price-per-transit-day).
 */
export function selectTopShippingQuotes<
  T extends {
    quoteId: number;
    shippingPrice: number;
    transitDays: number;
  },
>(quotes: T[], limit = 3): T[] {
  if (quotes.length === 0 || limit <= 0) return [];
  if (quotes.length <= limit) {
    return [...quotes].sort((a, b) => a.shippingPrice - b.shippingPrice);
  }

  const byPrice = [...quotes].sort(
    (a, b) => a.shippingPrice - b.shippingPrice,
  );
  const bySpeed = [...quotes].sort(
    (a, b) => a.transitDays - b.transitDays || a.shippingPrice - b.shippingPrice,
  );

  const selected = new Map<number, T>();
  if (byPrice[0]) selected.set(byPrice[0].quoteId, byPrice[0]);
  if (bySpeed[0]) selected.set(bySpeed[0].quoteId, bySpeed[0]);

  if (selected.size < limit) {
    const remaining = quotes
      .filter((q) => !selected.has(q.quoteId))
      .sort((a, b) => {
        const valueA = a.shippingPrice / Math.max(a.transitDays, 1);
        const valueB = b.shippingPrice / Math.max(b.transitDays, 1);
        return valueA - valueB || a.shippingPrice - b.shippingPrice;
      });
    for (const quote of remaining) {
      if (selected.size >= limit) break;
      selected.set(quote.quoteId, quote);
    }
  }

  return Array.from(selected.values()).sort(
    (a, b) => a.shippingPrice - b.shippingPrice,
  );
}

function moneyMatches(snapshotAmount: number, orderAmount: number | string | null) {
  if (orderAmount === null) return false;
  const parsed = Number(orderAmount);
  return Number.isFinite(parsed) && Math.abs(snapshotAmount - parsed) <= 0.01;
}

/**
 * Validates the durable, immutable quote payload against the paid order. Any
 * failure requires a human to re-quote/reconcile; callers must never rebuild a
 * provider request from current listing or seller data.
 */
export function requireShippingBookingSnapshotForOrder(params: {
  snapshot: unknown;
  order: ShippingSnapshotOrderContext;
  now?: Date;
}): ShippingBookingSnapshot {
  const now = params.now ?? new Date();
  let snapshot: ShippingBookingSnapshot;

  try {
    const candidate =
      typeof params.snapshot === "string"
        ? JSON.parse(params.snapshot)
        : params.snapshot;
    snapshot = shippingBookingSnapshotSchema.parse(candidate);
  } catch {
    throw new ShippingQuoteUnbookableError(
      "MANUAL_REVIEW_REQUIRED: shipping booking snapshot is missing or invalid",
    );
  }

  const { order } = params;
  let destinationZip: string;
  try {
    destinationZip = normalizeUsZip(order.shippingZip ?? "");
  } catch {
    throw new ShippingQuoteUnbookableError(
      "MANUAL_REVIEW_REQUIRED: paid order has no valid shipping ZIP",
    );
  }

  if (
    !order.selectedQuoteId ||
    String(snapshot.quoteId) !== order.selectedQuoteId ||
    snapshot.listingId !== order.listingId ||
    snapshot.buyerId !== order.buyerId ||
    Math.abs(snapshot.quantitySqFt - Number(order.quantitySqFt)) > 0.01 ||
    snapshot.destinationZip !== destinationZip ||
    snapshot.carrierName !== order.selectedCarrier ||
    !moneyMatches(snapshot.carrierRate, order.carrierRate) ||
    !moneyMatches(snapshot.shippingPrice, order.shippingPrice)
  ) {
    throw new ShippingQuoteUnbookableError(
      "MANUAL_REVIEW_REQUIRED: shipping booking snapshot does not match the paid order",
    );
  }

  const snapshotExpiry = new Date(snapshot.quoteExpiresAt);
  const orderExpiry =
    order.quoteExpiresAt instanceof Date
      ? order.quoteExpiresAt
      : order.quoteExpiresAt
        ? new Date(order.quoteExpiresAt)
        : null;
  if (
    !orderExpiry ||
    Number.isNaN(orderExpiry.getTime()) ||
    snapshotExpiry.getTime() !== orderExpiry.getTime()
  ) {
    throw new ShippingQuoteUnbookableError(
      "MANUAL_REVIEW_REQUIRED: shipping quote expiry evidence does not match the order",
    );
  }
  if (snapshotExpiry.getTime() <= now.getTime()) {
    throw new ShippingQuoteUnbookableError(
      "MANUAL_REVIEW_REQUIRED: shipping quote expired; re-quote before booking",
    );
  }

  return snapshot;
}

export interface DispatchWorkflowContext {
  order: {
    orderNumber: string;
    selectedQuoteId: string | null;
    shippingAddress: NullableString;
    shippingCity: NullableString;
    shippingState: NullableString;
    shippingZip: NullableString;
    shippingName: NullableString;
    shippingPhone: NullableString;
  };
  buyer: {
    businessName: NullableString;
    name: string;
    phone: NullableString;
    email: string;
  };
  snapshot: ShippingBookingSnapshot;
}

export interface ShipmentStatusUpdate {
  mappedStatus:
    | "pending"
    | "dispatched"
    | "in_transit"
    | "out_for_delivery"
    | "delivered"
    | "exception"
    | "cancelled";
  trackingEvents: TrackingEvent[];
  pickupConfirmed: boolean;
  pickupConfirmedAt: Date | null;
  delivered: boolean;
  deliveredAt: Date | null;
}

export function normalizeUsZip(zip: string): string {
  const match = zip.trim().match(/^(\d{5})(?:-\d{4})?$/);
  if (!match) {
    throw new Error("A valid 5-digit US ZIP code is required");
  }
  return match[1];
}

/**
 * US freight business calendar. Vercel/Node typically run UTC; host-local
 * getDay/getDate mis-compute next pickup for late US evenings.
 */
export const FREIGHT_BUSINESS_TIMEZONE = "America/Chicago";

function zonedCalendarDate(
  date: Date,
  timeZone: string = FREIGHT_BUSINESS_TIMEZONE,
): string {
  // en-CA yields stable YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Represent a calendar YMD as UTC noon (stable weekday + formatting). */
function calendarDateToUtcNoon(ymd: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) {
    throw new Error(`Invalid calendar date: ${ymd}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addCalendarDaysUtcNoon(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * US federal holidays commonly observed by LTL carriers (fixed + observed
 * weekday shifts for 2025–2028). Values are YYYY-MM-DD in freight TZ.
 * Extend annually as needed.
 */
const FREIGHT_US_HOLIDAYS = new Set([
  // 2025
  "2025-01-01",
  "2025-01-20",
  "2025-02-17",
  "2025-05-26",
  "2025-06-19",
  "2025-07-04",
  "2025-09-01",
  "2025-11-11",
  "2025-11-27",
  "2025-12-25",
  // 2026
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03", // July 4 observed (Saturday)
  "2026-09-07",
  "2026-11-11",
  "2026-11-26",
  "2026-12-25",
  // 2027
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-05-31",
  "2027-06-18", // Juneteenth observed (Saturday)
  "2027-07-05", // July 4 observed (Sunday)
  "2027-09-06",
  "2027-11-11",
  "2027-11-25",
  "2027-12-24", // Christmas observed (Saturday)
  "2027-12-31", // New Year's observed (Saturday)
  // 2028
  "2028-01-17",
  "2028-02-21",
  "2028-05-29",
  "2028-06-19",
  "2028-07-04",
  "2028-09-04",
  "2028-11-10", // Veterans Day observed (Saturday)
  "2028-11-23",
  "2028-12-25",
]);

export function isFreightBusinessDay(date: Date): boolean {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !FREIGHT_US_HOLIDAYS.has(formatPriority1Date(date));
}

export function getNextBusinessDay(
  from = new Date(),
  timeZone: string = FREIGHT_BUSINESS_TIMEZONE,
): Date {
  let cursor = calendarDateToUtcNoon(zonedCalendarDate(from, timeZone));
  cursor = addCalendarDaysUtcNoon(cursor, 1);
  while (!isFreightBusinessDay(cursor)) {
    cursor = addCalendarDaysUtcNoon(cursor, 1);
  }
  return cursor;
}

export function addBusinessDays(
  from: Date,
  days: number,
  timeZone: string = FREIGHT_BUSINESS_TIMEZONE,
): Date {
  let cursor = calendarDateToUtcNoon(zonedCalendarDate(from, timeZone));
  let remaining = Math.max(0, days);
  while (remaining > 0) {
    cursor = addCalendarDaysUtcNoon(cursor, 1);
    if (isFreightBusinessDay(cursor)) remaining--;
  }
  return cursor;
}

/** Priority1 accessorial codes used for common lumber/flooring delivery needs. */
export const FREIGHT_ACCESSORIAL_CODES = {
  liftgateDelivery: "LGDEL",
  residentialDelivery: "RESD",
  appointmentDelivery: "APPT",
} as const;

export type FreightAccessorialFlags = {
  liftgateDelivery?: boolean;
  residentialDelivery?: boolean;
  appointmentDelivery?: boolean;
};

export function resolveFreightAccessorialCodes(
  flags: FreightAccessorialFlags | null | undefined,
): string[] {
  if (!flags) return [];
  const codes: string[] = [];
  if (flags.liftgateDelivery) codes.push(FREIGHT_ACCESSORIAL_CODES.liftgateDelivery);
  if (flags.residentialDelivery) {
    codes.push(FREIGHT_ACCESSORIAL_CODES.residentialDelivery);
  }
  if (flags.appointmentDelivery) {
    codes.push(FREIGHT_ACCESSORIAL_CODES.appointmentDelivery);
  }
  return codes;
}

export function formatPriority1Date(date: Date): string {
  // Prefer UTC components when the date is our UTC-noon calendar representation.
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function formatPickupDate(date: Date): string {
  return formatPriority1Date(date);
}

export function formatPriority1DateValue(value: string | Date): string {
  if (typeof value === "string") {
    const datePrefix = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (datePrefix) return datePrefix[1];
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Priority1 returned an invalid date");
  }
  // Provider timestamps: format in freight business TZ, not host-local.
  return zonedCalendarDate(date, FREIGHT_BUSINESS_TIMEZONE);
}

export function computePalletsNeeded(params: {
  quantitySqFt: number | string;
  sqFtPerBox: NullableNumber;
  boxesPerPallet: NullableNumber;
  totalPallets: NullableNumber;
}): number {
  const quantitySqFtNum = Number(params.quantitySqFt);
  const sqFtPerBox = params.sqFtPerBox;
  const boxesPerPallet = params.boxesPerPallet;
  const totalPallets = params.totalPallets;

  if (
    !Number.isFinite(quantitySqFtNum) ||
    quantitySqFtNum <= 0 ||
    !sqFtPerBox ||
    sqFtPerBox <= 0 ||
    !boxesPerPallet ||
    boxesPerPallet <= 0 ||
    !totalPallets ||
    totalPallets <= 0
  ) {
    throw new Error("Listing pallet configuration is incomplete");
  }

  const palletsNeeded = Math.ceil(
    quantitySqFtNum / (sqFtPerBox * boxesPerPallet),
  );

  if (palletsNeeded > totalPallets) {
    throw new Error("Order quantity exceeds the listing's pallet capacity");
  }

  return Math.max(1, palletsNeeded);
}

export function parseNmfcCode(
  value: NullableString,
): { nmfcItemCode: string; nmfcSubCode: string } | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d{3,6})[-/:.]([A-Za-z0-9]+)$/);
  if (!match) return undefined;
  return { nmfcItemCode: match[1], nmfcSubCode: match[2] };
}

function required(value: NullableString, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required to book freight`);
  return normalized;
}

export function buildDispatchRequestForOrder(
  context: DispatchWorkflowContext,
  now = new Date(),
): { pickupDate: Date; request: DispatchRequest } {
  const snapshot = shippingBookingSnapshotSchema.parse(context.snapshot);
  if (!context.order.selectedQuoteId) {
    throw new Error("Order is missing selectedQuoteId");
  }
  if (String(snapshot.quoteId) !== context.order.selectedQuoteId) {
    throw new Error("Shipping booking snapshot does not match the order quote");
  }
  if (new Date(snapshot.quoteExpiresAt).getTime() <= now.getTime()) {
    throw new Error("Shipping quote expired before dispatch");
  }

  const destinationLocation: P1Location = {
    address: {
      addressLine1: required(context.order.shippingAddress, "Shipping address"),
      city: required(context.order.shippingCity, "Shipping city"),
      state: required(context.order.shippingState, "Shipping state"),
      postalCode: normalizeUsZip(
        required(context.order.shippingZip, "Shipping ZIP"),
      ),
      country: "US",
    },
    contact: {
      companyName:
        context.buyer.businessName?.trim() || required(context.buyer.name, "Buyer name"),
      contactName:
        context.order.shippingName?.trim() || required(context.buyer.name, "Buyer name"),
      phoneNumber:
        context.order.shippingPhone?.trim() ||
        required(context.buyer.phone, "Buyer phone"),
      email: required(context.buyer.email, "Buyer email"),
    },
  };

  const pickupDate = new Date(`${snapshot.pickupWindow.date}T12:00:00Z`);

  return {
    pickupDate,
    request: {
      originLocation: snapshot.originLocation as P1Location,
      destinationLocation,
      lineItems: snapshot.lineItems as P1LineItem[],
      pickupWindow: snapshot.pickupWindow as P1PickupWindow,
      deliveryWindow: snapshot.deliveryWindow as P1PickupWindow,
      shipmentIdentifiers: [
        {
          type: "CUSTOMER_REFERENCE",
          value: context.order.orderNumber,
          primaryForType: true,
        },
      ],
      quoteId: snapshot.quoteId,
      insuranceAmount: 0,
      pickupNote: `PlankMarket Order ${context.order.orderNumber}`,
    },
  };
}

function parseProviderDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizedShipmentStatus(status: NullableString): ShipmentStatusUpdate["mappedStatus"] | null {
  const normalized = status?.trim().toLowerCase().replace(/[_-]+/g, " ") ?? "";

  if (normalized.includes("out for delivery")) return "out_for_delivery";
  if (
    normalized === "delivered" ||
    normalized === "completed" ||
    normalized.includes("delivered to")
  ) {
    return "delivered";
  }
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("exception") || normalized.includes("error")) {
    return "exception";
  }
  if (
    normalized.includes("in transit") ||
    normalized.includes("intransit") ||
    normalized.includes("en route") ||
    normalized.includes("picked up") ||
    normalized.includes("pickedup")
  ) {
    return "in_transit";
  }
  if (normalized.includes("dispatch")) return "dispatched";
  return null;
}

function isPickupTrackingStatus(status: NullableString): boolean {
  const mapped = normalizedShipmentStatus(status);
  return (
    mapped === "in_transit" ||
    mapped === "out_for_delivery" ||
    mapped === "delivered"
  );
}

function normalizeTrackingStatusesToEvents(
  trackingStatuses: TrackingStatus[] | null | undefined,
): TrackingEvent[] {
  return (trackingStatuses ?? [])
    .filter((status): status is TrackingStatus & { timeStamp: string } =>
      Boolean(status.timeStamp),
    )
    .map((status) => ({
      timestamp: status.timeStamp,
      status: normalizedShipmentStatus(status.status) ?? "pending",
      location: [status.city, status.state].filter(Boolean).join(", "),
      description: status.statusReason || status.status || "Tracking update",
    }));
}

export function mergeTrackingEvents(
  existing: TrackingEvent[] | null | undefined,
  incoming: TrackingEvent[],
): TrackingEvent[] {
  const byKey = new Map<string, TrackingEvent>();
  for (const event of [...(existing ?? []), ...incoming]) {
    const key = [
      event.timestamp,
      event.status,
      event.location,
      event.description,
    ].join("|");
    byKey.set(key, event);
  }
  return [...byKey.values()].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

const STATUS_RANK: Record<ShipmentStatusUpdate["mappedStatus"], number> = {
  pending: 0,
  dispatched: 1,
  in_transit: 2,
  out_for_delivery: 3,
  exception: 3,
  delivered: 4,
  cancelled: 4,
};

export function mapPriority1ShipmentStatus(
  currentStatus: ShipmentStatusUpdate["mappedStatus"],
  p1Shipment: P1ShipmentStatus,
): ShipmentStatusUpdate {
  const providerStatus = normalizedShipmentStatus(p1Shipment.status);
  let mappedStatus = currentStatus;

  if (providerStatus === "cancelled" || providerStatus === "delivered") {
    mappedStatus = providerStatus;
  } else if (providerStatus === "exception") {
    mappedStatus = "exception";
  } else if (
    providerStatus &&
    (currentStatus === "exception" ||
      STATUS_RANK[providerStatus] >= STATUS_RANK[currentStatus])
  ) {
    mappedStatus = providerStatus;
  }

  const trackingStatuses = p1Shipment.trackingStatuses ?? [];
  const pickupTrackingDate = trackingStatuses
    .filter((status) => isPickupTrackingStatus(status.status))
    .map((status) => parseProviderDate(status.timeStamp))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const pickupConfirmedAt =
    parseProviderDate(p1Shipment.actualPickupDate) ??
    pickupTrackingDate ??
    null;
  const deliveryTrackingStatus = [...trackingStatuses]
    .reverse()
    .find((status) => normalizedShipmentStatus(status.status) === "delivered");
  const deliveredAt =
    parseProviderDate(p1Shipment.actualDeliveryDate) ??
    parseProviderDate(deliveryTrackingStatus?.timeStamp);

  return {
    mappedStatus,
    trackingEvents: normalizeTrackingStatusesToEvents(trackingStatuses),
    pickupConfirmed: Boolean(pickupConfirmedAt),
    pickupConfirmedAt,
    delivered: mappedStatus === "delivered",
    deliveredAt,
  };
}

export function shouldEmitProviderPickupEvent(params: {
  statusUpdate: ShipmentStatusUpdate;
  orderStatus: string;
  shippedAt: Date | null;
  dryRun: boolean;
}): boolean {
  return (
    params.statusUpdate.pickupConfirmed &&
    params.statusUpdate.mappedStatus !== "cancelled" &&
    !params.shippedAt &&
    params.orderStatus !== "cancelled" &&
    params.orderStatus !== "refunded" &&
    !params.dryRun
  );
}

export function getShipmentIdentifier(
  identifiers: ShipmentIdentifier[] | null | undefined,
  type: ShipmentIdentifier["type"],
): string | undefined {
  return identifiers?.find((identifier) => identifier.type === type)?.value ?? undefined;
}
