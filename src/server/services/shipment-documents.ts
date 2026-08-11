import type { DispatchResponse } from "./priority1";
import { Priority1ApiError, priority1 } from "./priority1";

/**
 * Resolve the best pallet-label URL from a Priority1 dispatch response.
 * Extended/plural fields are validated by the client schema then previously
 * discarded — prefer primary, then extended, then plural.
 */
export function resolveDispatchLabelUrl(
  dispatch: Pick<
    DispatchResponse,
    | "capacityProviderPalletLabelUrl"
    | "capacityProviderPalletLabelExtendedUrl"
    | "capacityProviderPalletLabelsUrl"
  >,
): string | null {
  return (
    dispatch.capacityProviderPalletLabelUrl ??
    dispatch.capacityProviderPalletLabelExtendedUrl ??
    dispatch.capacityProviderPalletLabelsUrl ??
    null
  );
}

export function resolveDispatchBolUrl(
  dispatch: Pick<DispatchResponse, "capacityProviderBolUrl">,
): string | null {
  return dispatch.capacityProviderBolUrl ?? null;
}

export type ShipmentDocumentIdentifier =
  | { proNumber: string }
  | { bolNumber: string };
export type ShipmentDocumentIdentifierInput =
  | ShipmentDocumentIdentifier
  | readonly ShipmentDocumentIdentifier[]
  | null;

export type DocumentFetchResult = {
  url: string | null;
  error: string | null;
  /** True when the failure is unlikely to self-heal (allowlist/schema). */
  permanent: boolean;
};

function classifyDocumentFetchError(error: unknown): DocumentFetchResult {
  if (error instanceof Priority1ApiError) {
    // Do not treat bare gateway 502 as permanent — that is often transient.
    // Permanent = allowlist / URL validation style failures only.
    const permanent =
      /invalid|not allowed|allowlist|malformed|credentials|must use HTTPS|default HTTPS port|host/i.test(
        error.message,
      );
    return {
      url: null,
      error: error.message,
      permanent,
    };
  }
  const message =
    error instanceof Error ? error.message : "Unknown document fetch error";
  return { url: null, error: message, permanent: false };
}

function normalizeDocumentIdentifiers(
  input: ShipmentDocumentIdentifierInput,
): ShipmentDocumentIdentifier[] {
  if (!input) return [];
  return Array.isArray(input)
    ? [...input]
    : [input as ShipmentDocumentIdentifier];
}

export async function fetchPriority1DocumentUrl(
  shipmentImageTypeId: Parameters<
    typeof priority1.getDocuments
  >[0]["shipmentImageTypeId"],
  identifiers: ShipmentDocumentIdentifierInput,
): Promise<DocumentFetchResult> {
  const candidates = normalizeDocumentIdentifiers(identifiers);
  if (candidates.length === 0) {
    return {
      url: null,
      error: "No PRO/BOL identifier available",
      permanent: false,
    };
  }

  const failures: DocumentFetchResult[] = [];
  for (const identifier of candidates) {
    try {
      const document = await priority1.getDocuments({
        shipmentImageTypeId,
        imageFormatTypeId: "PDF",
        ...identifier,
      });
      if (document.imageUrl) {
        return { url: document.imageUrl, error: null, permanent: false };
      }
      failures.push({
        url: null,
        error: "Priority1 did not return a document URL",
        permanent: false,
      });
    } catch (error) {
      failures.push(classifyDocumentFetchError(error));
    }
  }

  const messages = [
    ...new Set(
      failures
        .map((failure) => failure.error)
        .filter((message): message is string => Boolean(message)),
    ),
  ];
  return {
    url: null,
    error: messages.join("; ") || "Priority1 document lookup failed",
    permanent:
      failures.length > 0 && failures.every((failure) => failure.permanent),
  };
}

/**
 * Best-effort Bill of Lading fetch when local bolUrl is missing.
 */
export async function fetchPriority1BillOfLadingUrl(
  identifiers: ShipmentDocumentIdentifierInput,
): Promise<DocumentFetchResult> {
  return fetchPriority1DocumentUrl("BillOfLading", identifiers);
}

/**
 * Best-effort pallet label fetch when local labelUrl is missing.
 */
export async function fetchPriority1PalletLabelUrl(
  identifiers: ShipmentDocumentIdentifierInput,
): Promise<DocumentFetchResult> {
  return fetchPriority1DocumentUrl("PalletLabel", identifiers);
}

export function shipmentDocumentIdentifiersFrom(params: {
  proNumber?: string | null;
  bolNumber?: string | null;
  trackingNumber?: string | null;
}): ShipmentDocumentIdentifier[] {
  if (params.proNumber) return [{ proNumber: params.proNumber }];
  if (params.bolNumber) return [{ bolNumber: params.bolNumber }];
  if (params.trackingNumber) {
    // Legacy orders.tracking_number stored either value without a discriminator.
    // Try the conventional PRO lookup first, then the BOL-specific lookup.
    return [
      { proNumber: params.trackingNumber },
      { bolNumber: params.trackingNumber },
    ];
  }
  return [];
}

export function shipmentDocumentIdentifierFrom(params: {
  proNumber?: string | null;
  bolNumber?: string | null;
  trackingNumber?: string | null;
}): ShipmentDocumentIdentifier | null {
  return shipmentDocumentIdentifiersFrom(params)[0] ?? null;
}
