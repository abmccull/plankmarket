import {
  check,
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  integer,
  index,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { FreightFundingMode } from "@/lib/freight-funding";
import type { CommercialPolicySnapshot } from "@/lib/commercial-policy";
import type {
  OrderTaxStatus,
  TaxCalculationEvidence,
  TaxJurisdictionEvidence,
  TaxLiabilityOwner,
  TaxPolicySnapshot,
  TaxReversalEvidence,
  TaxReversalStatus,
} from "@/lib/tax-policy";
import type { ShippingBookingSnapshot } from "@/server/services/shipping-workflow";
import { money } from "../custom-types";
import { users } from "./users";
import { listings } from "./listings";
import { offers } from "./offers";

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: varchar("order_number", { length: 20 }).unique().notNull(),
    buyerId: uuid("buyer_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    listingId: uuid("listing_id")
      .references(() => listings.id, { onDelete: "restrict" })
      .notNull(),

    // Offer link (nullable — only set when order originates from an accepted offer)
    offerId: uuid("offer_id").references(() => offers.id, { onDelete: "set null" }),

    // Quantity & pricing (using exact numeric type to avoid floating-point errors)
    quantitySqFt: money("quantity_sq_ft").notNull(),
    pricePerSqFt: money("price_per_sq_ft").notNull(),
    subtotal: money("subtotal").notNull(), // quantitySqFt * pricePerSqFt
    buyerFee: money("buyer_fee").notNull(), // marketplace buyer fee persisted at order creation
    sellerFee: money("seller_fee").notNull(), // marketplace seller fee persisted at order creation
    totalPrice: money("total_price").notNull(), // subtotal + buyerFreightCharge + buyerFee
    stripeProcessingFee: money("stripe_processing_fee").default(0).notNull(), // total Stripe processing cost for full buyer charge
    sellerStripeFee: money("seller_stripe_fee").default(0).notNull(), // seller's share: 2.9% * subtotal + $0.30
    platformStripeFee: money("platform_stripe_fee").default(0).notNull(), // platform-absorbed processing share
    originalSellerPayout: money("original_seller_payout"), // immutable order-time payout before refunds
    sellerPayout: money("seller_payout").notNull(), // remaining transferable payout after refunds
    commercialPolicySnapshot: jsonb("commercial_policy_snapshot")
      .$type<CommercialPolicySnapshot>()
      .default(
        sql`'{"version":1,"buyerMarketplaceFeeBps":500,"sellerMarketplaceFeeBps":500,"paymentProcessingRateBps":290,"paymentProcessingFixedFeeCents":30,"shippingMarkupBps":2500,"capturedAt":"1970-01-01T00:00:00.000Z"}'::jsonb`,
      )
      .notNull(),
    // Tax is a separate, immutable order-time policy and provider evidence
    // snapshot. Historical/disabled rows explicitly record zero tax.
    taxPolicySnapshot: jsonb("tax_policy_snapshot")
      .$type<TaxPolicySnapshot>()
      .default(
        sql`'{"mode":"disabled","version":1,"legalDecisionAcknowledged":false,"legalDecisionReference":null,"shippingTaxCode":null,"buyerFeeTreatment":"undecided","buyerFeeTaxCode":null,"liabilityOwner":"none","capturedAt":"1970-01-01T00:00:00.000Z","connectedAccountFlowStatus":"not_applicable"}'::jsonb`,
      )
      .notNull(),
    taxLiability: varchar("tax_liability", { length: 32 })
      .$type<TaxLiabilityOwner>()
      .default("none")
      .notNull(),
    taxStatus: varchar("tax_status", { length: 32 })
      .$type<OrderTaxStatus>()
      .default("disabled")
      .notNull(),
    taxAmount: money("tax_amount").default(0).notNull(),
    taxableInventoryAmount: money("taxable_inventory_amount")
      .default(0)
      .notNull(),
    taxableFreightAmount: money("taxable_freight_amount")
      .default(0)
      .notNull(),
    taxableBuyerFeeAmount: money("taxable_buyer_fee_amount")
      .default(0)
      .notNull(),
    stripeTaxCalculationId: varchar("stripe_tax_calculation_id", {
      length: 255,
    }),
    stripeTaxTransactionId: varchar("stripe_tax_transaction_id", {
      length: 255,
    }),
    stripeTaxAccountId: varchar("stripe_tax_account_id", { length: 255 }),
    taxJurisdictionSummary: jsonb("tax_jurisdiction_summary")
      .$type<TaxJurisdictionEvidence[]>()
      .default([])
      .notNull(),
    taxCalculationEvidence: jsonb("tax_calculation_evidence")
      .$type<TaxCalculationEvidence>(),
    taxCalculatedAt: timestamp("tax_calculated_at", { withTimezone: true }),
    taxCommittedAt: timestamp("tax_committed_at", { withTimezone: true }),
    taxReversalStatus: varchar("tax_reversal_status", { length: 32 })
      .$type<TaxReversalStatus>()
      .default("not_required")
      .notNull(),
    stripeTaxReversalTransactionIds: jsonb(
      "stripe_tax_reversal_transaction_ids",
    )
      .$type<string[]>()
      .default([])
      .notNull(),
    taxReversalEvidence: jsonb("tax_reversal_evidence")
      .$type<TaxReversalEvidence[]>()
      .default([])
      .notNull(),

    // Payment
    stripePaymentIntentId: varchar("stripe_payment_intent_id", {
      length: 255,
    }),
    stripeTransferId: varchar("stripe_transfer_id", { length: 255 }),
    paymentStatus: varchar("payment_status", { length: 50 })
      .default("pending")
      .notNull(),

    // Shipping address
    shippingName: varchar("shipping_name", { length: 255 }),
    shippingAddress: text("shipping_address"),
    shippingCity: varchar("shipping_city", { length: 100 }),
    shippingState: varchar("shipping_state", { length: 2 }),
    shippingZip: varchar("shipping_zip", { length: 10 }),
    shippingPhone: varchar("shipping_phone", { length: 20 }),
    trackingNumber: varchar("tracking_number", { length: 255 }),
    carrier: varchar("carrier", { length: 100 }),

    // Priority1 shipping integration
    shippingPrice: money("shipping_price"), // full booked freight, including marketplace margin
    freightFundingMode: varchar("freight_funding_mode", { length: 32 })
      .$type<FreightFundingMode>()
      .default("buyer_pays")
      .notNull(),
    buyerFreightCharge: money("buyer_freight_charge").default(0).notNull(),
    sellerFreightContribution: money("seller_freight_contribution")
      .default(0)
      .notNull(),
    carrierRate: money("carrier_rate"), // Priority1's raw rate
    shippingMargin: money("shipping_margin"), // shippingPrice - carrierRate (PlankMarket profit)
    selectedQuoteId: varchar("selected_quote_id", { length: 255 }), // Priority1 rateQuote.id
    selectedCarrier: varchar("selected_carrier", { length: 255 }), // carrier display name
    estimatedTransitDays: integer("estimated_transit_days"),
    quoteExpiresAt: timestamp("quote_expires_at", { withTimezone: true }),
    // Immutable provider request inputs selected at checkout. Dispatch must use
    // this durable copy rather than rebuilding freight details from live data.
    shippingBookingSnapshot: jsonb("shipping_booking_snapshot")
      .$type<ShippingBookingSnapshot>(),

    // Status
    status: orderStatusEnum("status").notNull().default("pending"),
    escrowStatus: varchar("escrow_status", { length: 20 })
      .default("none")
      .notNull(), // 'none', 'held', 'released', 'refunded'
    notes: text("notes"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    inventoryReleasedAt: timestamp("inventory_released_at", { withTimezone: true }),

    // Refund tracking
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundedAmount: money("refunded_amount"),
    stripeRefundId: varchar("stripe_refund_id", { length: 255 }),
    stripeTransferReversalId: varchar("stripe_transfer_reversal_id", {
      length: 255,
    }),
    transferReversedAmount: money("transfer_reversed_amount")
      .default(0)
      .notNull(),

    // Transfer error tracking
    transferFailedAt: timestamp("transfer_failed_at", { withTimezone: true }),
    transferError: text("transfer_error"),
  },
  (table) => [
    index("orders_buyer_id_idx").on(table.buyerId),
    index("orders_seller_id_idx").on(table.sellerId),
    index("orders_listing_id_idx").on(table.listingId),
    index("orders_status_idx").on(table.status),
    index("orders_created_at_idx").on(table.createdAt),
    index("orders_order_number_idx").on(table.orderNumber),
    check(
      "orders_freight_funding_mode_check",
      sql`${table.freightFundingMode} IN ('buyer_pays', 'seller_pays', 'seller_pays_selected_states')`,
    ),
    check(
      "orders_freight_funding_amounts_nonnegative_check",
      sql`${table.buyerFreightCharge} >= 0 AND ${table.sellerFreightContribution} >= 0`,
    ),
    check(
      "orders_freight_funding_split_check",
      sql`${table.buyerFreightCharge} + ${table.sellerFreightContribution} = COALESCE(${table.shippingPrice}, 0)`,
    ),
    check(
      "orders_buyer_pays_has_no_seller_contribution_check",
      sql`${table.freightFundingMode} <> 'buyer_pays' OR ${table.sellerFreightContribution} = 0`,
    ),
    check(
      "orders_payment_status_check",
      sql`${table.paymentStatus} IN ('pending', 'processing', 'succeeded', 'failed', 'reconciliation_required', 'refund_pending', 'partially_refunded', 'refunded', 'paid')`,
    ),
    check(
      "orders_payment_hold_status_check",
      sql`${table.escrowStatus} IN ('none', 'held', 'released', 'refunded', 'disputed')`,
    ),
    check(
      "orders_financial_amounts_nonnegative_check",
      sql`${table.quantitySqFt} > 0
        AND ${table.pricePerSqFt} >= 0
        AND ${table.subtotal} >= 0
        AND ${table.buyerFee} >= 0
        AND ${table.sellerFee} >= 0
        AND ${table.totalPrice} >= 0
        AND ${table.stripeProcessingFee} >= 0
        AND ${table.sellerStripeFee} >= 0
        AND ${table.platformStripeFee} >= 0
        AND ${table.sellerPayout} >= 0
        AND ${table.taxAmount} >= 0
        AND ${table.taxableInventoryAmount} >= 0
        AND ${table.taxableFreightAmount} >= 0
        AND ${table.taxableBuyerFeeAmount} >= 0
        AND COALESCE(${table.refundedAmount}, 0) >= 0
        AND ${table.transferReversedAmount} >= 0`,
    ),
    check(
      "orders_total_price_arithmetic_check",
      sql`${table.totalPrice} = ${table.subtotal} + ${table.buyerFreightCharge} + ${table.buyerFee} + ${table.taxAmount}`,
    ),
    check(
      "orders_seller_payout_arithmetic_check",
      sql`${table.originalSellerPayout} = ${table.subtotal} - ${table.sellerFee} - ${table.sellerStripeFee} - ${table.sellerFreightContribution}`,
    ),
    check(
      "orders_processing_fee_split_check",
      sql`${table.stripeProcessingFee} = ${table.sellerStripeFee} + ${table.platformStripeFee}`,
    ),
    check(
      "orders_tax_liability_check",
      sql`${table.taxLiability} IN ('none', 'platform', 'connected_account')`,
    ),
    check(
      "orders_tax_status_check",
      sql`${table.taxStatus} IN ('disabled', 'calculated', 'committed', 'reconciliation_required')`,
    ),
    check(
      "orders_tax_reversal_status_check",
      sql`${table.taxReversalStatus} IN ('not_required', 'pending', 'partially_reversed', 'reversed', 'reconciliation_required')`,
    ),
    check(
      "orders_disabled_tax_consistency_check",
      sql`${table.taxStatus} <> 'disabled' OR (
        ${table.taxLiability} = 'none'
        AND ${table.taxAmount} = 0
        AND ${table.stripeTaxCalculationId} IS NULL
        AND ${table.stripeTaxTransactionId} IS NULL
        AND ${table.taxCalculationEvidence} IS NULL
      )`,
    ),
    check(
      "orders_calculated_tax_evidence_check",
      sql`${table.taxStatus} = 'disabled' OR (
        ${table.taxLiability} <> 'none'
        AND ${table.stripeTaxCalculationId} IS NOT NULL
        AND ${table.taxCalculationEvidence} IS NOT NULL
        AND ${table.taxCalculatedAt} IS NOT NULL
      )`,
    ),
    check(
      "orders_committed_tax_evidence_check",
      sql`${table.taxStatus} <> 'committed' OR (
        ${table.stripeTaxTransactionId} IS NOT NULL
        AND ${table.taxCommittedAt} IS NOT NULL
      )`,
    ),
    check(
      "orders_connected_tax_checkout_incomplete_check",
      sql`${table.taxLiability} <> 'connected_account'`,
    ),
  ]
);

// Note: ordersRelations is defined in schema/index.ts to avoid duplicate definitions
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
