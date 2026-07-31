import { z } from "zod";

const verificationCheckSchema = z
  .object({
    pass: z.boolean(),
    note: z.string().max(1_000),
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
