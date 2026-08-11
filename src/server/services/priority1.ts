import { env } from "@/env";
import {
  parseAllowedHostList,
  validateAllowlistedHttpsUrl,
} from "./allowlisted-https-url";
import { z } from "zod";

// Base configuration
const PRIORITY1_BASE_URL = "https://api.priority1.com";
const REQUEST_TIMEOUT_MS = 30000;
const PRIORITY1_MAX_ATTEMPTS = 3;
const PRIORITY1_RETRY_BASE_DELAY_MS = 250;
const PRIORITY1_RETRY_MAX_DELAY_MS = 2000;

function isDryRun(): boolean {
  const enabled = env.PRIORITY1_DRY_RUN === "true";
  const isLiveProduction =
    env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview";

  if (enabled && isLiveProduction) {
    throw new Error(
      "PRIORITY1_DRY_RUN must never be enabled in production",
    );
  }

  return enabled;
}

function getApiKey(): string {
  if (!env.PRIORITY1_API_KEY) {
    throw new Error("PRIORITY1_API_KEY is not configured");
  }

  return env.PRIORITY1_API_KEY;
}

function getDryRunStatusOverride(): string | undefined {
  return process.env.PRIORITY1_DRY_RUN_STATUS;
}

export function getAllowedPriority1DocumentHosts(): string[] {
  return parseAllowedHostList(env.PRIORITY1_DOCUMENT_ALLOWED_HOSTS);
}

export function validatePriority1DocumentUrl(rawUrl: string): {
  ok: boolean;
  reason?: string;
  parsedUrl?: URL;
  normalizedUrl?: string;
} {
  return validateAllowlistedHttpsUrl(rawUrl, {
    allowedHosts: getAllowedPriority1DocumentHosts(),
    resourceLabel: "Priority1 document URL",
  });
}

function sumDigits(value: string): number {
  return value
    .split("")
    .filter((char) => /\d/.test(char))
    .reduce((sum, char) => sum + Number(char), 0);
}

function buildDryRunRatesResponse(request: RatesRequest): RatesResponse {
  const totalWeight = request.items.reduce(
    (sum, item) => sum + item.totalWeight,
    0,
  );
  const totalUnits = request.items.reduce((sum, item) => sum + item.units, 0);
  const zipSeed =
    sumDigits(request.originZipCode) + sumDigits(request.destinationZipCode);
  const densityFactor = request.items.reduce((sum, item) => {
    return sum + item.length + item.width + item.height;
  }, 0);
  const base = Math.round(
    145 +
      zipSeed * 1.75 +
      totalUnits * 32 +
      totalWeight * 0.038 +
      densityFactor * 0.12,
  );
  const quoteSeed = zipSeed * 100 + totalUnits * 10;
  const pickupDate = new Date(request.pickupDate);

  const carriers = [
    {
      id: quoteSeed + 11,
      carrierName: "Dry Run Freight Co.",
      carrierCode: "DRYF",
      serviceLevel: "Standard",
      transitDays: 5,
      adjustment: 0,
    },
    {
      id: quoteSeed + 22,
      carrierName: "MockLine Logistics",
      carrierCode: "MOCK",
      serviceLevel: "Economy",
      transitDays: 6,
      adjustment: -18,
    },
    {
      id: quoteSeed + 33,
      carrierName: "Sandbox Express",
      carrierCode: "SBXD",
      serviceLevel: "Priority",
      transitDays: 3,
      adjustment: 37,
    },
    {
      id: quoteSeed + 44,
      carrierName: "Test Transit",
      carrierCode: "TEST",
      serviceLevel: "Balanced",
      transitDays: 4,
      adjustment: 12,
    },
  ];

  return {
    id: quoteSeed,
    rateQuotes: carriers.map((carrier, index) => {
      const total = Math.round((base + carrier.adjustment + index * 7) * 100) / 100;
      const deliveryDate = new Date(pickupDate);
      deliveryDate.setDate(deliveryDate.getDate() + carrier.transitDays);
      const expirationDate = new Date(pickupDate);
      expirationDate.setHours(expirationDate.getHours() + 12);

      return {
        id: carrier.id,
        carrierName: carrier.carrierName,
        carrierCode: carrier.carrierCode,
        serviceLevel: carrier.serviceLevel,
        transitDays: carrier.transitDays,
        deliveryDate: deliveryDate.toISOString(),
        effectiveDate: new Date().toISOString(),
        expirationDate: expirationDate.toISOString(),
        rateQuoteDetail: {
          total,
          charges: [
            {
              code: "LINEHAUL",
              description: "Line haul",
              amount: Math.round(total * 0.72 * 100) / 100,
            },
            {
              code: "FUEL",
              description: "Fuel surcharge",
              amount: Math.round(total * 0.14 * 100) / 100,
            },
            {
              code: "ACCESSORIAL",
              description: "Accessorials",
              amount: Math.round(total * 0.14 * 100) / 100,
            },
          ],
        },
      };
    }),
    invalidRateQuotes: [],
  };
}

