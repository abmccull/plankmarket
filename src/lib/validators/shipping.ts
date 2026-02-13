import { z } from "zod";

export const getShippingQuotesSchema = z.object({
  listingId: z.string().uuid(),
  destinationZip: z.string().min(5).max(10),
  quantitySqFt: z.number().positive(),
});

export interface ShippingQuote {
  quoteId: number; // Priority1 rateQuote.id
  carrierName: string;
  carrierScac: string;
  shippingPrice: number; // carrier rate + 15% margin (what buyer pays)
  carrierRate: number; // Priority1's raw rate
  transitDays: number;
  estimatedDelivery: string; // ISO date string
  quoteExpiresAt: string; // ISO date string
}

export type GetShippingQuotesInput = z.infer<typeof getShippingQuotesSchema>;
