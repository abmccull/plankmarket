import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { env } from "@/env";
import { stripe } from "@/lib/stripe";
import {
  captureTaxPolicy,
  getTaxPolicyReadinessIssues,
  isVerifiedStripeTaxCode,
  type OrderTaxStatus,
  type TaxCalculationEvidence,
  type TaxJurisdictionEvidence,
  type TaxPolicy,
  type TaxPolicySnapshot,
} from "@/lib/tax-policy";

export class TaxReadinessError extends Error {
  constructor(
    public readonly code:
      | "TAX_DISABLED"
      | "LEGAL_DECISION_INCOMPLETE"
      | "TAX_CODE_INCOMPLETE"
      | "ADDRESS_INCOMPLETE"
      | "REGISTRATION_INCOMPLETE"
      | "CONNECTED_ACCOUNT_INCOMPLETE"
      | "CONNECTED_ACCOUNT_TRANSACTION_FLOW_INCOMPLETE"
      | "PROVIDER_RESPONSE_INVALID"
      | "TAX_ASSOCIATION_INCOMPLETE",
    message: string,
  ) {
    super(message);
    this.name = "TaxReadinessError";
  }
}

export interface OrderTaxCalculationResult {
  taxPolicySnapshot: TaxPolicySnapshot;
  taxLiability: TaxPolicySnapshot["liabilityOwner"];
  taxStatus: OrderTaxStatus;
  taxAmount: number;
  taxableInventoryAmount: number;
  taxableFreightAmount: number;
  taxableBuyerFeeAmount: number;
  stripeTaxCalculationId: string | null;
  stripeTaxAccountId: string | null;
  taxJurisdictionSummary: TaxJurisdictionEvidence[];
  taxCalculationEvidence: TaxCalculationEvidence | null;
  taxCalculatedAt: Date | null;
}

interface TaxAddress {
  line1?: string | null;
  city: string | null | undefined;
  state: string | null | undefined;
  postalCode: string | null | undefined;
}

export interface CalculateOrderTaxInput {
  checkoutReference: string;
  listingId: string;
  inventoryAmount: number;
  buyerFreightAmount: number;
  buyerMarketplaceFeeAmount: number;
  inventoryTaxCode: string | null | undefined;
  inventoryTaxCodeStatus: string | null | undefined;
  shipFrom: TaxAddress;
  shipTo: TaxAddress;
  sellerStripeAccountId?: string | null;
  sellerTaxRegisteredStates?: readonly string[] | null;
}

export interface StripeTaxCalculationClient {
  tax: {
    registrations: Pick<Stripe.Tax.RegistrationsResource, "list">;
    calculations: Pick<Stripe.Tax.CalculationsResource, "create">;
    associations: Pick<Stripe.Tax.AssociationsResource, "find">;
  };
}

// Stripe's documented non-taxable product code. This is applied only after the
// versioned legal policy explicitly classifies the buyer marketplace fee as
// excluded; it is not a guessed flooring classification.
export const STRIPE_NON_TAXABLE_TAX_CODE = "txcd_00000000";

function envBoolean(value: string): boolean {
  return value === "true";
}

export function getConfiguredTaxPolicy(): TaxPolicy {
  return {
    mode: env.STRIPE_TAX_MODE,
    version: env.STRIPE_TAX_POLICY_VERSION,
    legalDecisionAcknowledged: envBoolean(
      env.STRIPE_TAX_LEGAL_DECISION_ACKNOWLEDGED,
    ),
    legalDecisionReference:
      env.STRIPE_TAX_LEGAL_DECISION_REFERENCE ?? null,
    shippingTaxCode: env.STRIPE_TAX_SHIPPING_TAX_CODE ?? null,
    buyerFeeTreatment: env.STRIPE_TAX_BUYER_FEE_TREATMENT,
    buyerFeeTaxCode: env.STRIPE_TAX_BUYER_FEE_TAX_CODE ?? null,
  };
}

function toCents(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TaxReadinessError(
      "PROVIDER_RESPONSE_INVALID",
      `${label} must be a non-negative finite amount.`,
    );
  }
  return Math.round(value * 100);
}

