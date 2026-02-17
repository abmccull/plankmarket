// src/lib/utils/__tests__/celebrate.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock sonner BEFORE importing the module under test.
// ---------------------------------------------------------------------------
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock canvas-confetti as a dynamic import.
// celebrateMilestone uses: import("canvas-confetti").then(m => m.default(...))
// We mock the module so the dynamic import resolves to our spy.
// ---------------------------------------------------------------------------
const confettiSpy = vi.fn().mockReturnValue(Promise.resolve());

vi.mock("canvas-confetti", () => ({
  default: confettiSpy,
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered.
// ---------------------------------------------------------------------------
import { celebrateMilestone } from "@/lib/utils/celebrate";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("celebrateMilestone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should call toast.success with the provided title and description", () => {
    celebrateMilestone("First Sale!", "You just made your first sale.");

    expect(toast.success).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith("First Sale!", {
      description: "You just made your first sale.",
      duration: 5000,
    });
  });

  it("should call toast.success with a 5000ms duration", () => {
    celebrateMilestone("Milestone", "Description");

    const [, options] = (toast.success as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.duration).toBe(5000);
  });

  it("should trigger the confetti animation after toast", async () => {
    celebrateMilestone("Congrats!", "Well done.");

    // Let the dynamic import resolve
    await vi.dynamicImportSettled();

    expect(confettiSpy).toHaveBeenCalledOnce();
    expect(confettiSpy).toHaveBeenCalledWith({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  });

  it("should call toast.success with the exact title string", () => {
    const title = "You reached 100 orders!";
    celebrateMilestone(title, "Keep it up.");

    expect(toast.success).toHaveBeenCalledWith(
      title,
      expect.objectContaining({ description: "Keep it up." })
    );
  });

  it("should call toast.success with the exact description string", () => {
    celebrateMilestone("Title", "Special description text.");

    expect(toast.success).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ description: "Special description text." })
    );
  });

  it("should handle empty title and description gracefully", () => {
    expect(() => celebrateMilestone("", "")).not.toThrow();
    expect(toast.success).toHaveBeenCalledWith("", {
      description: "",
      duration: 5000,
    });
  });

  it("should not throw when canvas-confetti fails silently", async () => {
    // Override the spy to simulate a rejection — the .catch(() => {}) in
    // celebrateMilestone must swallow this without propagating to the test
    confettiSpy.mockRejectedValueOnce(new Error("Confetti failed"));

    expect(() => celebrateMilestone("Test", "Test")).not.toThrow();

    // Awaiting the settled promises ensures any unhandled rejections surface
    // before the test completes — the test should still pass
    await vi.dynamicImportSettled();

    // Toast should still have fired
    expect(toast.success).toHaveBeenCalledOnce();
  });
});
