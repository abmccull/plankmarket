import { z } from "zod";
const states = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");
export const resaleStateSchema = z.string().trim().toUpperCase().refine(s => states.includes(s), "Choose a US state");
const text = (max = 255) => z.string().trim().min(1, "Required").max(max);
export const resaleSubmissionSchema = z.object({
  requestId: z.string().uuid(),
  state: resaleStateSchema,
  ruleRevision: z.number().int().positive(),
  documentId: z.string().uuid().nullable(),
  format: z.enum(["upload", "texas_electronic"]),
  legalName: text(), address: text(500), city: text(100), businessState: resaleStateSchema,
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, "Enter a US ZIP code"), phone: text(30),
  permitNumber: text(80), permitState: resaleStateSchema,
  businessDescription: text(1000), itemsDescription: text(1000), signerName: text(), signerTitle: text(100),
  attested: z.literal(true, { error: "Confirm the resale declaration" }),
}).superRefine((v, ctx) => {
  if (v.format === "upload" && !v.documentId) ctx.addIssue({ code: "custom", path: ["documentId"], message: "Upload a completed, signed resale certificate" });
  if (v.format === "texas_electronic" && (v.state !== "TX" || v.permitState !== "TX" || !/^\d{11}$/.test(v.permitNumber) || v.documentId)) ctx.addIssue({ code: "custom", path: ["permitNumber"], message: "This electronic form requires an 11-digit Texas permit number. Otherwise upload your completed certificate." });
});
export const resaleRuleSchema = z.object({ state: resaleStateSchema, expectedRevision: z.number().int().nonnegative(), enabled: z.boolean(), policyReference: text(1000), recipientName: text(), recipientAddress: text(500), freightExempt: z.boolean(), electronicTexas: z.boolean() }).refine(v => !v.electronicTexas || v.state === "TX", "Electronic certificates are supported only for Texas");
export const resaleReviewSchema = z.object({ id: z.string().uuid(), expectedUpdatedAt: z.date(), status: z.enum(["approved", "rejected", "revoked"]), note: text(2000), validFrom: z.date().nullable(), expiresAt: z.date().nullable() }).refine(v => v.status !== "approved" || (v.validFrom && (!v.expiresAt || v.expiresAt > v.validFrom)), "Approval requires a valid start date and, if provided, a later expiry date");
