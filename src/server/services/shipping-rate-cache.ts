import type { Redis } from "@upstash/redis";
import { createHash } from "crypto";
import { z } from "zod";
import {
  addBusinessDays,
  formatPriority1Date,
  formatPriority1DateValue,
  isQuoteBookable,
  SHIPPING_OFFER_BOOKABILITY_BUFFER_MS,
  SHIPPING_RATE_RESPONSE_CACHE_TTL_CAP_SECONDS,
} from "./shipping-workflow";

export const SHIPPING_RATE_RESPONSE_CACHE_PREFIX =
  "shipping-rate-response";
const SHIPPING_RATE_RESPONSE_CACHE_VERSION = 2;
const shippingRateCacheProviderModeSchema = z.enum(["dry_run", "live"]);

const shippingRateCacheQuoteSchema = z
  .object({
    quoteId: z.number().int().positive(),
    carrierName: z.string().min(1),
    carrierScac: z.string().min(1),
    carrierRate: z.number().nonnegative(),
    transitDays: z.number().int().nonnegative(),
    estimatedDelivery: z.string().datetime(),
    quoteExpiresAt: z.string().datetime(),
  })
  .strict();

const shippingRateCacheEntrySchema = z
  .object({
    version: z.literal(SHIPPING_RATE_RESPONSE_CACHE_VERSION),
    providerMode: shippingRateCacheProviderModeSchema,
    quotes: z.array(shippingRateCacheQuoteSchema),
  })
  .strict();

export type ShippingRateCacheQuote = z.infer<
  typeof shippingRateCacheQuoteSchema
>;
export type ShippingRateCacheProviderMode = z.infer<
  typeof shippingRateCacheProviderModeSchema
>;

export interface ShippingRateCacheKeyInput {
  providerMode: ShippingRateCacheProviderMode;
  listingId: string;
  title: string;
  condition: string;
  originZip: string;
  destinationZip: string;
  pickupDate: string;
  quantitySqFt: number;
  palletsNeeded: number;
  piecesPerPallet: number;
  palletWeight: number;
  palletLength: number;
  palletWidth: number;
  palletHeight: number;
  freightClass: string;
  nmfcCode: string | null;
  freightPaymentMode: string | null;
  sellerFreightStates: readonly string[] | null;
  freightDropCharge: number | null;
  accessorialCodes: readonly string[];
}

export interface Priority1RateQuoteLike {
  id: number;
  carrierName: string | null;
  carrierCode: string | null;
  transitDays: number;
  deliveryDate?: string | null;
  expirationDate?: string | null;
  rateQuoteDetail: {
    total: number;
  };
}

export function buildShippingRateResponseCacheKey(
  input: ShippingRateCacheKeyInput,
): string {
  const normalized = {
    version: SHIPPING_RATE_RESPONSE_CACHE_VERSION,
    providerMode: input.providerMode,
    listingId: input.listingId,
    title: input.title,
    condition: input.condition,
    originZip: input.originZip,
    destinationZip: input.destinationZip,
    pickupDate: input.pickupDate,
    quantitySqFt: roundToFour(input.quantitySqFt),
    palletsNeeded: input.palletsNeeded,
    piecesPerPallet: input.piecesPerPallet,
    palletWeight: roundToFour(input.palletWeight),
    palletLength: roundToFour(input.palletLength),
    palletWidth: roundToFour(input.palletWidth),
    palletHeight: roundToFour(input.palletHeight),
    freightClass: input.freightClass,
    nmfcCode: input.nmfcCode ?? null,
    freightPaymentMode: input.freightPaymentMode ?? null,
    sellerFreightStates: [...(input.sellerFreightStates ?? [])].sort(),
    freightDropCharge:
      input.freightDropCharge == null
        ? null
        : roundToFour(input.freightDropCharge),
    accessorialCodes: [...input.accessorialCodes].sort(),
  };

  const digest = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");

  return `${SHIPPING_RATE_RESPONSE_CACHE_PREFIX}:${digest}`;
}

