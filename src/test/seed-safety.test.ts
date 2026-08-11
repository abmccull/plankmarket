import { describe, expect, it } from "vitest";

import {
  assertDisposableSeedDataset,
  DESTRUCTIVE_SEED_ACK_ENV,
  DESTRUCTIVE_SEED_ACK_VALUE,
  isLocalSeedDatabaseUrl,
  isLocalSeedSupabaseUrl,
  resolveSeedRuntimeConfig,
} from "../../scripts/seed";

function buildEnv(
  overrides: Partial<NodeJS.ProcessEnv> = {},
): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/plankmarket_test",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
    [DESTRUCTIVE_SEED_ACK_ENV]: DESTRUCTIVE_SEED_ACK_VALUE,
    ...overrides,
  };
}

describe("seed safety", () => {
  it("accepts localhost and rejects hosted Postgres targets", () => {
    expect(
      isLocalSeedDatabaseUrl(
        "postgresql://postgres:postgres@localhost:5432/plankmarket_test",
      ),
    ).toBe(true);
    expect(
      isLocalSeedDatabaseUrl(
        "postgresql://postgres:postgres@host.docker.internal:5432/plankmarket_test",
      ),
    ).toBe(true);
    expect(
      isLocalSeedDatabaseUrl(
        "postgresql://postgres:postgres@[::1]:5432/plankmarket_test",
      ),
    ).toBe(true);
    expect(
      isLocalSeedDatabaseUrl(
        "postgresql://postgres:postgres@db.example.supabase.co:5432/postgres",
      ),
    ).toBe(false);
  });

  it("accepts local Supabase and rejects hosted Auth targets", () => {
    expect(isLocalSeedSupabaseUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalSeedSupabaseUrl("http://kong:8000")).toBe(true);
    expect(isLocalSeedSupabaseUrl("http://[::1]:54321")).toBe(true);
    expect(isLocalSeedSupabaseUrl("https://example.supabase.co")).toBe(false);
  });

  it("allows local developer runs without an extra acknowledgment", () => {
    expect(resolveSeedRuntimeConfig(buildEnv())).toMatchObject({
      databaseUrl:
        "postgresql://postgres:postgres@localhost:5432/plankmarket_test",
      nodeEnv: "development",
    });
  });

  it("refuses remote database targets even in development", () => {
    expect(() =>
      resolveSeedRuntimeConfig(
        buildEnv({
          DATABASE_URL:
            "postgresql://postgres:postgres@db.example.supabase.co:5432/postgres",
        }),
      ),
    ).toThrow(/Refusing to seed a non-local database target/);
  });

  it("refuses remote Supabase Auth targets even with a local database", () => {
    expect(() =>
      resolveSeedRuntimeConfig(
        buildEnv({
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        }),
      ),
    ).toThrow(/Refusing to seed a non-local Supabase Auth target/);
  });

  it("requires explicit confirmation even in development", () => {
    expect(() =>
      resolveSeedRuntimeConfig(
        buildEnv({
          [DESTRUCTIVE_SEED_ACK_ENV]: undefined,
        }),
      ),
    ).toThrow(new RegExp(DESTRUCTIVE_SEED_ACK_ENV));
  });

  it("refuses non-development environments even with confirmation", () => {
    expect(() =>
      resolveSeedRuntimeConfig(
        buildEnv({
          NODE_ENV: "production",
        }),
      ),
    ).toThrow(/restricted to development and test environments/);
  });

  it("refuses a local-looking target that contains non-seed identities", () => {
    const seedEmails = new Set(["seed@example.test"]);

    expect(() =>
      assertDisposableSeedDataset(
        [{ email: "real-customer@example.com" }],
        [{ email: "seed@example.test" }],
        seedEmails,
      ),
    ).toThrow(/non-seed identities/);

    expect(() =>
      assertDisposableSeedDataset(
        [],
        [{ email: "real-auth-user@example.com" }],
        seedEmails,
      ),
    ).toThrow(/non-seed identities/);
  });

  it("accepts an empty or entirely seed-owned disposable dataset", () => {
    const seedEmails = new Set(["seed@example.test"]);

    expect(() =>
      assertDisposableSeedDataset([], [], seedEmails),
    ).not.toThrow();
    expect(() =>
      assertDisposableSeedDataset(
        [{ email: "SEED@example.test" }],
        [
          {
            email: null,
            appMetadata: { seededBy: "plankmarket-local-seed-v1" },
          },
        ],
        seedEmails,
      ),
    ).not.toThrow();
  });
});
