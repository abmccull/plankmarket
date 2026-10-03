import { z } from "zod";
import { verificationDocumentId } from "@/lib/verification-documents";
import type { VerificationResult } from "@/server/services/verification-result";

export const VERIFICATION_AUTOMATION_POLICY = "document-evidence-v1";
export const VERIFICATION_JEV_MODEL = "jev-1.13.0";

const probability = z.number().finite().min(0).max(1);
const noulAnswer = z.object({ type: z.literal("noul"), noul: probability });
const jevResponse = z.object({
  model: z.literal(VERIFICATION_JEV_MODEL),
  answers: z.object({
    domainFit: noulAnswer,
    issuerFit: noulAnswer,
    concern: noulAnswer,
  }),
});

export type JevVerificationSignals = {
  model: string;
  domainFit: number;
  issuerFit: number;
  concern: number;
};

export function isVerificationAutoApprovalEnabled(): boolean {
  return (
    process.env.VERIFICATION_AUTO_APPROVAL_ENABLED === "true" &&
    process.env.TYPESAFE_VERIFICATION_ENABLED === "true" &&
    process.env.ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS === "true" &&
    Boolean(process.env.VERIFICATION_DOCUMENT_EGRESS_APPROVAL_REFERENCE?.trim()) &&
    Boolean(process.env.VERIFICATION_AUTO_APPROVAL_EVALUATION_REFERENCE?.trim())
  );
}

/** Jev only sees a small summary. It never receives an EIN, document bytes, address, or email. */
export async function getJevVerificationSignals(input: {
  businessName: string;
  websiteDomain: string;
  documentType: string;
  issuer: string;
}): Promise<JevVerificationSignals | null> {
  if (
    process.env.TYPESAFE_VERIFICATION_ENABLED !== "true" ||
    !process.env.VERIFICATION_DOCUMENT_EGRESS_APPROVAL_REFERENCE?.trim()
  ) return null;
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return null;

  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: VERIFICATION_JEV_MODEL,
        state: {
          businessName: input.businessName.slice(0, 255),
          websiteDomain: input.websiteDomain.slice(0, 255),
          documentType: input.documentType,
          issuer: input.issuer.slice(0, 255),
        },
        questions: {
          domainFit: {
            type: "noul",
            instructions: "Do `businessName` and `websiteDomain` plausibly identify the same business? Judge wording only; do not assume the website exists or is controlled by the applicant.",
          },
          issuerFit: {
            type: "noul",
            instructions: "Does `issuer` plausibly name a US government authority that issues the stated `documentType`? Judge wording only; do not claim the document is genuine.",
          },
          concern: {
            type: "noul",
            instructions: "Do these fields contain an obvious placeholder, contradiction, or suspicious mismatch warranting manual review? Lack of external proof alone is not a yes.",
          },
        },
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`TypeSafe HTTP ${response.status}`);
    const parsed = jevResponse.parse(await response.json());
    return {
      model: parsed.model,
      domainFit: parsed.answers.domainFit.noul,
      issuerFit: parsed.answers.issuerFit.noul,
      concern: parsed.answers.concern.noul,
    };
  } catch (error) {
    console.error("Jev verification signals unavailable", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

export function websiteDomain(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!/[.]/.test(url.hostname) || !["http:", "https:"].includes(url.protocol)) return null;
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function unexpired(date: string | null, today: Date): boolean {
  if (!date) return false;
  const parsed = new Date(`${date}T23:59:59Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && parsed >= today;
}

export type VerificationAutomationReason =
  | "automation_disabled"
  | "unsupported_account"
  | "document_not_inspected"
  | "document_not_eligible"
  | "document_unreadable_or_suspicious"
  | "business_name_mismatch"
  | "ein_mismatch"
  | "state_mismatch"
  | "issuer_missing"
  | "document_expired_or_undated"
  | "email_not_confirmed"
  | "business_domain_mismatch"
  | "advisory_checks_failed"
  | "jev_unavailable_or_uncertain";

export function assessVerificationAutoApproval(input: {
  role: string;
  businessName: string;
  einTaxId: string;
  businessState: string | null;
  businessWebsite: string | null;
  email: string;
  emailConfirmed: boolean;
  documentReference: string | null;
  result: VerificationResult & { documentAttached: boolean };
  jev: JevVerificationSignals | null;
  now?: Date;
  enabled?: boolean;
}): { decision: "auto_approve" | "manual_review"; reasons: VerificationAutomationReason[] } {
  const reasons: VerificationAutomationReason[] = [];
  const doc = input.result.documentEvidence;
  const domain = websiteDomain(input.businessWebsite);
  const emailDomain = input.email.toLowerCase().split("@")[1] ?? null;

  if (!(input.enabled ?? isVerificationAutoApprovalEnabled())) reasons.push("automation_disabled");
  if (input.role !== "buyer" && input.role !== "seller") reasons.push("unsupported_account");
  if (!verificationDocumentId(input.documentReference) || !input.result.documentAttached || !doc) {
    reasons.push("document_not_inspected");
  }
  if (!doc || !["business_license", "tax_ein_notice"].includes(doc.documentType)) reasons.push("document_not_eligible");
  if (!doc?.legible || doc.possibleTampering) reasons.push("document_unreadable_or_suspicious");
  if (!doc?.businessName || normalizedName(doc.businessName) !== normalizedName(input.businessName)) reasons.push("business_name_mismatch");
  if (!doc?.einLast4 || doc.einLast4 !== input.einTaxId.replace(/\D/g, "").slice(-4) || !/^\d{2}-?\d{7}$/.test(input.einTaxId.trim())) reasons.push("ein_mismatch");
  if (!doc?.state || doc.state !== input.businessState?.toUpperCase()) reasons.push("state_mismatch");
  if (!doc?.issuer?.trim()) reasons.push("issuer_missing");
  if (doc?.documentType === "business_license" && !unexpired(doc.expiresAt, input.now ?? new Date())) reasons.push("document_expired_or_undated");
  if (!input.emailConfirmed) reasons.push("email_not_confirmed");
  if (!domain || emailDomain !== domain) reasons.push("business_domain_mismatch");
  const checks = input.result.checks;
  if (!input.result.approved || input.result.score < 95 || !checks.einFormat.pass || !checks.websiteAnalysis.pass || !checks.documentAnalysis.pass || !checks.crossReference.pass || checks.redFlags.found) reasons.push("advisory_checks_failed");
  if (!input.jev || input.jev.domainFit < 0.95 || input.jev.issuerFit < 0.95 || input.jev.concern > 0.05) reasons.push("jev_unavailable_or_uncertain");

  return { decision: reasons.length ? "manual_review" : "auto_approve", reasons };
}
