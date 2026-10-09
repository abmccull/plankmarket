import { beforeEach, describe, expect, it, vi } from "vitest";
import { MFA_REQUIRED_MESSAGE } from "@/lib/auth/auth-assurance";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  deleteUploadThingFile: vi.fn(),
  inspectEvidenceUpload: vi.fn(),
  getUser: vi.fn(),
  getAssurance: vi.fn(),
  findUser: vi.fn(),
  findOrder: vi.fn(),
  findListing: vi.fn(),
  persistTrustedUpload: vi.fn(),
}));

vi.mock("uploadthing/next", () => ({
  createUploadthing: () => () => {
    let testMiddleware: unknown;
    const chain = {
      input: () => chain,
      middleware: (callback: unknown) => { testMiddleware = callback; return chain; },
      onUploadComplete: () => ({ testMiddleware }),
    };
    return chain;
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
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser, mfa: { getAuthenticatorAssuranceLevel: mocks.getAssurance } } })),
}));

vi.mock("@/server/db", () => ({
  db: {
    query: { users: { findFirst: mocks.findUser }, orders: { findFirst: mocks.findOrder }, listings: { findFirst: mocks.findListing } },
  },
}));

vi.mock("@/server/security/evidence-files", () => ({
  inspectEvidenceUpload: mocks.inspectEvidenceUpload,
}));

vi.mock("@/server/services/uploadthing-files", () => ({
  deleteUploadThingFile: mocks.deleteUploadThingFile,
}));

vi.mock("@/server/services/trusted-upload", () => ({ persistTrustedUpload: mocks.persistTrustedUpload }));

const {
  ourFileRouter,
  validateDisputeUploadThingFile,
  validateListingOrBuyerUploadThingFile,
} = await import("../core");

describe("registered UploadThing middleware assurance", () => {
  const USER_ID = "11111111-1111-4111-8111-111111111111";
  const ORDER_ID = "44444444-4444-4444-8444-444444444444";
  const LISTING_ID = "33333333-3333-4333-8333-333333333333";
  const uploaders = ["listingImageUploader", "buyerRequestImageUploader", "disputeEvidenceUploader"] as const;
  function invoke(name: typeof uploaders[number]) {
    const uploader = ourFileRouter[name] as unknown as { testMiddleware: (args: { input: { orderId: string; listingId: string } }) => Promise<unknown> };
    return uploader.testMiddleware({ input: { orderId: ORDER_ID, listingId: LISTING_ID } });
  }
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-test" } } });
    mocks.findUser.mockResolvedValue({ id: USER_ID, role: "admin", active: true, verificationStatus: "verified" });
    mocks.getAssurance.mockResolvedValue({ data: { currentLevel: "aal2" }, error: null });
    mocks.findOrder.mockResolvedValue({ id: ORDER_ID });
    mocks.findListing.mockResolvedValue({ id: LISTING_ID });
  });

  it.each(uploaders)("rejects AAL1 admin on %s before preparing an upload", async (name) => {
    mocks.getAssurance.mockResolvedValue({ data: { currentLevel: "aal1" }, error: null });
    await expect(invoke(name)).rejects.toMatchObject({ code: "FORBIDDEN", message: MFA_REQUIRED_MESSAGE });
    expect(mocks.getAssurance).toHaveBeenCalledTimes(1);
    expect(mocks.findOrder).not.toHaveBeenCalled();
    expect(mocks.findListing).not.toHaveBeenCalled();
    expect(mocks.persistTrustedUpload).not.toHaveBeenCalled();
  });

  it.each(uploaders)("allows AAL2 admin on %s", async (name) => {
    await expect(invoke(name)).resolves.toMatchObject({ userId: USER_ID });
    expect(mocks.getAssurance).toHaveBeenCalledTimes(1);
  });

  it.each(uploaders)("fails closed on %s when assurance is unavailable", async (name) => {
    mocks.getAssurance.mockRejectedValue(new Error("Auth unavailable"));
    await expect(invoke(name)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.findOrder).not.toHaveBeenCalled();
    expect(mocks.findListing).not.toHaveBeenCalled();
  });

  it.each(["missing", "error"])("rejects %s assurance data even if an AAL2 value is present", async (state) => {
    mocks.getAssurance.mockResolvedValue({ data: state === "missing" ? null : { currentLevel: "aal2" }, error: state === "error" ? new Error("Auth unavailable") : null });
    await expect(invoke("disputeEvidenceUploader")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.findOrder).not.toHaveBeenCalled();
  });

  it.each([
    ["seller", "listingImageUploader"],
    ["buyer", "buyerRequestImageUploader"],
    ["seller", "buyerRequestImageUploader"],
    ["buyer", "disputeEvidenceUploader"],
    ["seller", "disputeEvidenceUploader"],
  ] as const)("preserves verified %s access on %s without requiring MFA", async (role, name) => {
    mocks.findUser.mockResolvedValue({ id: USER_ID, role, active: true, verificationStatus: "verified" });
    mocks.getAssurance.mockRejectedValue(new Error("Unexpected MFA lookup"));
    await expect(invoke(name)).resolves.toMatchObject({ userId: USER_ID });
    expect(mocks.getAssurance).not.toHaveBeenCalled();
    if (name === "disputeEvidenceUploader") {
      const query = new PgDialect().sqlToQuery(mocks.findOrder.mock.calls[0][0].where);
      expect(query.params).toEqual([ORDER_ID, USER_ID, USER_ID]);
      expect(query.sql).toContain('("orders"."buyer_id" = $2 or "orders"."seller_id" = $3)');
    }
  });

  it.each(["buyer", "seller"] as const)("retains order ownership checks for %s", async (role) => {
    mocks.findUser.mockResolvedValue({ id: USER_ID, role, active: true, verificationStatus: "verified" });
    mocks.findOrder.mockResolvedValue(null);
    await expect(invoke("disputeEvidenceUploader")).rejects.toMatchObject({ code: "FORBIDDEN", message: "You can only upload evidence for your own order" });
  });

  it.each(uploaders)("rejects suspended admin on %s", async (name) => {
    mocks.findUser.mockResolvedValue({ id: USER_ID, role: "admin", active: false, verificationStatus: "verified" });
    await expect(invoke(name)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getAssurance).not.toHaveBeenCalled();
    expect(mocks.findOrder).not.toHaveBeenCalled();
    expect(mocks.findListing).not.toHaveBeenCalled();
  });

  it.each(["buyer", "seller"] as const)("retains verification requirement for %s evidence uploads", async (role) => {
    mocks.findUser.mockResolvedValue({ id: USER_ID, role, active: true, verificationStatus: "pending" });
    await expect(invoke("disputeEvidenceUploader")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.findOrder).not.toHaveBeenCalled();
  });
});

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

  it("rejects mismatched content without deleting a possibly retained callback retry", async () => {
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
    expect(mocks.deleteUploadThingFile).not.toHaveBeenCalled();
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
    expect(mocks.deleteUploadThingFile).not.toHaveBeenCalled();
  });
});