export function normalizePriority1RateQuotes(params: {
  quotes: Priority1RateQuoteLike[];
  now: Date;
  pickupDate: Date;
}): ShippingRateCacheQuote[] {
  return params.quotes.flatMap((quote) => {
    const carrierRate = quote.rateQuoteDetail.total;
    // Require a positive carrier rate — zero rates fail later at order consume.
    if (
      !quote.id ||
      !quote.carrierName ||
      !quote.carrierCode ||
      !Number.isFinite(carrierRate) ||
      carrierRate <= 0 ||
      !Number.isInteger(quote.transitDays) ||
      quote.transitDays < 1
    ) {
      return [];
    }

    // Never invent residual life — missing provider expiry is unbookable.
    if (!quote.expirationDate) {
      return [];
    }
    const quoteExpiresAt = new Date(quote.expirationDate);
    if (
      Number.isNaN(quoteExpiresAt.getTime()) ||
      !isQuoteBookable(
        quoteExpiresAt,
        params.now.getTime(),
        SHIPPING_OFFER_BOOKABILITY_BUFFER_MS,
      )
    ) {
      return [];
    }

    const estimatedDeliveryDate = quote.deliveryDate
      ? new Date(quote.deliveryDate)
      : addBusinessDays(params.pickupDate, quote.transitDays);
    if (Number.isNaN(estimatedDeliveryDate.getTime())) {
      return [];
    }

    const estimatedDeliveryWindowDate =
      formatPriority1DateValue(estimatedDeliveryDate);
    if (
      estimatedDeliveryWindowDate < formatPriority1Date(params.pickupDate)
    ) {
      return [];
    }

    return [
      {
        quoteId: quote.id,
        carrierName: quote.carrierName,
        carrierScac: quote.carrierCode,
        carrierRate,
        transitDays: quote.transitDays,
        estimatedDelivery: estimatedDeliveryDate.toISOString(),
        quoteExpiresAt: quoteExpiresAt.toISOString(),
      },
    ];
  });
}

export async function readShippingRateResponseCache(params: {
  redisClient: Redis;
  cacheKey: string;
  providerMode: ShippingRateCacheProviderMode;
  now?: Date;
}): Promise<ShippingRateCacheQuote[] | null> {
  const now = params.now ?? new Date();
  const cached = await params.redisClient.get(params.cacheKey);
  if (!cached) return null;

  const parsed = shippingRateCacheEntrySchema.safeParse(
    typeof cached === "string" ? JSON.parse(cached) : cached,
  );
  if (!parsed.success) return null;
  if (parsed.data.providerMode !== params.providerMode) return null;

  const bookableQuotes = parsed.data.quotes.filter((quote) => {
    const expiresAt = new Date(quote.quoteExpiresAt);
    return (
      !Number.isNaN(expiresAt.getTime()) &&
      isQuoteBookable(
        expiresAt,
        now.getTime(),
        SHIPPING_OFFER_BOOKABILITY_BUFFER_MS,
      )
    );
  });

  // Any thinning forces a re-quote so buyers never see a leftover subset.
  if (bookableQuotes.length === 0) return null;
  if (bookableQuotes.length < parsed.data.quotes.length) return null;

  return bookableQuotes;
}

export async function writeShippingRateResponseCache(params: {
  redisClient: Redis;
  cacheKey: string;
  providerMode: ShippingRateCacheProviderMode;
  quotes: ShippingRateCacheQuote[];
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  if (params.quotes.length === 0) return;

  const bookableQuotes = params.quotes.filter((quote) =>
    isQuoteBookable(
      quote.quoteExpiresAt,
      now.getTime(),
      SHIPPING_OFFER_BOOKABILITY_BUFFER_MS,
    ),
  );
  if (bookableQuotes.length === 0) {
    return;
  }

  const bookableResidualSeconds = bookableQuotes
    .map((quote) => {
      const expiresAtMs = new Date(quote.quoteExpiresAt).getTime();
      if (!Number.isFinite(expiresAtMs)) return 0;
      return Math.floor(
        (expiresAtMs - now.getTime() - SHIPPING_OFFER_BOOKABILITY_BUFFER_MS) /
          1000,
      );
    })
    .filter((seconds) => seconds > 0);
  if (bookableResidualSeconds.length === 0) {
    return;
  }
  const earliestBookableResidual = Math.min(...bookableResidualSeconds);

  const ttlSeconds = Math.min(
    SHIPPING_RATE_RESPONSE_CACHE_TTL_CAP_SECONDS,
    Math.max(1, earliestBookableResidual),
  );

  await params.redisClient.set(
    params.cacheKey,
    JSON.stringify({
      version: SHIPPING_RATE_RESPONSE_CACHE_VERSION,
      providerMode: params.providerMode,
      quotes: bookableQuotes,
    }),
    { ex: ttlSeconds },
  );
}

function roundToFour(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
