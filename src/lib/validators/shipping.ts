import { z } from "zod";

export const getShippingQuotesSchema = z.object({
  listingId: z.string().uuid(),
  destinationZip: z.string().min(5).max(10),
  quantitySqFt: z.number().positive(),
  // Manual overrides when listing lacks freight data
  overrideOriginZip: z.string().min(5).max(10).optional(),
  overridePalletWeight: z.number().positive().optional(),
  overridePalletLength: z.number().positive().optional(),
  overridePalletWidth: z.number().positive().optional(),
  overridePalletHeight: z.number().positive().optional(),
});

export interface ShippingQuote {
  quoteId: number; // Priority1 rateQuote.id
  carrierName: string;
  carrierScac: string;
  shippingPrice: number; // what buyer pays (carrier rate + margin)
  transitDays: number;
  estimatedDelivery: string; // ISO date string
  quoteExpiresAt: string; // ISO date string
}

export type GetShippingQuotesInput = z.infer<typeof getShippingQuotesSchema>;
