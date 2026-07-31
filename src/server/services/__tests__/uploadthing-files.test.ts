import { describe, expect, it, vi } from "vitest";
import {
  deleteMediaWithProvider,
  deleteUploadThingFile,
} from "@/server/services/uploadthing-files";

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
});
