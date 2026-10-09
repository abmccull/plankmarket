import { z } from "zod";

const verificationCheckSchema = z
  .object({
    pass: z.boolean(),
    note: z.string().max(1_000),
  })
  .strict();

export const verificationDocumentEvidenceSchema = z
  .object({
    documentType: z.enum(["business_license", "tax_ein_notice", "other", "unknown"]),
    businessName: z.string().max(255).nullable(),
    einLast4: z.string().regex(/^\d{4}$/).nullable(),
    state: z.string().regex(/^[A-Z]{2}$/).nullable(),
    issuer: z.string().max(255).nullable(),
    expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    legible: z.boolean(),
    possibleTampering: z.boolean(),
  })
  .strict();

export const verificationResultSchema = z
  .object({
    score: z.number().finite().min(0).max(100),
    approved: z.boolean(),
    reasoning: z.string().max(2_000),
    checks: z
      .object({
        einFormat: verificationCheckSchema,
        websiteAnalysis: verificationCheckSchema,
        documentAnalysis: verificationCheckSchema,
        crossReference: verificationCheckSchema,
        redFlags: z
          .object({
            found: z.boolean(),
            note: z.string().max(1_000),
          })
          .strict(),
      })
      .strict(),
    // Extracted observations are optional so older advisory results remain readable.
    // They are never sufficient by themselves to authorize an account.
    documentEvidence: verificationDocumentEvidenceSchema.optional(),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (result.approved !== (result.score >= 90)) {
      ctx.addIssue({
        code: "custom",
        path: ["approved"],
        message: "approved must match the documented score threshold",
      });
    }
  });

export type VerificationResult = z.infer<typeof verificationResultSchema>;
