import { z } from "zod";

export const TAX_MODES = [
  "disabled",
  "platform_liable",
  "connected_account_liable",
] as const;
export type TaxMode = (typeof TAX_MODES)[number];

export const TAX_LIABILITY_OWNERS = [
  "none",
  "platform",
  "connected_account",
] as const;
export type TaxLiabilityOwner = (typeof TAX_LIABILITY_OWNERS)[number];

export const BUYER_FEE_TAX_TREATMENTS = [
  "undecided",
  "excluded",
  "taxable",
] as const;
export type BuyerFeeTaxTreatment =
  (typeof BUYER_FEE_TAX_TREATMENTS)[number];

export const LISTING_TAX_CODE_STATUSES = [
  "unassigned",
  "pending_review",
  "verified",
] as const;
export type ListingTaxCodeStatus =
  (typeof LISTING_TAX_CODE_STATUSES)[number];

export const ORDER_TAX_STATUSES = [
  "disabled",
  "calculated",
  "committed",
  "reconciliation_required",
] as const;
export type OrderTaxStatus = (typeof ORDER_TAX_STATUSES)[number];

export const TAX_REVERSAL_STATUSES = [
  "not_required",
  "pending",
  "partially_reversed",
  "reversed",
  "reconciliation_required",
] as const;
export type TaxReversalStatus = (typeof TAX_REVERSAL_STATUSES)[number];

const stripeTaxCodeSchema = z
  .string()
  .trim()
  .regex(
    /^txcd_\d+$/,
    "must be an explicitly approved Stripe Tax code such as txcd_...",
  );

const taxPolicyInputSchema = z
  .object({
    mode: z.enum(TAX_MODES),
    version: z.coerce.number().int().positive(),
    legalDecisionAcknowledged: z.boolean(),
    legalDecisionReference: z.string().trim().min(1).nullable(),
    shippingTaxCode: z.string().trim().nullable(),
    buyerFeeTreatment: z.enum(BUYER_FEE_TAX_TREATMENTS),
    buyerFeeTaxCode: z.string().trim().nullable(),
  })
  .superRefine((policy, ctx) => {
    if (policy.mode === "disabled") return;

    if (!policy.legalDecisionAcknowledged) {
      ctx.addIssue({
        code: "custom",
        path: ["legalDecisionAcknowledged"],
        message: "must be true before tax-enabled checkout is allowed",
      });
    }
    if (!policy.legalDecisionReference) {
      ctx.addIssue({
        code: "custom",
        path: ["legalDecisionReference"],
        message: "is required for an enabled tax-liability decision",
      });
    }
    if (!policy.shippingTaxCode) {
      ctx.addIssue({
        code: "custom",
        path: ["shippingTaxCode"],
        message: "is required so freight taxability is never guessed",
      });
    } else if (!stripeTaxCodeSchema.safeParse(policy.shippingTaxCode).success) {
      ctx.addIssue({
        code: "custom",
        path: ["shippingTaxCode"],
        message: "must be an explicitly approved Stripe Tax code",
      });
    }
    if (policy.buyerFeeTreatment === "undecided") {
      ctx.addIssue({
        code: "custom",
        path: ["buyerFeeTreatment"],
        message:
          "must explicitly state whether the buyer marketplace fee is taxable",
      });
    }
    if (
      policy.buyerFeeTreatment === "taxable" &&
      !policy.buyerFeeTaxCode
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["buyerFeeTaxCode"],
        message: "is required when the buyer marketplace fee is taxable",
      });
    }
    if (
      policy.buyerFeeTaxCode &&
      !stripeTaxCodeSchema.safeParse(policy.buyerFeeTaxCode).success
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["buyerFeeTaxCode"],
        message: "must be an explicitly approved Stripe Tax code",
      });
    }
  });

export interface TaxPolicy {
  mode: TaxMode;
  version: number;
  legalDecisionAcknowledged: boolean;
  legalDecisionReference: string | null;
  shippingTaxCode: string | null;
  buyerFeeTreatment: BuyerFeeTaxTreatment;
  buyerFeeTaxCode: string | null;
}

export interface TaxPolicySnapshot extends TaxPolicy {
  liabilityOwner: TaxLiabilityOwner;
  capturedAt: string;
  connectedAccountFlowStatus:
    | "not_applicable"
    | "calculation_only_manual_transaction_flow_incomplete";
}

export interface TaxJurisdictionEvidence {
  country: string | null;
  state: string | null;
  taxType: string | null;
  ratePercent: string;
  amountCents: number;
  taxableAmountCents: number;
  taxabilityReason: string;
}

export interface TaxCalculationEvidence {
  inputFingerprint: string;
  calculationId: string;
  calculationExpiresAt: string | null;
  currency: "usd";
  amountTotalCents: number;
  taxAmountExclusiveCents: number;
  taxAmountInclusiveCents: number;
  taxableInventoryAmountCents: number;
  taxableFreightAmountCents: number;
  taxableBuyerFeeAmountCents: number;
  inventoryTaxCode: string;
  shippingTaxCode: string;
  buyerFeeTaxCode: string | null;
  registrationIds: string[];
  shipFrom: {
    country: "US";
    state: string;
    postalCode: string;
  };
  shipTo: {
    country: "US";
    state: string;
    postalCode: string;
  };
  jurisdictions: TaxJurisdictionEvidence[];
}

export interface TaxReversalEvidence {
  refundId: string;
  transactionId: string;
  cumulativeRefundedAmountCents: number;
  recordedAt: string;
}

export function taxLiabilityOwnerForMode(
  mode: TaxMode,
): TaxLiabilityOwner {
  if (mode === "platform_liable") return "platform";
  if (mode === "connected_account_liable") return "connected_account";
  return "none";
}

export function parseTaxPolicy(input: TaxPolicy): TaxPolicy {
  return taxPolicyInputSchema.parse(input);
}

export function getTaxPolicyReadinessIssues(policy: TaxPolicy): string[] {
  const parsed = taxPolicyInputSchema.safeParse(policy);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const field = issue.path.join(".");
    return field ? `${field}: ${issue.message}` : issue.message;
  });
}

export function captureTaxPolicy(
  policy: TaxPolicy,
  capturedAt = new Date(),
): TaxPolicySnapshot {
  return {
    ...policy,
    liabilityOwner: taxLiabilityOwnerForMode(policy.mode),
    capturedAt: capturedAt.toISOString(),
    connectedAccountFlowStatus:
      policy.mode === "connected_account_liable"
        ? "calculation_only_manual_transaction_flow_incomplete"
        : "not_applicable",
  };
}

export function isVerifiedStripeTaxCode(params: {
  code: string | null | undefined;
  status: ListingTaxCodeStatus | string | null | undefined;
}): params is { code: string; status: "verified" } {
  return (
    params.status === "verified" &&
    stripeTaxCodeSchema.safeParse(params.code).success
  );
}
