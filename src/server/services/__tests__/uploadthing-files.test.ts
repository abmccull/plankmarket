import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));

const {
  deleteMediaWithProvider,
  deleteUploadThingFile,
  getUploadThingFileKeyFromUrl,
} = await import("@/server/services/uploadthing-files");

describe("UploadThing deletion", () => {
  it("treats an already-missing remote object as an idempotent success", async () => {
    const deleteFiles = vi.fn().mockResolvedValue({
      success: true,
      deletedCount: 0,
    });

    await expect(
      deleteUploadThingFile("file-key", { deleteFiles }),
    ).resolves.toBeUndefined();
  });

  it("does not delete database metadata when provider deletion fails", async () => {
    const deleteMetadata = vi.fn().mockResolvedValue(undefined);
    const deleteRemote = vi
      .fn()
      .mockRejectedValue(new Error("provider unavailable"));

    await expect(
      deleteMediaWithProvider({
        key: "file-key",
        deleteRemote,
        deleteMetadata,
      }),
    ).rejects.toThrow("provider unavailable");
    expect(deleteMetadata).not.toHaveBeenCalled();
  });

  it("deletes metadata only after provider success", async () => {
    const calls: string[] = [];
    await deleteMediaWithProvider({
      key: "file-key",
      deleteRemote: async () => {
        calls.push("remote");
      },
      deleteMetadata: async () => {
        calls.push("metadata");
      },
    });

    expect(calls).toEqual(["remote", "metadata"]);
  });

  it("extracts trusted UploadThing keys from hosted file URLs", () => {
    expect(
      getUploadThingFileKeyFromUrl("https://utfs.io/f/verification-doc"),
    ).toBe("verification-doc");
    expect(
      getUploadThingFileKeyFromUrl(
        "https://example-app.ufs.sh/f/verification%20doc",
      ),
    ).toBe("verification doc");
    expect(
      getUploadThingFileKeyFromUrl("https://example.com/f/verification-doc"),
    ).toBeNull();
  });
});