function fromCents(value: number): number {
  return Math.round(value) / 100;
}

function normalizeUsAddress(address: TaxAddress, label: string) {
  const city = address.city?.trim();
  const state = address.state?.trim().toUpperCase();
  const postalCode = address.postalCode?.trim();
  const line1 = address.line1?.trim();
  if (
    !city ||
    !state ||
    !/^[A-Z]{2}$/.test(state) ||
    !postalCode ||
    !/^\d{5}(?:-\d{4})?$/.test(postalCode) ||
    (label === "shipping destination" && !line1)
  ) {
    throw new TaxReadinessError(
      "ADDRESS_INCOMPLETE",
      `The ${label} address is incomplete for an authoritative tax calculation.`,
    );
  }
  return {
    city,
    state,
    postalCode,
    ...(line1 ? { line1 } : {}),
  };
}

function stableTaxInputFingerprint(input: object): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

function stripeRequestOptions(params: {
  policy: TaxPolicy;
  input: CalculateOrderTaxInput;
  idempotencyKey?: string;
}): Stripe.RequestOptions {
  const connectedAccount =
    params.policy.mode === "connected_account_liable"
      ? params.input.sellerStripeAccountId?.trim()
      : undefined;
  if (
    params.policy.mode === "connected_account_liable" &&
    !connectedAccount
  ) {
    throw new TaxReadinessError(
      "CONNECTED_ACCOUNT_INCOMPLETE",
      "The seller connected account is required for connected-account tax calculations.",
    );
  }
  return {
    ...(connectedAccount ? { stripeAccount: connectedAccount } : {}),
    ...(params.idempotencyKey
      ? { idempotencyKey: params.idempotencyKey }
      : {}),
  };
}

function activeUsStateRegistrations(
  registrations: Stripe.Tax.Registration[],
  destinationState: string,
) {
  return registrations.filter((registration) => {
    const usOptions = registration.country_options.us;
    return (
      registration.status === "active" &&
      registration.country.toUpperCase() === "US" &&
      usOptions?.state?.toUpperCase() === destinationState
    );
  });
}

export function assertCheckoutTaxPolicySupported(
  policy: TaxPolicy,
  nodeEnv: "development" | "test" | "production" = env.NODE_ENV,
): void {
  if (policy.mode === "disabled") {
    if (nodeEnv === "production") {
      throw new TaxReadinessError(
        "TAX_DISABLED",
        "Checkout is disabled because the production tax-liability mode has not been enabled.",
      );
    }
    return;
  }
  const readinessIssues = getTaxPolicyReadinessIssues(policy);
  if (readinessIssues.length > 0) {
    throw new TaxReadinessError(
      "LEGAL_DECISION_INCOMPLETE",
      `Checkout tax policy is incomplete: ${readinessIssues.join("; ")}`,
    );
  }
  if (policy.mode === "connected_account_liable") {
    throw new TaxReadinessError(
      "CONNECTED_ACCOUNT_TRANSACTION_FLOW_INCOMPLETE",
      "Connected-account tax calculation is available for certification, but checkout remains blocked until transaction commitment and refund reversal are implemented in the connected-account context.",
    );
  }
}

