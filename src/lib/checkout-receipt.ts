export function checkoutReceiptState(order: { status: string; paymentStatus: string; taxStatus?: string }) {
  const payment = order.paymentStatus;
  if (payment === "reconciliation_required" || order.taxStatus === "reconciliation_required") {
    return { paid: false, poll: false, title: "Payment needs review", description: "We are checking this payment. Do not submit another payment. Follow the order for updates." };
  }
  if (["refund_pending", "partially_refunded", "refunded"].includes(payment)) {
    return { paid: false, poll: false, title: payment === "refund_pending" ? "Refund in progress" : payment === "partially_refunded" ? "Order partially refunded" : "Order refunded", description: "Your order page shows the latest refund details." };
  }
  if (order.status === "cancelled") {
    return { paid: false, poll: false, title: "Order cancelled", description: payment === "succeeded" || payment === "processing" ? "This cancelled order has a payment requiring review. Do not pay again; contact support from your order." : "This order is no longer active. View its details before starting another purchase." };
  }
  if (payment === "succeeded") {
    return { paid: true, poll: false, title: "Order confirmed", description: "Payment received. Follow preparation and shipment progress from your order." };
  }
  if (payment === "failed") {
    return { paid: false, poll: false, title: "Payment unsuccessful", description: "Payment was not completed. Open your order to review the available next steps." };
  }
  return { paid: false, poll: payment === "pending" || payment === "processing", title: payment === "processing" ? "Payment processing" : "Awaiting payment confirmation", description: "Your order is saved. Payment has not been confirmed yet. Do not submit another payment while we check its status." };
}
