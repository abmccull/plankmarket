import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.SKIP_ENV_VALIDATION = "1";

const mocks = vi.hoisted(() => {
  const findFirst = vi.fn();
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  const insert = vi.fn().mockReturnValue({ values });
  const getUser = vi.fn();

  return {
    findFirst,
    insert,
    values,
    onConflictDoNothing,
    getUser,
  };
});

vi.mock("@/server/db", () => ({
  db: {
    query: {
      users: {
        findFirst: mocks.findFirst,
      },
    },
    insert: mocks.insert,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: mocks.getUser,
    },
  }),
}));

vi.mock("@/lib/redis/client", () => ({
  getRedisClient: () => ({}),
}));

vi.mock("@/server/services/content-moderation", () => ({
  checkViolationStatus: vi.fn(),
}));

const { createTRPCContext } = await import("@/server/trpc");

function contextOptions() {
  return {
    req: new Request("https://plankmarket.com/api/trpc"),
    resHeaders: new Headers(),
    info: {
      calls: [],
      isBatchCall: false,
      accept: null,
      type: "query",
      connectionParams: null,
      signal: new AbortController().signal,
      url: null,
    },
  } as Parameters<typeof createTRPCContext>[0];
}

describe("tRPC profile provisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.values.mockReturnValue({
      onConflictDoNothing: mocks.onConflictDoNothing,
    });
    mocks.onConflictDoNothing.mockResolvedValue(undefined);
  });

  it("does not default an auth identity with no trusted role to buyer", async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "auth-user-1",
          email: "person@example.com",
          app_metadata: {},
          user_metadata: { role: "admin", name: "Untrusted Name" },
        },
      },
    });
    mocks.findFirst.mockResolvedValue(null);

    const context = await createTRPCContext(contextOptions());

    expect(context.authUser?.id).toBe("auth-user-1");
    expect(context.user).toBeNull();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("auto-provisions only from the server-controlled app role", async () => {
    const provisionedUser = {
      id: "user-1",
      authId: "auth-user-1",
      role: "seller",
      active: true,
    };
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "auth-user-1",
          email: "seller@example.com",
          app_metadata: { role: "seller" },
          user_metadata: { role: "admin", name: "Seller" },
        },
      },
    });
    mocks.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(provisionedUser);

    const context = await createTRPCContext(contextOptions());

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ role: "seller" }),
    );
    expect(context.user).toBe(provisionedUser);
  });
});
