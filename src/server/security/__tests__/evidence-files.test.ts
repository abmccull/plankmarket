import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectEvidenceMimeType,
  inspectEvidenceUpload,
  isAllowedEvidenceMimeType,
  sanitizeDownloadFileName,
  shouldForceAttachmentForEvidence,
} from "@/server/security/evidence-files";

const originalFetch = global.fetch;

describe("evidence file policy", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("recognizes supported raster and PDF signatures", () => {
    expect(
      detectEvidenceMimeType(
        new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      ),
    ).toBe("image/jpeg");
    expect(
      detectEvidenceMimeType(
        new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
        ]),
      ),
    ).toBe("image/png");
    expect(
      detectEvidenceMimeType(
        new Uint8Array([
          0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37,
        ]),
      ),
    ).toBe("application/pdf");
  });

  it("rejects mismatched or active content uploads during inspection", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0x3c, 0x73, 0x76, 0x67]).buffer, {
        status: 200,
      }),
    ) as typeof fetch;

    await expect(
      inspectEvidenceUpload({
        fileKey: "evidence.svg",
        fileUrl: "https://utfs.io/f/evidence.svg",
        claimedMimeType: "image/svg+xml",
      }),
    ).rejects.toThrow("Evidence must be a PDF or supported raster image");
  });

  it("rejects when declared and detected evidence types disagree", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        new Uint8Array([
          0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37,
        ]).buffer,
        { status: 200 },
      ),
    ) as typeof fetch;

    await expect(
      inspectEvidenceUpload({
        fileKey: "evidence-file",
        fileUrl: "https://utfs.io/f/evidence-file",
        claimedMimeType: "image/png",
      }),
    ).rejects.toThrow("Evidence content does not match its declared type");
  });

  it("fails closed when the evidence host attempts to redirect", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError("redirect blocked"));
    global.fetch = fetchMock as typeof fetch;

    await expect(
      inspectEvidenceUpload({
        fileKey: "redirected-evidence",
        fileUrl: "https://utfs.io/f/redirected-evidence",
        claimedMimeType: "application/pdf",
      }),
    ).rejects.toThrow("Evidence upload could not be inspected");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://utfs.io/f/redirected-evidence",
      expect.objectContaining({
        redirect: "error",
      }),
    );
  });

  it("bounds retained bytes when a server ignores the range request", async () => {
    const largeChunk = new Uint8Array(512 * 1024);
    largeChunk.set([0x25, 0x50, 0x44, 0x46, 0x2d], 0);
    let canceled = false;

    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(largeChunk);
          },
          cancel() {
            canceled = true;
          },
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    await expect(
      inspectEvidenceUpload({
        fileKey: "large-first-chunk",
        fileUrl: "https://utfs.io/f/large-first-chunk",
        claimedMimeType: "application/pdf",
      }),
    ).resolves.toEqual({ mimeType: "application/pdf" });
    expect(canceled).toBe(true);
  });

  it("marks PDFs for forced attachment and sanitizes filenames", () => {
    expect(isAllowedEvidenceMimeType("image/webp")).toBe(true);
    expect(isAllowedEvidenceMimeType("image/svg+xml")).toBe(false);
    expect(shouldForceAttachmentForEvidence("application/pdf")).toBe(true);
    expect(shouldForceAttachmentForEvidence("image/png")).toBe(false);
    expect(
      sanitizeDownloadFileName("claim receipt<>.pdf", "application/pdf"),
    ).toBe("claim-receipt-.pdf");
  });
});