function buildDryRunTrackingStatuses(status: string): TrackingStatus[] {
  const now = Date.now();
  const baseTime = new Date(now - 2 * 60 * 60 * 1000);

  if (status === "Dispatched") {
    return [
      {
        timeStamp: baseTime.toISOString(),
        city: "Salt Lake City",
        state: "UT",
        postalCode: "84101",
        status: "Dispatched",
        statusReason: "Shipment dispatched to carrier",
      },
    ];
  }

  if (status === "InTransit") {
    return [
      {
        timeStamp: baseTime.toISOString(),
        city: "Salt Lake City",
        state: "UT",
        postalCode: "84101",
        status: "Dispatched",
        statusReason: "Shipment dispatched to carrier",
      },
      {
        timeStamp: new Date(baseTime.getTime() + 60 * 60 * 1000).toISOString(),
        city: "Salt Lake City",
        state: "UT",
        postalCode: "84101",
        status: "PickedUp",
        statusReason: "Picked up by carrier",
      },
      {
        timeStamp: new Date(now - 30 * 60 * 1000).toISOString(),
        city: "Denver",
        state: "CO",
        postalCode: "80202",
        status: "InTransit",
        statusReason: "In transit to destination",
      },
    ];
  }

  if (status === "Canceled" || status === "Exception") {
    return [
      {
        timeStamp: baseTime.toISOString(),
        city: "Salt Lake City",
        state: "UT",
        postalCode: "84101",
        status,
        statusReason:
          status === "Canceled"
            ? "Shipment cancelled in dry-run mode"
            : "Simulated carrier exception",
      },
    ];
  }

  return [
    {
      timeStamp: baseTime.toISOString(),
      city: "Salt Lake City",
      state: "UT",
      postalCode: "84101",
      status: "Dispatched",
      statusReason: "Shipment dispatched to carrier",
    },
    {
      timeStamp: new Date(baseTime.getTime() + 60 * 60 * 1000).toISOString(),
      city: "Salt Lake City",
      state: "UT",
      postalCode: "84101",
      status: "PickedUp",
      statusReason: "Picked up by carrier",
    },
    {
      timeStamp: new Date(baseTime.getTime() + 3 * 60 * 60 * 1000).toISOString(),
      city: "Denver",
      state: "CO",
      postalCode: "80202",
      status: "InTransit",
      statusReason: "In transit to destination",
    },
    {
      timeStamp: new Date(now - 10 * 60 * 1000).toISOString(),
      city: "Portland",
      state: "OR",
      postalCode: "97201",
      status: "Delivered",
      statusReason: "Delivered to consignee",
    },
  ];
}

// ============================================================================
// Request Types
// ============================================================================

export interface SuggestedClassRequest {
  totalWeight: number;
  width: number;
  height: number;
  length: number;
  units: number;
}

export interface RateQuoteItem {
  freightClass: string;
  packagingType: string;
  units: number;
  pieces: number;
  totalWeight: number;
  length: number;
  width: number;
  height: number;
  isStackable: boolean;
  isHazardous: boolean;
  isUsed: boolean;
  isMachinery: boolean;
  description?: string | null;
  nmfcItemCode?: string | null;
  nmfcSubCode?: string | null;
}

