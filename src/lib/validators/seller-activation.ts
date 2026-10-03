import { z } from "zod";

/** Drafts may be incomplete; submission validates the complete seller evidence. */
export const sellerActivationDraftSchema = z.object({
  requestId: z.string().uuid(),
  expectedRevision: z.number().int().positive().nullable(),
  businessWebsite: z.string().trim().max(2048).optional(),
  einTaxId: z.string().trim().max(11).optional(),
  documentId: z.string().uuid().nullable().optional(),
}).strict();

export const sellerActivationSubmitSchema = z.object({
  requestId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
}).strict();

export const sellerActivationReviewSchema = z.object({
  id: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  reviewRequestId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().min(1, "Explain the decision for the applicant").max(2000),
}).strict();

export const sellerActivationReconcileSchema = z.object({ id: z.string().uuid() }).strict();

export type SellerActivationDraftInput = z.infer<typeof sellerActivationDraftSchema>;
export type SellerActivationSubmitInput = z.infer<typeof sellerActivationSubmitSchema>;
export type SellerActivationReviewInput = z.infer<typeof sellerActivationReviewSchema>;
