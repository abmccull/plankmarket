import { describe, expect, it } from "vitest";
import { getOrderRecovery } from "../order-recovery";
const paid = { status: "confirmed", paymentStatus: "succeeded" };
describe("provider-evidenced recovery", () => {
  it("does not infer paid or delivered from a contradictory shipment", () => {
    expect(getOrderRecovery({ ...paid, paymentStatus: "processing" }, { status: "delivered", priority1ShipmentId: "p1" }, "buyer").code).toBe("payment_processing");
    expect(getOrderRecovery(paid, { status: "delivered", priority1ShipmentId: "p1", isDryRun: true }, "buyer").code).toBe("unverified_shipment");
  });
  it("distinguishes unattempted, unknown and booked freight without offering another booking", () => {
    expect(getOrderRecovery(paid, null, "buyer").code).toBe("awaiting_booking");
    expect(getOrderRecovery(paid, { status: "pending" }, "buyer").code).toBe("booking_pending");
    const unknown = getOrderRecovery(paid, { status: "pending", dispatchAttemptedAt: "2026-09-08" }, "admin");
    expect(unknown.code).toBe("booking_unknown"); expect(unknown.action?.href).toBe("/admin/reconciliation");
    expect(getOrderRecovery(paid, { status: "dispatched", priority1ShipmentId: "p1" }, "seller").code).toBe("booked");
  });
  it("keeps cancellation pending until carrier confirmation", () => {
    expect(getOrderRecovery(paid, { status: "dispatched", priority1ShipmentId: "p1", cancellationRequestedAt: "2026-09-08" }, "seller").code).toBe("cancellation_pending");
  });
});
