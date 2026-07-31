import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    STRIPE_TAX_MODE: "disabled",
    STRIPE_TAX_POLICY_VERSION: 1,
    STRIPE_TAX_LEGAL_DECISION_ACKNOWLEDGED: "false",
    STRIPE_TAX_LEGAL_DECISION_REFERENCE: undefined,
    STRIPE_TAX_SHIPPING_TAX_CODE: undefined,
    STRIPE_TAX_BUYER_FEE_TREATMENT: "undecided",
    STRIPE_TAX_BUYER_FEE_TAX_CODE: undefined,
  },
}));

vi.mock("@/lib/stripe", () => ({ stripe: {} }));

import type { TaxPolicy } from "@/lib/tax-policy";
import {
  STRIPE_NON_TAXABLE_TAX_CODE,
  buildStripeTaxCalculationRequest,
  calculateOrderTax,
  findCommittedTaxTransaction,
  requirePaymentIntentTaxCalculation,
  type CalculateOrderTaxInput,
  type StripeTaxCalculationClient,
} from "@/server/services/stripe-tax";

const platformPolicy: TaxPolicy = {
  mode: "platform_liable",
  version: 7,
  legalDecisionAcknowledged: true,
  legalDecisionReference: "tax-counsel-approval-2026-07-30",
  shippingTaxCode: "txcd_92010001",
  buyerFeeTreatment: "excluded",
  buyerFeeTaxCode: null,
};

const taxInput: CalculateOrderTaxInput = {
  checkoutReference: "quote_123",
  listingId: "11111111-1111-4111-8111-111111111111",
  inventoryAmount: 5_000,
  buyerFreightAmount: 750,
  buyerMarketplaceFeeAmount: 250,
  inventoryTaxCode: "txcd_99999999",
  inventoryTaxCodeStatus: "verified",
  shipFrom: {
    city: "Denver",
    state: "CO",
    postalCode: "80202",
  },
  shipTo: {
    line1: "100 Market St",
    city: "Denver",
    state: "CO",
    postalCode: "80202",
  },
};

function stripeClient(params?: {
  registrations?: unknown[];
  amountTotal?: number;
  taxAmount?: number;
  association?: unknown;
}) {
  const registrationsList = vi.fn().mockResolvedValue({
    data:
      params?.registrations ??
      [
        {
          id: "taxreg_123",
          status: "active",
          country: "US",
          country_options: { us: { state: "CO" } },
        },
      ],
  });
  const taxAmount = params?.taxAmount ?? 48_000;
  const calculationCreate = vi.fn().mockResolvedValue({
    id: "taxcalc_123",
    currency: "usd",
    amount_total: params?.amountTotal ?? 648_000,
    tax_amount_exclusive: taxAmount,
    tax_amount_inclusive: 0,
    expires_at: 1_900_000_000,
    tax_breakdown: [
      {
        amount: taxAmount,
        taxable_amount: 500_000,
        taxability_reason: "standard_rated",
        tax_rate_details: {
          country: "US",
          state: "CO",
          tax_type: "sales_tax",
          percentage_decimal: "0.096",
        },
      },
    ],
  });
  const associationFind = vi.fn().mockResolvedValue(
    params?.association ?? {
      calculation: "taxcalc_123",
      tax_transaction_attempts: [
        {
          source: "pi_123",
          status: "committed",
          committed: { transaction: "tax_123" },
        },
      ],
    },
  );

  return {
    client: {
      tax: {
        registrations: { list: registrationsList },
        calculations: { create: calculationCreate },
        associations: { find: associationFind },
      },
    } as unknown as StripeTaxCalculationClient,
    registrationsList,
    calculationCreate,
    associationFind,
  };
}

