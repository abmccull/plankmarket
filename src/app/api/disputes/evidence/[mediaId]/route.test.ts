import { beforeEach, describe, expect, it, vi } from "vitest";

const MEDIA_ID = "66666666-6666-4666-8666-666666666666";
const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findViewer: vi.fn(),
  findEvidence: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mocks.getUser,
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
    vi.clearAllMocks();
    global.fetch = originalFetch;

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
