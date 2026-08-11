import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteUploadThingFile: vi.fn(),
  inspectEvidenceUpload: vi.fn(),
}));

vi.mock("uploadthing/next", () => ({
  createUploadthing: () => {
    const chain = {
      input: () => chain,
      middleware: () => chain,
      onUploadComplete: () => ({}),
    };
    return () => chain;
  },
}));

vi.mock("uploadthing/server", () => ({
  UploadThingError: class UploadThingError extends Error {
    code: string;

    constructor(options: { code: string; message: string }) {
      super(options.message);
      this.name = "UploadThingError";
      this.code = options.code;
    }
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    query: {},
  },
}));

vi.mock("@/server/security/evidence-files", () => ({
  inspectEvidenceUpload: mocks.inspectEvidenceUpload,
}));

vi.mock("@/server/services/uploadthing-files", () => ({
  deleteUploadThingFile: mocks.deleteUploadThingFile,
}));

const {
  validateDisputeUploadThingFile,
  validateListingOrBuyerUploadThingFile,
} = await import("../core");

describe("UploadThing callback validators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteUploadThingFile.mockResolvedValue(undefined);
  });

  it("keeps dispute evidence sniffing on the dispute callback path", async () => {
    mocks.inspectEvidenceUpload.mockResolvedValue({
      mimeType: "application/pdf",
    });

    await expect(
      validateDisputeUploadThingFile({
        key: "claim-doc",
        type: "application/pdf",
        url: "https://utfs.io/f/claim-doc",
      }),
    ).resolves.toBe("application/pdf");
    expect(mocks.deleteUploadThingFile).not.toHaveBeenCalled();
  });

  it("deletes disputed uploads when content sniffing detects a mismatch", async () => {
    mocks.inspectEvidenceUpload.mockRejectedValue(
      new Error("Evidence content does not match its declared type"),
    );

    await expect(
      validateDisputeUploadThingFile({
        key: "claim-doc",
        type: "image/png",
        url: "https://utfs.io/f/claim-doc",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Evidence content does not match its declared type",
    });
    expect(mocks.deleteUploadThingFile).toHaveBeenCalledWith("claim-doc");
  });

  it("rejects non-raster payloads on listing and buyer image uploaders", async () => {
    mocks.inspectEvidenceUpload.mockResolvedValue({
      mimeType: "application/pdf",
    });

    await expect(
      validateListingOrBuyerUploadThingFile({
        key: "listing-doc",
        type: "application/pdf",
        url: "https://utfs.io/f/listing-doc",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Uploads must be supported raster images",
    });
    expect(mocks.deleteUploadThingFile).toHaveBeenCalledWith("listing-doc");
  });
});