export interface AccessorialService {
  code: string;
}

export interface RatesRequest {
  originZipCode: string;
  destinationZipCode: string;
  pickupDate: string; // ISO 8601 format: "2026-02-13T00:00:00"
  items: RateQuoteItem[];
  accessorialServices?: AccessorialService[];
}

export interface P1Address {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
}

export interface P1Contact {
  companyName: string;
  contactName: string;
  phoneNumber: string;
  phoneNumberExtension?: string | null;
  email?: string | null;
}

export interface P1Location {
  address: P1Address;
  contact: P1Contact;
}

export interface P1LineItem {
  freightClass: string;
  packagingType: string;
  units: number;
  pieces: number;
  totalWeight: number;
  length: number;
  width: number;
  height: number;
  description: string;
  isStackable: boolean;
  isHazardous: boolean;
  isUsed: boolean;
  nmfcItemCode?: string | null;
  nmfcSubCode?: string | null;
}

export interface P1PickupWindow {
  date: string; // "yyyy-MM-dd" in the applicable location's timezone
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
}

export type ShipmentIdentifierType =
  | "PRO"
  | "BILL_OF_LADING"
  | "CUSTOMER_REFERENCE"
  | "PICKUP"
  | "PURCHASE_ORDER"
  | "EXTERNAL"
  | "SALES_ORDER";

export interface ShipmentIdentifier {
  type: ShipmentIdentifierType;
  value: string | null;
  primaryForType: boolean;
}

export interface DispatchRequest {
  originLocation: P1Location;
  destinationLocation: P1Location;
  lineItems: P1LineItem[];
  pickupWindow: P1PickupWindow;
  deliveryWindow: P1PickupWindow;
  shipmentIdentifiers: ShipmentIdentifier[];
  shipmentEmergencyContact?: { name: string; phoneNumber: string };
  pickupNote?: string | null;
  deliveryNote?: string | null;
  quoteId: number;
  insuranceAmount?: number;
}

export interface StatusRequest {
  identifierType: ShipmentIdentifierType;
  identifierValue: string;
}

export interface CancelRequest {
  id: number;
}

export interface DocumentsRequest {
  shipmentImageTypeId: "BillOfLading" | "DeliveryReceipt" | "PalletLabel";
  imageFormatTypeId: "PDF" | "JPG";
  proNumber?: string;
  bolNumber?: string;
}

// ============================================================================
// Response Types
// ============================================================================

export interface SuggestedClassResponse {
  suggestedClass: string;
}

export interface RateQuoteCharge {
  code: string | null;
  description: string | null;
  amount: number | null;
}

export interface RateQuoteDetail {
  total: number;
  charges: RateQuoteCharge[];
}

export interface RateQuote {
  id: number;
  carrierName: string | null;
  carrierCode: string | null;
  serviceLevel: string | null;
  transitDays: number;
  deliveryDate: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  rateQuoteDetail: RateQuoteDetail;
}

export interface InvalidRateQuote {
  carrierCode: string | null;
  carrierName: string | null;
  errorMessages: Priority1Message[];
}

export interface Priority1Message {
  severity: string | null;
  text: string | null;
  source: string | null;
}

export interface RatesResponse {
  id: number;
  rateQuotes: RateQuote[];
  invalidRateQuotes: InvalidRateQuote[];
}

export interface DispatchResponse {
  id: number;
  shipmentIdentifiers: ShipmentIdentifier[];
  capacityProviderBolUrl: string | null;
  capacityProviderPalletLabelUrl: string | null;
  capacityProviderPalletLabelExtendedUrl: string | null;
  capacityProviderPalletLabelsUrl: string | null;
  pickupNote: string | null;
  estimatedDeliveryDate: string | null;
  infoMessages?: Priority1Message[];
  shipmentInsurance?: number;
  totalCost?: number;
}

export interface TrackingStatus {
  timeStamp: string;
  addressLineOne?: string | null;
  addressLineTwo?: string | null;
  city: string | null;
  state: string | null;
  postalCode?: string | null;
  status: string | null;
  statusReason: string | null;
}