export function buildStripeTaxCalculationRequest(params: {
  policy: TaxPolicy;
  input: CalculateOrderTaxInput;
}) {
  const inventoryTaxCode = isVerifiedStripeTaxCode({
    code: params.input.inventoryTaxCode,
    status: params.input.inventoryTaxCodeStatus,
  })
    ? params.input.inventoryTaxCode
    : null;
  if (!inventoryTaxCode || !params.policy.shippingTaxCode) {
    throw new TaxReadinessError(
      "TAX_CODE_INCOMPLETE",
      "The inventory and freight tax codes must be explicitly assigned and verified before checkout.",
    );
  }

  const shipFrom = normalizeUsAddress(params.input.shipFrom, "ship-from");
  const shipTo = normalizeUsAddress(params.input.shipTo, "shipping destination");
  const inventoryAmountCents = toCents(
    params.input.inventoryAmount,
    "Inventory amount",
  );
  const freightAmountCents = toCents(
    params.input.buyerFreightAmount,
    "Freight amount",
  );
  const buyerFeeAmountCents = toCents(
    params.input.buyerMarketplaceFeeAmount,
    "Buyer marketplace fee",
  );
  const taxableBuyerFeeAmountCents =
    params.policy.buyerFeeTreatment === "taxable"
      ? buyerFeeAmountCents
      : 0;
  const buyerFeeTaxCode =
    params.policy.buyerFeeTreatment === "taxable"
      ? params.policy.buyerFeeTaxCode
      : STRIPE_NON_TAXABLE_TAX_CODE;

  if (
    params.policy.buyerFeeTreatment === "taxable" &&
    !buyerFeeTaxCode
  ) {
    throw new TaxReadinessError(
      "TAX_CODE_INCOMPLETE",
      "A verified buyer-fee tax code is required by the selected policy.",
    );
  }

  const lineItems: Stripe.Tax.CalculationCreateParams.LineItem[] = [
    {
      amount: inventoryAmountCents,
      quantity: 1,
      reference: `inventory:${params.input.listingId}`,
      tax_behavior: "exclusive",
      tax_code: inventoryTaxCode,
    },
  ];
  // PaymentIntent tax hooks require its amount to equal calculation.amount_total.
  // Therefore an excluded platform fee must remain in the calculation with
  // Stripe's explicit non-taxable code rather than being omitted.
  if (buyerFeeAmountCents > 0) {
    lineItems.push({
      amount: buyerFeeAmountCents,
      quantity: 1,
      reference: `buyer-fee:${params.input.listingId}`,
      tax_behavior: "exclusive",
      tax_code: buyerFeeTaxCode!,
    });
  }

  const canonicalInput = {
    policyVersion: params.policy.version,
    mode: params.policy.mode,
    checkoutReference: params.input.checkoutReference,
    listingId: params.input.listingId,
    inventoryAmountCents,
    freightAmountCents,
    buyerFeeAmountCents,
    taxableBuyerFeeAmountCents,
    inventoryTaxCode,
    shippingTaxCode: params.policy.shippingTaxCode,
    buyerFeeTaxCode,
    shipFrom,
    shipTo,
    connectedAccountId:
      params.policy.mode === "connected_account_liable"
        ? params.input.sellerStripeAccountId ?? null
        : null,
  };
  const inputFingerprint = stableTaxInputFingerprint(canonicalInput);
  const idempotencyKey = `order-tax:v${params.policy.version}:${inputFingerprint}`;

  const request: Stripe.Tax.CalculationCreateParams = {
    currency: "usd",
    customer_details: {
      address_source: "shipping",
      address: {
        country: "US",
        line1: shipTo.line1,
        city: shipTo.city,
        state: shipTo.state,
        postal_code: shipTo.postalCode,
      },
    },
    ship_from_details: {
      address: {
        country: "US",
        city: shipFrom.city,
        state: shipFrom.state,
        postal_code: shipFrom.postalCode,
      },
    },
    line_items: lineItems,
    ...(freightAmountCents > 0
      ? {
          shipping_cost: {
            amount: freightAmountCents,
            tax_behavior: "exclusive" as const,
            tax_code: params.policy.shippingTaxCode,
          },
        }
      : {}),
  };

  return {
    request,
    requestOptions: stripeRequestOptions({
      policy: params.policy,
      input: params.input,
      idempotencyKey,
    }),
    registrationRequestOptions: stripeRequestOptions({
      policy: params.policy,
      input: params.input,
    }),
    inputFingerprint,
    inventoryAmountCents,
    freightAmountCents,
    buyerFeeAmountCents,
    taxableBuyerFeeAmountCents,
    buyerFeeTaxCode,
    inventoryTaxCode,
    shipFrom,
    shipTo,
  };
}

