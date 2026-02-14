/**
 * Zod helpers for content filtering in validators
 */

import { z } from "zod";
import { analyzeContent, getBlockedContentMessage } from "./index";

/**
 * Zod superRefine helper to validate content for contact information
 *
 * Usage:
 * ```typescript
 * const schema = z.object({
 *   message: z.string().superRefine(noContactInfo("Message")),
 *   description: z.string().superRefine(noContactInfo("Description")),
 * });
 * ```
 *
 * @param fieldName - User-friendly field name for error messages (e.g., "Message", "Description")
 * @returns Zod refinement function
 */
export function noContactInfo(fieldName: string) {
  return (val: string, ctx: z.RefinementCtx) => {
    // Analyze content for contact information
    const result = analyzeContent(val);

    // If high-confidence detections found, add validation error
    if (!result.allowed) {
      const message = getBlockedContentMessage(
        fieldName,
        result.highConfidenceDetections
      );

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        params: {
          detections: result.highConfidenceDetections,
        },
      });
    }

    // Medium-confidence detections are logged but don't block
    // (They'll be stored for admin review via the detections field)
  };
}

/**
 * Alternative: Zod transform that returns both validation result and detections
 * Useful when you need to log medium-confidence detections for admin review
 *
 * Usage:
 * ```typescript
 * const schema = z.object({
 *   message: z.string().transform(validateAndDetect("Message")),
 * });
 * ```
 *
 * Returns: { value: string, detections: Detection[] }
 */
export function validateAndDetect(fieldName: string) {
  return (val: string, ctx: z.RefinementCtx) => {
    const result = analyzeContent(val);

    // Block if high-confidence detections found
    if (!result.allowed) {
      const message = getBlockedContentMessage(
        fieldName,
        result.highConfidenceDetections
      );

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        params: {
          detections: result.highConfidenceDetections,
        },
      });

      return z.NEVER;
    }

    // Return value with all detections (including medium-confidence for logging)
    return {
      value: val,
      detections: result.detections,
    };
  };
}