export interface P1ShipmentStatus {
  id: number;
  carrierCode: string | null;
  carrierName: string | null;
  status: string | null;
  actualPickupDate: string | null;
  actualDeliveryDate: string | null;
  shipmentIdentifiers: ShipmentIdentifier[] | null;
  trackingStatuses: TrackingStatus[] | null;
  totalCost: number;
}

export interface StatusResponse {
  shipments: P1ShipmentStatus[];
}

export interface DocumentsResponse {
  imageUrl: string | null;
}

export class Priority1ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "Priority1ApiError";
  }

  get retryable(): boolean {
    return (
      this.status === undefined ||
      this.status === 408 ||
      this.status === 425 ||
      this.status === 429 ||
      (this.status ?? 0) >= 500
    );
  }
}

/**
 * Live dispatch returned a bookable shipment id, but document URL / payload
 * validation failed after the non-retryable POST. Callers should cancel when
 * possible and open manual review — never silently leave a stranded book.
 */
export class Priority1PostBookValidationError extends Priority1ApiError {
  constructor(
    message: string,
    public readonly priority1ShipmentId: number,
  ) {
    super(message, 502);
    this.name = "Priority1PostBookValidationError";
  }

  override get retryable(): boolean {
    return false;
  }
}

const freightClassSchema = z.enum([
  "50",
  "55",
  "60",
  "65",
  "70",
  "77.5",
  "85",
  "92.5",
  "100",
  "110",
  "125",
  "150",
  "175",
  "200",
  "250",
  "300",
  "400",
  "500",
]);
const shipmentIdentifierTypeSchema = z.enum([
  "PRO",
  "BILL_OF_LADING",
  "CUSTOMER_REFERENCE",
  "PICKUP",
  "PURCHASE_ORDER",
  "EXTERNAL",
  "SALES_ORDER",
]);
const nonEmptyStringSchema = z.string().trim().min(1);
const nullableNonEmptyStringSchema = nonEmptyStringSchema.nullable();
const optionalNullableNonEmptyStringSchema = nullableNonEmptyStringSchema
  .optional()
  .transform((value) => value ?? null);
const finiteNumberSchema = z.number().finite();
const nonNegativeNumberSchema = finiteNumberSchema.nonnegative();
const MIN_PROVIDER_DATE_MS = Date.UTC(2000, 0, 1);
const MAX_PROVIDER_DATE_MS = Date.UTC(2100, 0, 1);
const providerDateSchema = nonEmptyStringSchema.refine(
  (value) => {
    const timestamp = new Date(value).getTime();
    return (
      !Number.isNaN(timestamp) &&
      timestamp >= MIN_PROVIDER_DATE_MS &&
      timestamp < MAX_PROVIDER_DATE_MS
    );
  },
  "Invalid or implausible provider date",
);
/** Strict document URL — used when the caller needs a verified fetch target. */
const priority1DocumentUrlSchema = nonEmptyStringSchema.transform(
  (value, ctx) => {
    const result = validatePriority1DocumentUrl(value);
    if (!result.ok || !result.normalizedUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.reason ?? "Invalid Priority1 document URL",
      });
      return z.NEVER;
    }
    return result.normalizedUrl;
  },
);

/**
 * Soft document URL for dispatch payloads: drop non-allowlisted / invalid
 * optional label/BOL hosts to null instead of failing the entire booked
 * shipment parse (null docs soft-pass; identity still succeeds).
 * Empty/whitespace strings soft-null (common Priority1 optional blanks).
 * Logs the drop so ops can distinguish permanent host allowlist failures
 * from provider-missing docs.
 */
const softPriority1DocumentUrlSchema = z.preprocess(
  (value) => {
    if (value == null) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    return value;
  },
  z
    .union([nonEmptyStringSchema, z.null()])
    .transform((value) => {
      if (value == null) return null;
      const result = validatePriority1DocumentUrl(value);
      if (!result.ok || !result.normalizedUrl) {
        console.warn("[Priority1] soft-dropped document URL after live book", {
          reason: result.reason ?? "invalid document URL",
          host: (() => {
            try {
              return new URL(value).host;
            } catch {
              return null;
            }
          })(),
        });
        return null;
      }
      return result.normalizedUrl;
    }),
);