export async function calculateOrderTax(
  input: CalculateOrderTaxInput,
  options: {
    policy?: TaxPolicy;
    stripeClient?: StripeTaxCalculationClient;
    nodeEnv?: "development" | "test" | "production";
    allowConnectedAccountCalculationForCertification?: boolean;
  } = {},
): Promise<OrderTaxCalculationResult> {
  const policy = options.policy ?? getConfiguredTaxPolicy();
  const snapshot = captureTaxPolicy(policy);
  const nodeEnv = options.nodeEnv ?? env.NODE_ENV;

  if (policy.mode === "disabled") {
    assertCheckoutTaxPolicySupported(policy, nodeEnv);
    return {
      taxPolicySnapshot: snapshot,
      taxLiability: "none",
      taxStatus: "disabled",
      taxAmount: 0,
      taxableInventoryAmount: 0,
      taxableFreightAmount: 0,
      taxableBuyerFeeAmount: 0,
      stripeTaxCalculationId: null,
      stripeTaxAccountId: null,
      taxJurisdictionSummary: [],
      taxCalculationEvidence: null,
      taxCalculatedAt: null,
    };
  }

  if (
    policy.mode === "connected_account_liable" &&
    !options.allowConnectedAccountCalculationForCertification
  ) {
    assertCheckoutTaxPolicySupported(policy, nodeEnv);
  } else {
    const issues = getTaxPolicyReadinessIssues(policy);
    if (issues.length > 0) {
      throw new TaxReadinessError(
        "LEGAL_DECISION_INCOMPLETE",
        `Tax policy is incomplete: ${issues.join("; ")}`,
      );
    }
  }

  const built = buildStripeTaxCalculationRequest({ policy, input });
  const stripeClient = options.stripeClient ?? stripe;

  if (
    policy.mode === "connected_account_liable" &&
    !input.sellerTaxRegisteredStates
      ?.map((state) => state.trim().toUpperCase())
      .includes(built.shipTo.state)
  ) {
    throw new TaxReadinessError(
      "REGISTRATION_INCOMPLETE",
      "The destination is not included in the seller's acknowledged tax-registration states.",
    );
  }

  const registrations = await stripeClient.tax.registrations.list(
    { status: "active", limit: 100 },
    built.registrationRequestOptions,
  );
  const matchingRegistrations = activeUsStateRegistrations(
    registrations.data,
    built.shipTo.state,
  );
  if (matchingRegistrations.length === 0) {
    throw new TaxReadinessError(
      "REGISTRATION_INCOMPLETE",
      `No active Stripe Tax registration was found for ${built.shipTo.state} in the selected liability context.`,
    );
  }

  const calculation = await stripeClient.tax.calculations.create(
    built.request,
    built.requestOptions,
  );
  if (
    !calculation.id ||
    calculation.currency.toLowerCase() !== "usd" ||
    calculation.tax_amount_inclusive !== 0
  ) {
    throw new TaxReadinessError(
      "PROVIDER_RESPONSE_INVALID",
      "Stripe Tax returned an unsupported or incomplete calculation.",
    );
  }

  const expectedPreTaxTotalCents =
    built.inventoryAmountCents +
    built.freightAmountCents +
    built.buyerFeeAmountCents;
  const expectedAmountTotalCents =
    expectedPreTaxTotalCents + calculation.tax_amount_exclusive;
  if (calculation.amount_total !== expectedAmountTotalCents) {
    throw new TaxReadinessError(
      "PROVIDER_RESPONSE_INVALID",
      "Stripe Tax calculation totals do not match the immutable checkout inputs.",
    );
  }

  const jurisdictions: TaxJurisdictionEvidence[] =
    calculation.tax_breakdown.map((entry) => ({
      country: entry.tax_rate_details.country,
      state: entry.tax_rate_details.state,
      taxType: entry.tax_rate_details.tax_type,
      ratePercent: entry.tax_rate_details.percentage_decimal,
      amountCents: entry.amount,
      taxableAmountCents: entry.taxable_amount,
      taxabilityReason: entry.taxability_reason,
    }));
  const evidence: TaxCalculationEvidence = {
    inputFingerprint: built.inputFingerprint,
    calculationId: calculation.id,
    calculationExpiresAt: calculation.expires_at
      ? new Date(calculation.expires_at * 1000).toISOString()
      : null,
    currency: "usd",
    amountTotalCents: calculation.amount_total,
    taxAmountExclusiveCents: calculation.tax_amount_exclusive,
    taxAmountInclusiveCents: calculation.tax_amount_inclusive,
    taxableInventoryAmountCents: built.inventoryAmountCents,
    taxableFreightAmountCents: built.freightAmountCents,
    taxableBuyerFeeAmountCents: built.taxableBuyerFeeAmountCents,
    inventoryTaxCode: built.inventoryTaxCode,
    shippingTaxCode: policy.shippingTaxCode!,
    buyerFeeTaxCode:
      built.buyerFeeAmountCents > 0 ? built.buyerFeeTaxCode : null,
    registrationIds: matchingRegistrations.map(
      (registration) => registration.id,
    ),
    shipFrom: {
      country: "US",
      state: built.shipFrom.state,
      postalCode: built.shipFrom.postalCode,
    },
    shipTo: {
      country: "US",
      state: built.shipTo.state,
      postalCode: built.shipTo.postalCode,
    },
    jurisdictions,
  };

  return {
    taxPolicySnapshot: snapshot,
    taxLiability: snapshot.liabilityOwner,
    taxStatus: "calculated",
    taxAmount: fromCents(calculation.tax_amount_exclusive),
    taxableInventoryAmount: fromCents(built.inventoryAmountCents),
    taxableFreightAmount: fromCents(built.freightAmountCents),
    taxableBuyerFeeAmount: fromCents(built.taxableBuyerFeeAmountCents),
    stripeTaxCalculationId: calculation.id,
    stripeTaxAccountId:
      policy.mode === "connected_account_liable"
        ? input.sellerStripeAccountId ?? null
        : null,
    taxJurisdictionSummary: jurisdictions,
    taxCalculationEvidence: evidence,
    taxCalculatedAt: new Date(),
  };
}

