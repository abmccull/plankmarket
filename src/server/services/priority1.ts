import { env } from "@/env";

// Base configuration
const PRIORITY1_BASE_URL = "https://api.priority1.com";
const REQUEST_TIMEOUT_MS = 30000;

function isDryRun(): boolean {
  return env.PRIORITY1_DRY_RUN === "true";
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
  nmfcItemCode?: string | null;
  nmfcSubCode?: string | null;
}

export interface RatesRequest {
  originZipCode: string;
  destinationZipCode: string;
  pickupDate: string; // ISO 8601 format: "2026-02-13T00:00:00"
  items: RateQuoteItem[];
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
  date: string; // "MM/DD/YYYY"
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
}

export interface ShipmentIdentifier {
  type: string;
  value: string;
  primaryForType: boolean;
}

export interface DispatchRequest {
  originLocation: P1Location;
  destinationLocation: P1Location;
  lineItems: P1LineItem[];
  pickupWindow: P1PickupWindow;
  deliveryWindow?: P1PickupWindow;
  shipmentIdentifiers: ShipmentIdentifier[];
  shipmentEmergencyContact?: { name: string; phoneNumber: string };
  pickupNote?: string | null;
  deliveryNote?: string | null;
  quoteId: number;
  insuranceAmount?: number;
}

export interface StatusRequest {
  identifierType: "BILL_OF_LADING" | "PRO_NUMBER" | "SHIPMENT_ID";
  identifierValue: string;
}

export interface CancelRequest {
  id: number;
}

export interface DocumentsRequest {
  shipmentImageTypeId: "BillOfLading" | "DeliveryReceipt";
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
  code: string;
  description: string;
  amount: number;
}

export interface RateQuoteDetail {
  total: number;
  charges: RateQuoteCharge[];
}

export interface RateQuote {
  id: number;
  carrierName: string;
  carrierCode: string;
  serviceLevel: string;
  transitDays: number;
  deliveryDate: string;
  effectiveDate: string;
  expirationDate: string;
  rateQuoteDetail: RateQuoteDetail;
}

export interface InvalidRateQuote {
  carrierCode: string;
  carrierName: string;
  errorMessages: { severity: string; text: string; source: string }[];
}

export interface RatesResponse {
  id: number;
  rateQuotes: RateQuote[];
  invalidRateQuotes: InvalidRateQuote[];
}

export interface DispatchResponse {
  id: number;
  shipmentIdentifiers: ShipmentIdentifier[];
  capacityProviderBolUrl: string;
  capacityProviderPalletLabelUrl: string;
  capacityProviderPalletLabelExtendedUrl: string | null;
  capacityProviderPalletLabelsUrl: string | null;
  pickupNote: string | null;
  estimatedDeliveryDate: string | null;
  infoMessages?: { severity: string; text: string; source: string }[];
}

export interface TrackingStatus {
  timeStamp: string;
  addressLineOne?: string;
  addressLineTwo?: string | null;
  city: string;
  state: string;
  postalCode?: string;
  status: string;
  statusReason: string;
}

export interface P1ShipmentStatus {
  id: number;
  carrierCode: string;
  carrierName: string;
  status: string;
  actualPickupDate: string | null;
  actualDeliveryDate: string | null;
  shipmentIdentifiers: ShipmentIdentifier[];
  trackingStatuses: TrackingStatus[];
  totalCost: number;
}

export interface StatusResponse {
  shipments: P1ShipmentStatus[];
}

export interface DocumentsResponse {
  imageUrl: string;
}

// ============================================================================
// API Client Implementation
// ============================================================================

/**
 * Internal fetch helper with authentication, timeout, and error handling
 */
async function priority1Fetch<T>(
  endpoint: string,
  body: object
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${PRIORITY1_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "X-API-KEY": env.PRIORITY1_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = `Priority1 API error: ${response.status} ${response.statusText}`;
      try {
        const errorData = (await response.json()) as {
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
      throw new Error(errorMessage);
    }

    const data = (await response.json()) as T;
    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error(
          `Priority1 API request timeout after ${REQUEST_TIMEOUT_MS}ms`
        );
      }
      throw error;
    }
    throw new Error("Unknown error calling Priority1 API");
  }
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
  return priority1Fetch<SuggestedClassResponse>(
    "/v2/ltl/quotes/suggestedclass",
    request
  );
}

