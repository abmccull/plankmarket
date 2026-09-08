import { sql, type SQL } from "drizzle-orm";
import { orders } from "@/server/db/schema/orders";
// A paid order is not a bank payout. Keep those figures distinct.
export const paidSellerOrder = sql`${orders.paymentStatus} in ('succeeded', 'partially_refunded') and ${orders.status} not in ('pending', 'cancelled', 'refunded')`;
export function sumMoneyCents(value: SQL) {
  return sql<string>`cast(round(coalesce(sum(${value}), 0) * 100) as bigint)::text`;
}
export const sellerFinancialAggregates = {
  proceedsCents: sumMoneyCents(sql`case when ${paidSellerOrder} then ${orders.sellerPayout} else 0 end`),
  buyerRefundsCents: sumMoneyCents(sql`coalesce(${orders.refundedAmount}, 0)`),
  // Refund allocation can change the expected remaining payout before a
  // provider reversal is recorded. Report recorded movement, not that estimate.
  netTransfersCents: sumMoneyCents(sql`case when ${orders.stripeTransferId} is not null then greatest(${orders.originalSellerPayout} - coalesce(${orders.transferReversedAmount}, 0), 0) else 0 end`),
  awaitingTransferCents: sumMoneyCents(sql`case when ${paidSellerOrder} and ${orders.stripeTransferId} is null then greatest(${orders.sellerPayout}, 0) else 0 end`),
  awaitingPaymentCents: sumMoneyCents(sql`case when ${orders.status} = 'pending' and ${orders.paymentStatus} in ('pending', 'processing', 'failed') then ${orders.sellerPayout} else 0 end`),
};