export function requirePaymentIntentTaxCalculation(order: {
  taxStatus: string;
  taxLiability: string;
  stripeTaxCalculationId: string | null;
  taxCalculationEvidence: TaxCalculationEvidence | null;
}): string | null {
  if (order.taxStatus === "disabled" && order.taxLiability === "none") {
    return null;
  }
  if (
    order.taxStatus !== "calculated" ||
    order.taxLiability !== "platform" ||
    !order.stripeTaxCalculationId ||
    order.taxCalculationEvidence?.calculationId !==
      order.stripeTaxCalculationId
  ) {
    throw new TaxReadinessError(
      "TAX_ASSOCIATION_INCOMPLETE",
      "The order does not have a valid platform tax calculation for payment.",
    );
  }
  if (
    order.taxCalculationEvidence.calculationExpiresAt &&
    new Date(order.taxCalculationEvidence.calculationExpiresAt) <= new Date()
  ) {
    throw new TaxReadinessError(
      "TAX_ASSOCIATION_INCOMPLETE",
      "The order tax calculation expired before payment.",
    );
  }
  return order.stripeTaxCalculationId;
}

export async function findCommittedTaxTransaction(params: {
  paymentIntentId: string;
  expectedCalculationId: string;
  expectedSourceId?: string;
  stripeClient?: StripeTaxCalculationClient;
}): Promise<{ transactionId: string }> {
  const association = await (
    params.stripeClient ?? stripe
  ).tax.associations.find({
    payment_intent: params.paymentIntentId,
  });
  if (association.calculation !== params.expectedCalculationId) {
    throw new TaxReadinessError(
      "TAX_ASSOCIATION_INCOMPLETE",
      "Stripe Tax association does not match the order calculation.",
    );
  }
  const attempts = association.tax_transaction_attempts ?? [];
  const matchingAttempts = params.expectedSourceId
    ? attempts.filter((attempt) => attempt.source === params.expectedSourceId)
    : attempts.filter(
        (attempt) => attempt.source === params.paymentIntentId,
      );
  const committed = matchingAttempts.filter(
    (attempt) =>
      attempt.status === "committed" && attempt.committed?.transaction,
  );
  if (committed.length !== 1 || !committed[0]?.committed?.transaction) {
    throw new TaxReadinessError(
      "TAX_ASSOCIATION_INCOMPLETE",
      "Stripe has not recorded one authoritative tax transaction for this payment effect.",
    );
  }
  return { transactionId: committed[0].committed.transaction };
}
