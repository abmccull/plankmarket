import { z } from "zod";
import type { FreightFundingMode } from "@/lib/freight-funding";

export const getShippingQuotesSchema = z.object({
  listingId: z.string().uuid(),
  destinationZip: z
    .string()
    .regex(/^\d{5}(?:-\d{4})?$/, "Enter a valid US ZIP code"),
  quantitySqFt: z.number().positive(),
}).strict();

export interface ShippingQuote {
  quoteId: number; // Priority1 rateQuote.id
  quoteToken: string; // opaque server-issued token bound to checkout context
  carrierName: string;
  carrierScac: string;
  shippingPrice: number; // full booked freight quote (carrier rate + margin)
  buyerFreightCharge: number;
  sellerFreightContribution: number;
  freightFundingMode: FreightFundingMode;
  transitDays: number;
  estimatedDelivery: string; // ISO date string
  quoteExpiresAt: string; // ISO date string
}

export type GetShippingQuotesInput = z.infer<typeof getShippingQuotesSchema>;
