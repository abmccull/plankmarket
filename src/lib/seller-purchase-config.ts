import {
  normalizeUsStateCodeList,
  type SellingTerritoryMode,
} from "@/lib/selling-territory";

export interface SellerPurchaseConfigSource {
  canSplitLots?: boolean | null;
  fullLotOnly?: boolean | null;
  partialQuantityMarkupPercent?: number | null;
  defaultAllowOffers?: boolean | null;
  allowSampleRequests?: boolean | null;
  sellingTerritoryMode?: string | null;
  territoryMode?: string | null;
  allowedDestinationStates?: readonly (string | null | undefined)[] | null;
  taxRegisteredStates?: readonly (string | null | undefined)[] | null;
  taxNexusStates?: readonly (string | null | undefined)[] | null;
  freightPaymentMode?: string | null;
  sellerFreightStates?: readonly (string | null | undefined)[] | null;
  freightDropCharge?: number | null;
}

export interface SellerPurchaseConfig {
  canSplitLots: boolean;
  fullLotOnly: boolean;
  partialQuantityMarkupPercent: number | null;
  defaultAllowOffers: boolean;
  allowSampleRequests: boolean;
  sellingTerritoryMode: SellingTerritoryMode;
  allowedDestinationStates: string[];
  taxRegisteredStates: string[];
  freightPaymentMode: "buyer_pays" | "seller_pays";
  sellerFreightStates: string[];
  freightDropCharge: number | null;
}

export function toSellerPurchaseConfig(
  input: SellerPurchaseConfigSource | null | undefined,
): SellerPurchaseConfig {
  const allowedDestinationStates = normalizeUsStateCodeList(
    input?.allowedDestinationStates,
  ).codes;
  const taxRegisteredStates = normalizeUsStateCodeList(
    input?.taxRegisteredStates ?? input?.taxNexusStates,
  ).codes;
  const sellerFreightStates = normalizeUsStateCodeList(
    input?.sellerFreightStates,
  ).codes;
  const fullLotOnly = input?.fullLotOnly ?? !(input?.canSplitLots ?? false);
  const canSplitLots = input?.canSplitLots ?? !fullLotOnly;

  return {
    canSplitLots,
    fullLotOnly,
    partialQuantityMarkupPercent:
      input?.partialQuantityMarkupPercent != null
        ? Number(input.partialQuantityMarkupPercent)
        : null,
    defaultAllowOffers: input?.defaultAllowOffers ?? true,
    allowSampleRequests: input?.allowSampleRequests ?? false,
    sellingTerritoryMode:
      (input?.sellingTerritoryMode ?? input?.territoryMode) === "allowed_states"
        ? "allowed_states"
        : "unrestricted",
    allowedDestinationStates,
    taxRegisteredStates,
    freightPaymentMode:
      input?.freightPaymentMode === "seller_pays"
        ? "seller_pays"
        : "buyer_pays",
    sellerFreightStates,
    freightDropCharge:
      input?.freightDropCharge != null
        ? Number(input.freightDropCharge)
        : null,
  };
}