const priority1MessageSchema = z.object({
  severity: z.string().nullish().transform((value) => value ?? null),
  text: z.string().nullish().transform((value) => value ?? null),
  source: z.string().nullish().transform((value) => value ?? null),
});

const shipmentIdentifierSchema = z.object({
  type: shipmentIdentifierTypeSchema,
  value: nullableNonEmptyStringSchema,
  primaryForType: z.boolean(),
});

const rateQuoteChargeSchema = z.object({
  code: optionalNullableNonEmptyStringSchema,
  description: optionalNullableNonEmptyStringSchema,
  amount: finiteNumberSchema
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

const rateQuoteSchema = z.object({
  id: z.number().int().positive(),
  carrierName: optionalNullableNonEmptyStringSchema,
  carrierCode: optionalNullableNonEmptyStringSchema,
  serviceLevel: optionalNullableNonEmptyStringSchema,
  transitDays: z.number().int().nonnegative(),
  deliveryDate: providerDateSchema
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  effectiveDate: providerDateSchema
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  expirationDate: providerDateSchema
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  rateQuoteDetail: z.object({
    total: nonNegativeNumberSchema,
    charges: z
      .array(rateQuoteChargeSchema)
      .nullish()
      .transform((charges) => charges ?? []),
  }),
});

const invalidRateQuoteSchema = z.object({
  carrierCode: optionalNullableNonEmptyStringSchema,
  carrierName: optionalNullableNonEmptyStringSchema,
  errorMessages: z
    .array(priority1MessageSchema)
    .nullish()
    .transform((messages) => messages ?? []),
});

const suggestedClassResponseSchema = z.object({
  suggestedClass: freightClassSchema,
});

const ratesResponseSchema = z.object({
  id: z.number().int().positive(),
  rateQuotes: z
    .array(rateQuoteSchema)
    .nullish()
    .transform((quotes) => quotes ?? []),
  invalidRateQuotes: z
    .array(invalidRateQuoteSchema)
    .nullish()
    .transform((quotes) => quotes ?? []),
});

const dispatchResponseSchema = z.object({
  id: z.number().int().positive(),
  shipmentIdentifiers: z
    .array(shipmentIdentifierSchema)
    .nullish()
    .transform((identifiers) => identifiers ?? []),
  capacityProviderBolUrl: softPriority1DocumentUrlSchema,
  capacityProviderPalletLabelUrl: softPriority1DocumentUrlSchema,
  capacityProviderPalletLabelExtendedUrl: softPriority1DocumentUrlSchema,
  capacityProviderPalletLabelsUrl: softPriority1DocumentUrlSchema,
  pickupNote: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  estimatedDeliveryDate: providerDateSchema
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  infoMessages: z
    .array(priority1MessageSchema)
    .nullish()
    .transform((messages) => messages ?? []),
  shipmentInsurance: nonNegativeNumberSchema.optional(),
  // Optional: Priority1 often omits totalCost on dispatch (appears on status).
  totalCost: nonNegativeNumberSchema.optional(),
});

const trackingStatusSchema = z.object({
  timeStamp: providerDateSchema,
  addressLineOne: z.string().nullish(),
  addressLineTwo: z.string().nullish(),
  city: z.string().nullish().transform((value) => value ?? null),
  state: z.string().nullish().transform((value) => value ?? null),
  postalCode: z.string().nullish(),
  status: z.string().nullish().transform((value) => value ?? null),
  statusReason: z.string().nullish().transform((value) => value ?? null),
});

const shipmentStatusSchema = z.object({
  id: z.number().int().positive(),
  carrierCode: nullableNonEmptyStringSchema
    .optional()
    .transform((value) => value ?? null),
  carrierName: nullableNonEmptyStringSchema
    .optional()
    .transform((value) => value ?? null),
  status: nullableNonEmptyStringSchema
    .optional()
    .transform((value) => value ?? null),
  actualPickupDate: providerDateSchema
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  actualDeliveryDate: providerDateSchema
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  shipmentIdentifiers: z
    .array(shipmentIdentifierSchema)
    .nullish()
    .transform((identifiers) => identifiers ?? []),
  trackingStatuses: z
    .array(trackingStatusSchema)
    .nullish()
    .transform((statuses) => statuses ?? []),
  totalCost: nonNegativeNumberSchema,
});

const statusResponseSchema = z.object({
  shipments: z
    .array(shipmentStatusSchema)
    .nullish()
    .transform((shipments) => shipments ?? []),
});

const documentsResponseSchema = z.object({
  imageUrl: priority1DocumentUrlSchema
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

const cancelResponseSchema = z.object({
  id: z.number().int().positive().optional(),
  pickupNote: z.string().nullish(),
  shipmentIdentifiers: z
    .array(shipmentIdentifierSchema)
    .nullish()
    .transform((identifiers) => identifiers ?? []),
  cancellationSuccess: z.literal(true),
});

function invalidProviderResponse(endpoint: string, detail: string) {
  return new Priority1ApiError(
    `Priority1 API returned an invalid response for ${endpoint}: ${detail}`,
    502,
  );
}

function parseProviderResponse<TSchema extends z.ZodType>(
  endpoint: string,
  schema: TSchema,
  payload: unknown,
): z.output<TSchema> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const paths = parsed.error.issues
      .slice(0, 3)
      .map((issue) => issue.path.join(".") || "response")
      .join(", ");
    throw invalidProviderResponse(endpoint, `malformed field(s): ${paths}`);
  }
  return parsed.data;
}

// ============================================================================
// API Client Implementation
// ============================================================================

/**
 * Internal fetch helper with authentication, timeout, and error handling
 */
async function priority1FetchOnce(
  endpoint: string,
  body: object
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${PRIORITY1_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "X-API-KEY": getApiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const responseBody = await response.text();

    if (!response.ok) {
      let errorMessage = `Priority1 API error: ${response.status} ${response.statusText}`;
      try {
        const errorData = JSON.parse(responseBody) as {
          message?: string;
          error?: string;
        };
        if (errorData.message) {
          errorMessage = `Priority1 API error: ${errorData.message}`;
        } else if (errorData.error) {
          errorMessage = `Priority1 API error: ${errorData.error}`;
        }
      } catch {
        // If JSON parsing fails, use the generic error message
      }
      throw new Priority1ApiError(errorMessage, response.status);
    }

    if (!responseBody.trim()) return undefined;
    try {
      return JSON.parse(responseBody) as unknown;
    } catch {
      throw invalidProviderResponse(endpoint, "response body is not valid JSON");
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Priority1ApiError(
          `Priority1 API request timeout after ${REQUEST_TIMEOUT_MS}ms`
        );
      }
      if (error instanceof Priority1ApiError) {
        throw error;
      }
      throw new Priority1ApiError(
        `Priority1 API network error: ${error.message}`,
      );
    }
    throw new Priority1ApiError("Unknown error calling Priority1 API");
  } finally {
    clearTimeout(timeoutId);
  }
}

function getRetryDelayMs(failedAttempt: number): number {
  const exponentialDelay = Math.min(
    PRIORITY1_RETRY_MAX_DELAY_MS,
    PRIORITY1_RETRY_BASE_DELAY_MS * 2 ** (failedAttempt - 1),
  );
  // Equal jitter keeps retries bounded while avoiding synchronized retry waves.
  return Math.round(exponentialDelay / 2 + Math.random() * exponentialDelay / 2);
}

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Retry only calls that are safe to repeat. Dispatch and cancellation opt out
 * because Priority1 does not expose an idempotency key for those mutations;
 * their workflow-level recovery must reconcile provider state first.
 */
async function priority1Fetch(
  endpoint: string,
  body: object,
  options: { safeToRetry?: boolean } = {},
): Promise<unknown> {
  const safeToRetry = options.safeToRetry !== false;
  const maxAttempts = safeToRetry ? PRIORITY1_MAX_ATTEMPTS : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await priority1FetchOnce(endpoint, body);
    } catch (error) {
      const shouldRetry =
        error instanceof Priority1ApiError &&
        error.retryable &&
        attempt < maxAttempts;
      if (!shouldRetry) throw error;
      await waitForRetry(getRetryDelayMs(attempt));
    }
  }

  throw new Priority1ApiError(
    `Priority1 API request exhausted ${maxAttempts} attempt(s)`,
  );
}