/**
 * Get carrier rate quotes for LTL shipment
 */
async function getRates(request: RatesRequest): Promise<RatesResponse> {
  return priority1Fetch<RatesResponse>("/v2/ltl/quotes/rates", request);
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
        { type: "PRO_NUMBER", value: `DRY-${mockId}`, primaryForType: true },
        { type: "SHIPMENT_ID", value: String(mockId), primaryForType: true },
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
  return priority1Fetch<DispatchResponse>("/v2/ltl/shipments/dispatch", request);
}

/**
 * Get shipment status by identifier (BOL, PRO number, or shipment ID).
 * In dry-run mode, simulates progression: dispatched → in_transit → delivered.
 */
async function getStatus(request: StatusRequest): Promise<StatusResponse> {
  if (isDryRun()) {
    const now = Date.now();
    // Simulate status based on current time — cycle every 10 minutes for easy testing
    const minutesSinceEpoch = Math.floor(now / 60000);
    const phase = minutesSinceEpoch % 10;

    let status: string;
    const trackingStatuses: TrackingStatus[] = [];
    const baseTime = new Date(now - 2 * 60 * 60 * 1000);

    if (phase < 3) {
      status = "Dispatched";
      trackingStatuses.push({
        timeStamp: baseTime.toISOString(),
        city: "Salt Lake City", state: "UT", postalCode: "84101",
        status: "Dispatched", statusReason: "Shipment dispatched to carrier",
      });
    } else if (phase < 7) {
      status = "InTransit";
      trackingStatuses.push(
        {
          timeStamp: baseTime.toISOString(),
          city: "Salt Lake City", state: "UT", postalCode: "84101",
          status: "Dispatched", statusReason: "Shipment dispatched to carrier",
        },
        {
          timeStamp: new Date(baseTime.getTime() + 60 * 60 * 1000).toISOString(),
          city: "Salt Lake City", state: "UT", postalCode: "84101",
          status: "PickedUp", statusReason: "Picked up by carrier",
        },
        {
          timeStamp: new Date(now - 30 * 60 * 1000).toISOString(),
          city: "Denver", state: "CO", postalCode: "80202",
          status: "InTransit", statusReason: "In transit to destination",
        },
      );
    } else {
      status = "Delivered";
      trackingStatuses.push(
        {
          timeStamp: baseTime.toISOString(),
          city: "Salt Lake City", state: "UT", postalCode: "84101",
          status: "Dispatched", statusReason: "Shipment dispatched to carrier",
        },
        {
          timeStamp: new Date(baseTime.getTime() + 60 * 60 * 1000).toISOString(),
          city: "Salt Lake City", state: "UT", postalCode: "84101",
          status: "PickedUp", statusReason: "Picked up by carrier",
        },
        {
          timeStamp: new Date(baseTime.getTime() + 3 * 60 * 60 * 1000).toISOString(),
          city: "Denver", state: "CO", postalCode: "80202",
          status: "InTransit", statusReason: "In transit to destination",
        },
        {
          timeStamp: new Date(now - 10 * 60 * 1000).toISOString(),
          city: "Portland", state: "OR", postalCode: "97201",
          status: "Delivered", statusReason: "Delivered to consignee",
        },
      );
    }

    console.log(`[Priority1 DRY-RUN] getStatus(${request.identifierValue}) → ${status}`);
    return {
      shipments: [{
        id: parseInt(request.identifierValue) || 99000,
        carrierCode: "DRY-CARRIER",
        carrierName: "Dry Run Freight Co.",
        status,
        actualPickupDate: phase >= 3 ? baseTime.toISOString() : null,
        actualDeliveryDate: phase >= 7 ? new Date(now - 10 * 60 * 1000).toISOString() : null,
        shipmentIdentifiers: [
          { type: request.identifierType, value: request.identifierValue, primaryForType: true },
        ],
        trackingStatuses,
        totalCost: 0,
      }],
    };
  }
  return priority1Fetch<StatusResponse>("/v2/ltl/shipments/status", request);
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
  await priority1Fetch<void>("/v2/ltl/shipments/cancel", request);
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
  return priority1Fetch<DocumentsResponse>("/v2/ltl/shipments/images", request);
}

// ============================================================================
// Exported API Object
// ============================================================================

export const priority1 = {
  getSuggestedClass,
  getRates,
  dispatch,
  getStatus,
  cancel,
  getDocuments,
};
