import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createTRPCContext } from "@/server/trpc";
process.env.SKIP_ENV_VALIDATION = "1";
const mocks = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}) }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class { static slidingWindow() { return {}; } async limit() { return { success: true }; } } }));
vi.mock("@/server/services/content-moderation", () => ({ checkViolationStatus: vi.fn() }));
vi.mock("@/server/services/uploadthing-files", () => ({ deleteOwnedMediaWithProvider: mocks.remove, MediaDeletionError: class extends Error {} }));
const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { uploadRouter } = await import("@/server/routers/upload");
const createCaller = createCallerFactory(createTRPCRouter({ upload: uploadRouter }));
const ID = "11111111-1111-4111-8111-111111111111";
function context(role: "buyer" | "seller", verificationStatus = "verified", active = true) {
  return { db: {}, authUser: { id: "auth-synthetic" }, user: { id: ID, role, verificationStatus, active }, clientIp: "127.0.0.1", getAuthAssurance: vi.fn().mockRejectedValue(new Error("No buyer MFA")), supabase: {} } as unknown as Awaited<ReturnType<typeof createTRPCContext>>;
}
beforeEach(() => { vi.resetAllMocks(); mocks.remove.mockResolvedValue(undefined); });
describe("buyer media uses purchasing capability and owner identity", () => {
  it.each(["buyer", "seller"] as const)("allows verified %s to delete only through its owner identity", async role => {
    const ctx = context(role);
    await expect(createCaller(ctx).upload.deleteBuyerMedia({ id: ID })).resolves.toEqual({ success: true });
    expect(mocks.remove).toHaveBeenCalledWith({ mediaId: ID, uploaderId: ID, database: ctx.db });
    expect(ctx.getAuthAssurance).not.toHaveBeenCalled();
  });
  it.each(["pending", "unverified", "rejected"])("rejects %s seller before media deletion", async status => {
    await expect(createCaller(context("seller", status)).upload.deleteBuyerMedia({ id: ID })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("rejects suspended seller before media deletion", async () => {
    await expect(createCaller(context("seller", "verified", false)).upload.deleteBuyerMedia({ id: ID })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("does not grant seller media actions to a buyer", async () => {
    await expect(createCaller(context("buyer")).upload.deleteMedia({ id: ID })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