// ============================================================================
// Public API Methods
// ============================================================================

/**
 * Get suggested freight class based on weight and dimensions
 */
async function getSuggestedClass(
  request: SuggestedClassRequest
): Promise<SuggestedClassResponse> {
  if (isDryRun()) {
    return { suggestedClass: "125" };
  }
  const endpoint = "/v2/ltl/quotes/suggestedclass";
  return parseProviderResponse(
    endpoint,
    suggestedClassResponseSchema,
    await priority1Fetch(endpoint, request),
  );
}

/**
 * Get carrier rate quotes for LTL shipment
 */
async function getRates(request: RatesRequest): Promise<RatesResponse> {
  if (isDryRun()) {
    const response = buildDryRunRatesResponse(request);
    console.log(
      `[Priority1 DRY-RUN] getRates(${request.originZipCode} -> ${request.destinationZipCode}) → ${response.rateQuotes.length} mock quotes`,
    );
    return response;
  }
  const endpoint = "/v2/ltl/quotes/rates";
  const response = parseProviderResponse(
    endpoint,
    ratesResponseSchema,
    await priority1Fetch(endpoint, request),
  );
  const quoteIds = new Set(response.rateQuotes.map((quote) => quote.id));
  if (quoteIds.size !== response.rateQuotes.length) {
    throw invalidProviderResponse(endpoint, "duplicate rate quote IDs");
  }
  return response;
}

