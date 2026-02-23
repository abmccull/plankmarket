import { env } from "@/env";

// Base configuration
const PRIORITY1_BASE_URL = "https://api.priority1.com";
const REQUEST_TIMEOUT_MS = 30000;

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
 * Dispatch a shipment with a carrier
 */
async function dispatch(request: DispatchRequest): Promise<DispatchResponse> {
  return priority1Fetch<DispatchResponse>("/v2/ltl/shipments/dispatch", request);
}

/**
 * Get shipment status by identifier (BOL, PRO number, or shipment ID)
 */
async function getStatus(request: StatusRequest): Promise<StatusResponse> {
  return priority1Fetch<StatusResponse>("/v2/ltl/shipments/status", request);
}

/**
 * Cancel a shipment by ID
 */
async function cancel(request: CancelRequest): Promise<void> {
  await priority1Fetch<void>("/v2/ltl/shipments/cancel", request);
}

/**
 * Get shipment documents (BOL, delivery receipt)
 */
async function getDocuments(
  request: DocumentsRequest
): Promise<DocumentsResponse> {
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
