import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MFA_REQUIRED_MESSAGE } from "@/lib/auth/auth-assurance";

const MEDIA_ID = "66666666-6666-4666-8666-666666666666";
const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getAssurance: vi.fn(),
  findViewer: vi.fn(),
  findEvidence: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mocks.getUser,
      mfa: { getAuthenticatorAssuranceLevel: mocks.getAssurance },
    },
  })),
}));

vi.mock("@/server/db", () => ({
  db: {
    query: {
      users: {
        findFirst: mocks.findViewer,
      },
      disputeEvidence: {
        findFirst: mocks.findEvidence,
      },
    },
  },
}));

const { GET } = await import("./route");
const originalFetch = global.fetch;

describe("GET /api/disputes/evidence/[mediaId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn().mockResolvedValue(new Response("synthetic evidence")) as typeof fetch;
    mocks.getAssurance.mockResolvedValue({ data: { currentLevel: "aal2" }, error: null });

    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "auth-buyer",
        },
      },
    });
    mocks.findViewer.mockResolvedValue({
      id: BUYER_ID,
      role: "buyer",
      active: true,
    });
    mocks.findEvidence.mockResolvedValue({
      id: "evidence-1",
      media: {
        id: MEDIA_ID,
        url: "https://utfs.io/f/claim-doc",
        key: "claim-doc",
        fileName: "claim-doc.pdf",
        fileSize: 128,
        mimeType: "application/pdf",
      },
      dispute: {
        id: "dispute-1",
        order: {
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
        },
      },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each(["aal1", "missing", "error", "rejected"])("blocks admin evidence access when assurance is %s", async (state) => {
    mocks.findViewer.mockResolvedValue({ id: "admin-test", role: "admin", active: true });
    if (state === "rejected") mocks.getAssurance.mockRejectedValueOnce(new Error("Auth unavailable"));
    else mocks.getAssurance.mockResolvedValueOnce({ data: state === "missing" ? null : { currentLevel: state === "aal1" ? "aal1" : "aal2" }, error: state === "error" ? new Error("Auth unavailable") : null });
    const response = await GET(new Request("http://localhost/api/disputes/evidence/test"), { params: Promise.resolve({ mediaId: MEDIA_ID }) });
    expect(response.status).toBe(state === "error" || state === "rejected" ? 503 : 403);
    if (state === "aal1") expect(await response.json()).toEqual({ error: MFA_REQUIRED_MESSAGE });
    expect(mocks.getAssurance).toHaveBeenCalledTimes(1);
    expect(mocks.findEvidence).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(["buyer", "seller", "admin"])("allows authorized %s evidence access with the appropriate assurance", async (role) => {
    mocks.findViewer.mockResolvedValue({ id: role === "buyer" ? BUYER_ID : role === "seller" ? SELLER_ID : "admin-test", role, active: true });
    if (role !== "admin") mocks.getAssurance.mockRejectedValueOnce(new Error("Participant access must not require MFA"));
    const response = await GET(new Request("http://localhost/api/disputes/evidence/test"), { params: Promise.resolve({ mediaId: MEDIA_ID }) });
    expect(response.status).toBe(200);
    expect(mocks.getAssurance).toHaveBeenCalledTimes(role === "admin" ? 1 : 0);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
  });

  it.each(["buyer", "seller"])("rejects unrelated %s evidence access", async (role) => {
    mocks.findViewer.mockResolvedValue({ id: "unrelated-user", role, active: true });
    const response = await GET(new Request("http://localhost/api/disputes/evidence/test"), { params: Promise.resolve({ mediaId: MEDIA_ID }) });
    expect(response.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mocks.getAssurance).not.toHaveBeenCalled();
  });

  it("rejects inactive accounts before any evidence lookup", async () => {
    mocks.findViewer.mockResolvedValue({ id: "admin-test", role: "admin", active: false });
    const response = await GET(new Request("http://localhost/api/disputes/evidence/test"), { params: Promise.resolve({ mediaId: MEDIA_ID }) });
    expect(response.status).toBe(401);
    expect(mocks.findEvidence).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("streams evidence through the protected proxy without following redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer, {
        status: 200,
        headers: { "content-length": "5" },
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    const response = await GET(
      new Request("https://www.plankmarket.com/api/disputes/evidence/test"),
      { params: Promise.resolve({ mediaId: MEDIA_ID }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://utfs.io/f/claim-doc",
      expect.objectContaining({
        redirect: "error",
      }),
    );
  });

  it("returns a 502 when the upstream evidence host attempts a redirect", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError("redirect blocked")) as typeof fetch;

    const response = await GET(
      new Request("https://www.plankmarket.com/api/disputes/evidence/test"),
      { params: Promise.resolve({ mediaId: MEDIA_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: "Evidence file could not be fetched",
    });
  });
});