/**
 * Dispatch a shipment with a carrier.
 * In dry-run mode, returns mock data instead of creating a real dispatch.
 */
async function dispatch(request: DispatchRequest): Promise<DispatchResponse> {
  if (isDryRun()) {
    const mockId = 99000 + Math.floor(Math.random() * 1000);
    const bolNumber = `DRY-RUN-BOL-${Math.floor(Math.random() * 100000)}`;
    console.log(`[Priority1 DRY-RUN] dispatch() → mock shipment ${mockId}, BOL ${bolNumber}`);
    return {
      id: mockId,
      shipmentIdentifiers: [
        { type: "BILL_OF_LADING", value: bolNumber, primaryForType: true },
        { type: "PRO", value: `DRY-${mockId}`, primaryForType: true },
      ],
      capacityProviderBolUrl: `https://dry-run.local/bol/${bolNumber}.pdf`,
      capacityProviderPalletLabelUrl: `https://dry-run.local/label/${mockId}.pdf`,
      capacityProviderPalletLabelExtendedUrl: null,
      capacityProviderPalletLabelsUrl: null,
      pickupNote: request.pickupNote ?? null,
      estimatedDeliveryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      infoMessages: [{ severity: "INFO", text: "DRY-RUN: No real shipment was created", source: "local" }],
    };
  }
  const endpoint = "/v2/ltl/shipments/dispatch";
  const payload = await priority1Fetch(endpoint, request, { safeToRetry: false });

  // Identity-first: if the carrier already booked but document URLs fail
  // allowlist/schema, surface the shipment id so callers can cancel/review.
  const identity = z
    .object({ id: z.number().int().positive() })
    .safeParse(payload);
  try {
    return parseProviderResponse(endpoint, dispatchResponseSchema, payload);
  } catch (error) {
    if (identity.success) {
      const detail =
        error instanceof Error ? error.message : "document validation failed";
      throw new Priority1PostBookValidationError(
        detail,
        identity.data.id,
      );
    }
    throw error;
  }
}

/**
 * Get shipment status by identifier (BOL, PRO number, or shipment ID).
 * In dry-run mode, simulates progression: dispatched → in_transit → delivered.
 */
