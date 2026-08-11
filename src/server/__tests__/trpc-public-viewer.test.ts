import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.SKIP_ENV_VALIDATION = "1";

const mocks = vi.hoisted(() => {
  const getUser = vi.fn();
  const findFirst = vi.fn();

  return {
    getUser,
    findFirst,
    createClient: vi.fn(async () => ({
      auth: {
        getUser,
      },
    })),
  };
});

vi.mock("@/server/db", () => ({
  db: {
    query: {
      users: {
        findFirst: mocks.findFirst,
      },
    },
    insert: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/redis/client", () => ({
  getRedisClient: () => ({}),
}));

vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: vi.fn(),
}));

const { resolveRequestViewerFromHeaders } = await import("@/server/trpc");

describe("resolveRequestViewerFromHeaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips Supabase auth work for anonymous public reads with no session cookie", async () => {
    const result = await resolveRequestViewerFromHeaders(new Headers(), {
      allowAnonymousShortcut: true,
    });

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(result.authUser).toBeNull();
    expect(result.user).toBeNull();
    expect(result.clientIp).toBe("unknown");
  });

  it("still resolves a viewer when a Supabase session cookie is present", async () => {
    const dbUser = {
      id: "user-1",
      authId: "auth-user-1",
      role: "buyer",
      verificationStatus: "verified",
      businessState: "TX",
      active: true,
    };
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "auth-user-1",
          email: "buyer@example.com",
          app_metadata: { role: "buyer" },
          user_metadata: {},
        },
      },
    });
    mocks.findFirst.mockResolvedValue(dbUser);

    const result = await resolveRequestViewerFromHeaders(
      new Headers({
        cookie: "sb-test-auth-token=abc123",
        "x-forwarded-for": "203.0.113.42",
      }),
      { allowAnonymousShortcut: true },
    );

    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(result.authUser?.id).toBe("auth-user-1");
    expect(result.user).toBe(dbUser);
    expect(result.clientIp).toBe("203.0.113.42");
  });
});
