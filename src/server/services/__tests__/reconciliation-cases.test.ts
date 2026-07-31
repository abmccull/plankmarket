import { describe, expect, it, vi } from "vitest";
import {
  openReconciliationCase,
  resolveReconciliationCaseByKey,
} from "@/server/services/reconciliation-cases";

const CASE_ID = "11111111-1111-4111-8111-111111111111";

describe("reconciliation case persistence", () => {
  it("opens a stable case and records its audit event in one transaction", async () => {
    const eventValues = vi.fn().mockResolvedValue(undefined);
    const caseRecord = {
      id: CASE_ID,
      caseKey: "payment:order-1",
      status: "open",
    };
    const tx = {
      insert: vi
        .fn()
        .mockImplementationOnce(() => ({
          values: vi.fn(() => ({
            onConflictDoNothing: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([caseRecord]),
            })),
          })),
        }))
        .mockImplementationOnce(() => ({ values: eventValues })),
      update: vi.fn(),
    };
    const database = {
      transaction: vi.fn(
        async (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    const result = await openReconciliationCase(database as never, {
      caseKey: "payment:order-1",
      type: "payment_mismatch",
      source: "stripe",
      severity: "critical",
      title: "Payment mismatch",
      summary: "Captured amount does not match the order.",
      orderId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result).toEqual(caseRecord);
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(eventValues).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: CASE_ID,
        eventType: "opened",
      }),
    );
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("updates the existing stable key instead of opening a duplicate", async () => {
    const eventValues = vi.fn().mockResolvedValue(undefined);
    const caseRecord = {
      id: CASE_ID,
      caseKey: "payment:order-1",
      status: "open",
    };
    const updateReturning = vi.fn().mockResolvedValue([caseRecord]);
    const tx = {
      insert: vi
        .fn()
        .mockImplementationOnce(() => ({
          values: vi.fn(() => ({
            onConflictDoNothing: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([]),
            })),
          })),
        }))
        .mockImplementationOnce(() => ({ values: eventValues })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: updateReturning })),
        })),
      })),
    };
    const database = {
      transaction: vi.fn(
        async (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    await openReconciliationCase(database as never, {
      caseKey: "payment:order-1",
      type: "payment_mismatch",
      source: "stripe",
      severity: "critical",
      title: "Payment mismatch",
      summary: "Provider evidence was refreshed.",
    });

    expect(updateReturning).toHaveBeenCalledTimes(1);
    expect(eventValues).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: CASE_ID,
        eventType: "provider_update",
      }),
    );
  });

  it("resolves an active case once and leaves webhook replays idempotent", async () => {
    const current = {
      id: CASE_ID,
      caseKey: "chargeback:dp_1",
      status: "open",
      details: {},
    };
    const eventValues = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi
            .fn()
            .mockResolvedValue([{ ...current, status: "resolved" }]),
        })),
      })),
    }));
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn().mockResolvedValue([current]),
          })),
        })),
      })),
      update,
      insert: vi.fn(() => ({ values: eventValues })),
    };
    const database = {
      transaction: vi.fn(
        async (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    await resolveReconciliationCaseByKey(database as never, {
      caseKey: current.caseKey,
      resolution: "Stripe closed the dispute as won.",
      details: { providerStatus: "won" },
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(eventValues).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: CASE_ID,
        eventType: "resolved",
        metadata: expect.objectContaining({ providerStatus: "won" }),
      }),
    );

    const terminalTx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi
              .fn()
              .mockResolvedValue([{ ...current, status: "resolved" }]),
          })),
        })),
      })),
      update: vi.fn(),
      insert: vi.fn(),
    };
    const terminalDb = {
      transaction: vi.fn(
        async (callback: (value: typeof terminalTx) => Promise<unknown>) =>
          callback(terminalTx),
      ),
    };
    await resolveReconciliationCaseByKey(terminalDb as never, {
      caseKey: current.caseKey,
      resolution: "Duplicate close event.",
    });
    expect(terminalTx.update).not.toHaveBeenCalled();
    expect(terminalTx.insert).not.toHaveBeenCalled();
  });
});