async function getStatus(request: StatusRequest): Promise<StatusResponse> {
  if (isDryRun()) {
    const now = Date.now();
    const baseTime = new Date(now - 2 * 60 * 60 * 1000);
    const override = getDryRunStatusOverride();
    const minutesSinceEpoch = Math.floor(now / 60000);
    const phase = minutesSinceEpoch % 10;

    const status =
      override ||
      (phase < 3 ? "Dispatched" : phase < 7 ? "InTransit" : "Delivered");
    const trackingStatuses = buildDryRunTrackingStatuses(status);
    const pickedUp = status === "InTransit" || status === "Delivered";
    const delivered = status === "Delivered";

    console.log(`[Priority1 DRY-RUN] getStatus(${request.identifierValue}) → ${status}`);
    return {
      shipments: [{
        id: parseInt(request.identifierValue, 10) || 99000,
        carrierCode: "DRY-CARRIER",
        carrierName: "Dry Run Freight Co.",
        status,
        actualPickupDate: pickedUp ? baseTime.toISOString() : null,
        actualDeliveryDate: delivered ? new Date(now - 10 * 60 * 1000).toISOString() : null,
        shipmentIdentifiers: [
          { type: request.identifierType, value: request.identifierValue, primaryForType: true },
        ],
        trackingStatuses,
        totalCost: 0,
      }],
    };
  }
  const endpoint = "/v2/ltl/shipments/status";
  const response = parseProviderResponse(
    endpoint,
    statusResponseSchema,
    await priority1Fetch(endpoint, request),
  );
  if (response.shipments.length === 0) return response;

  const matchingShipments = response.shipments.filter((shipment) =>
    shipment.shipmentIdentifiers.some(
      (identifier) =>
        identifier.type === request.identifierType &&
        identifier.value === request.identifierValue,
    ),
  );
  if (matchingShipments.length === 0) {
    throw invalidProviderResponse(
      endpoint,
      "no returned shipment matched the requested tracking identifier",
    );
  }

  for (const shipment of matchingShipments) {
    if (
      shipment.actualPickupDate &&
      shipment.actualDeliveryDate &&
      new Date(shipment.actualPickupDate).getTime() >
        new Date(shipment.actualDeliveryDate).getTime()
    ) {
      throw invalidProviderResponse(
        endpoint,
        "actual pickup date is after actual delivery date",
      );
    }
  }
  return { shipments: matchingShipments };
}

/**
 * Cancel a shipment by ID.
 * In dry-run mode, no-op.
 */
async function cancel(request: CancelRequest): Promise<void> {
  if (isDryRun()) {
    console.log(`[Priority1 DRY-RUN] cancel(${request.id}) → no-op`);
    return;
  }
  const endpoint = "/v2/ltl/shipments/cancel";
  const response = await priority1Fetch(endpoint, request, {
    safeToRetry: false,
  });
  // Empty 2xx bodies are not success — require cancellationSuccess:true.
  if (response === undefined) {
    throw invalidProviderResponse(
      endpoint,
      "empty cancellation response (cancellationSuccess required)",
    );
  }

  const parsed = parseProviderResponse(endpoint, cancelResponseSchema, response);
  if (parsed.id !== undefined && parsed.id !== request.id) {
    throw invalidProviderResponse(
      endpoint,
      "cancelled shipment ID did not match the request",
    );
  }
}

/**
 * Get shipment documents (BOL, delivery receipt).
 * In dry-run mode, returns a placeholder URL.
 */
async function getDocuments(
  request: DocumentsRequest
): Promise<DocumentsResponse> {
  if (isDryRun()) {
    const id = request.bolNumber ?? request.proNumber ?? "unknown";
    console.log(`[Priority1 DRY-RUN] getDocuments(${request.shipmentImageTypeId}, ${id}) → placeholder`);
    return { imageUrl: `https://dry-run.local/documents/${request.shipmentImageTypeId}/${id}.pdf` };
  }
  const endpoint = "/v2/ltl/shipments/images";
  return parseProviderResponse(
    endpoint,
    documentsResponseSchema,
    await priority1Fetch(endpoint, request),
  );
}

// ============================================================================
// Exported API Object
// ============================================================================

export const priority1 = {
  isDryRun,
  getSuggestedClass,
  getRates,
  dispatch,
  getStatus,
  cancel,
  getDocuments,
};