describe("Stripe Tax checkout foundation", () => {
  it("keeps an excluded buyer fee in amount_total using Stripe's explicit non-taxable code", () => {
    const first = buildStripeTaxCalculationRequest({
      policy: platformPolicy,
      input: taxInput,
    });
    const second = buildStripeTaxCalculationRequest({
      policy: platformPolicy,
      input: taxInput,
    });

    expect(first.request.line_items).toEqual([
      expect.objectContaining({
        amount: 500_000,
        tax_code: "txcd_99999999",
      }),
      expect.objectContaining({
        amount: 25_000,
        tax_code: STRIPE_NON_TAXABLE_TAX_CODE,
      }),
    ]);
    expect(first.request.shipping_cost).toEqual(
      expect.objectContaining({
        amount: 75_000,
        tax_code: "txcd_92010001",
      }),
    );
    expect(first.requestOptions.stripeAccount).toBeUndefined();
    expect(first.requestOptions.idempotencyKey).toBe(
      second.requestOptions.idempotencyKey,
    );
  });

  it("uses the seller account context only for connected-account certification", () => {
    const built = buildStripeTaxCalculationRequest({
      policy: { ...platformPolicy, mode: "connected_account_liable" },
      input: {
        ...taxInput,
        sellerStripeAccountId: "acct_seller",
      },
    });

    expect(built.requestOptions.stripeAccount).toBe("acct_seller");
    expect(built.registrationRequestOptions.stripeAccount).toBe(
      "acct_seller",
    );
  });

  it("persists provider and jurisdiction evidence when a platform calculation is authoritative", async () => {
    const mock = stripeClient();
    const result = await calculateOrderTax(taxInput, {
      policy: platformPolicy,
      stripeClient: mock.client,
      nodeEnv: "test",
    });

    expect(result).toMatchObject({
      taxLiability: "platform",
      taxStatus: "calculated",
      taxAmount: 480,
      taxableInventoryAmount: 5_000,
      taxableFreightAmount: 750,
      taxableBuyerFeeAmount: 0,
      stripeTaxCalculationId: "taxcalc_123",
      stripeTaxAccountId: null,
    });
    expect(result.taxCalculationEvidence).toMatchObject({
      calculationId: "taxcalc_123",
      amountTotalCents: 648_000,
      buyerFeeTaxCode: STRIPE_NON_TAXABLE_TAX_CODE,
      registrationIds: ["taxreg_123"],
    });
    expect(result.taxJurisdictionSummary).toEqual([
      expect.objectContaining({ state: "CO", amountCents: 48_000 }),
    ]);
  });

  it("fails closed when the selected liability context has no active destination registration", async () => {
    const mock = stripeClient({ registrations: [] });

    await expect(
      calculateOrderTax(taxInput, {
        policy: platformPolicy,
        stripeClient: mock.client,
        nodeEnv: "test",
      }),
    ).rejects.toMatchObject({
      code: "REGISTRATION_INCOMPLETE",
    });
    expect(mock.calculationCreate).not.toHaveBeenCalled();
  });

  it("keeps disabled tax explicit in test but blocks it in production", async () => {
    const disabledPolicy: TaxPolicy = {
      ...platformPolicy,
      mode: "disabled",
      legalDecisionAcknowledged: false,
      legalDecisionReference: null,
      shippingTaxCode: null,
      buyerFeeTreatment: "undecided",
    };

    await expect(
      calculateOrderTax(taxInput, {
        policy: disabledPolicy,
        nodeEnv: "test",
      }),
    ).resolves.toMatchObject({
      taxLiability: "none",
      taxStatus: "disabled",
      taxAmount: 0,
      stripeTaxCalculationId: null,
    });
    await expect(
      calculateOrderTax(taxInput, {
        policy: disabledPolicy,
        nodeEnv: "production",
      }),
    ).rejects.toMatchObject({ code: "TAX_DISABLED" });
  });

  it("allows connected calculations for certification but not checkout", async () => {
    const connectedPolicy: TaxPolicy = {
      ...platformPolicy,
      mode: "connected_account_liable",
    };
    const mock = stripeClient();
    const connectedInput = {
      ...taxInput,
      sellerStripeAccountId: "acct_seller",
      sellerTaxRegisteredStates: ["CO"],
    };

    await expect(
      calculateOrderTax(connectedInput, {
        policy: connectedPolicy,
        stripeClient: mock.client,
        nodeEnv: "test",
      }),
    ).rejects.toMatchObject({
      code: "CONNECTED_ACCOUNT_TRANSACTION_FLOW_INCOMPLETE",
    });

    await expect(
      calculateOrderTax(connectedInput, {
        policy: connectedPolicy,
        stripeClient: mock.client,
        nodeEnv: "test",
        allowConnectedAccountCalculationForCertification: true,
      }),
    ).resolves.toMatchObject({
      taxLiability: "connected_account",
      stripeTaxAccountId: "acct_seller",
    });
    expect(mock.calculationCreate.mock.calls.at(-1)?.[1]).toMatchObject({
      stripeAccount: "acct_seller",
    });
  });

  it("requires the persisted platform calculation when creating payment", () => {
    expect(
      requirePaymentIntentTaxCalculation({
        taxStatus: "calculated",
        taxLiability: "platform",
        stripeTaxCalculationId: "taxcalc_123",
        taxCalculationEvidence: {
          inputFingerprint: "abc",
          calculationId: "taxcalc_123",
          calculationExpiresAt: "2030-01-01T00:00:00.000Z",
          currency: "usd",
          amountTotalCents: 648_000,
          taxAmountExclusiveCents: 48_000,
          taxAmountInclusiveCents: 0,
          taxableInventoryAmountCents: 500_000,
          taxableFreightAmountCents: 75_000,
          taxableBuyerFeeAmountCents: 0,
          inventoryTaxCode: "txcd_99999999",
          shippingTaxCode: "txcd_92010001",
          buyerFeeTaxCode: STRIPE_NON_TAXABLE_TAX_CODE,
          registrationIds: ["taxreg_123"],
          shipFrom: { country: "US", state: "CO", postalCode: "80202" },
          shipTo: { country: "US", state: "CO", postalCode: "80202" },
          jurisdictions: [],
        },
      }),
    ).toBe("taxcalc_123");
  });

  it("accepts exactly one committed association for the expected payment effect", async () => {
    const mock = stripeClient();
    await expect(
      findCommittedTaxTransaction({
        paymentIntentId: "pi_123",
        expectedCalculationId: "taxcalc_123",
        stripeClient: mock.client,
      }),
    ).resolves.toEqual({ transactionId: "tax_123" });

    const ambiguous = stripeClient({
      association: {
        calculation: "taxcalc_123",
        tax_transaction_attempts: [
          {
            source: "re_123",
            status: "committed",
            committed: { transaction: "tax_reversal_1" },
          },
          {
            source: "re_123",
            status: "committed",
            committed: { transaction: "tax_reversal_2" },
          },
        ],
      },
    });
    await expect(
      findCommittedTaxTransaction({
        paymentIntentId: "pi_123",
        expectedCalculationId: "taxcalc_123",
        expectedSourceId: "re_123",
        stripeClient: ambiguous.client,
      }),
    ).rejects.toMatchObject({
      code: "TAX_ASSOCIATION_INCOMPLETE",
    });
  });
});
