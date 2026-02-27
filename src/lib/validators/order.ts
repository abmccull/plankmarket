import { z } from "zod";
import { isValidPhoneNumber } from "libphonenumber-js";

export const createOrderSchema = z.object({
  listingId: z.string().uuid(),
  quantitySqFt: z.number().positive("Quantity must be positive"),
  shippingName: z.string().min(2, "Shipping name is required"),
  shippingAddress: z.string().min(5, "Shipping address is required"),
  shippingCity: z.string().min(2, "City is required"),
  shippingState: z.string().length(2, "State must be 2 characters"),
  shippingZip: z.string().min(5, "ZIP code is required"),
  shippingPhone: z
    .string()
    .refine((val) => !val || isValidPhoneNumber(val, "US"), {
      message: "Please enter a valid phone number",
    })
    .optional(),
  selectedQuoteToken: z.string().min(1).optional(),
  // Deprecated fallback for short-lived backward compatibility
  selectedQuoteId: z.string().optional(),
  selectedCarrier: z.string().optional(),
  shippingPrice: z.number().optional(),
  estimatedTransitDays: z.number().int().optional(),
  quoteExpiresAt: z.string().datetime().optional(),
});

export const updateOrderStatusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum([
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ]),
  trackingNumber: z.string().optional(),
  carrier: z.string().optional(),
  notes: z.string().optional(),
});

export const createOrderFromOfferSchema = z.object({
  offerId: z.string().uuid(),
  shippingName: z.string().min(2, "Shipping name is required"),
  shippingAddress: z.string().min(5, "Shipping address is required"),
  shippingCity: z.string().min(2, "City is required"),
  shippingState: z.string().length(2, "State must be 2 characters"),
  shippingZip: z.string().min(5, "ZIP code is required"),
  shippingPhone: z
    .string()
    .refine((val) => !val || isValidPhoneNumber(val, "US"), {
      message: "Please enter a valid phone number",
    })
    .optional(),
  selectedQuoteToken: z.string().min(1).optional(),
  // Deprecated fallback for short-lived backward compatibility
  selectedQuoteId: z.string().optional(),
  selectedCarrier: z.string().optional(),
  shippingPrice: z.number().optional(),
  estimatedTransitDays: z.number().int().optional(),
  quoteExpiresAt: z.string().datetime().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateOrderFromOfferInput = z.infer<typeof createOrderFromOfferSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
