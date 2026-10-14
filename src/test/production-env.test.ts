/** @vitest-environment node */
import { afterEach, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function makeEnvFile(content: string) {
  const dir = mkdtempSync(join(tmpdir(), "plankmarket-env-"));
  tempDirs.push(dir);
  const path = join(dir, ".env");
  writeFileSync(path, content);
  return path;
}

function runPreflight(
  path: string,
  env: NodeJS.ProcessEnv = {},
) {
  return spawnSync(
    process.execPath,
    ["scripts/check-production-env.mjs", "--file", path],
    {
      encoding: "utf8",
      env: { ...process.env, ...env },
    },
  );
}

/** Minimal production-shaped values that satisfy every strict check except the gated ones. */
function validProductionEnv(
  overrides: Record<string, string | undefined> = {},
) {
  const base: Record<string, string | undefined> = {
    DATABASE_URL:
      "postgresql://postgres:password@db.prod-host.supabase.co:5432/postgres",
    DATABASE_MIGRATION_URL:
      "postgresql://postgres:password@db-direct.prod-host.supabase.co:5432/postgres",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-with-enough-characters-123456",
    STRIPE_SECRET_KEY: "sk_live_test_ci_only_not_a_real_key",
    STRIPE_WEBHOOK_SECRET: "whsec_test_ci_only_not_a_real_sec",
    STRIPE_TAX_MODE: "platform_liable",
    STRIPE_TAX_LEGAL_DECISION_ACKNOWLEDGED: "true",
    STRIPE_TAX_LEGAL_DECISION_REFERENCE: "legal-memo-2026-01",
    STRIPE_TAX_SHIPPING_TAX_CODE: "txcd_92010001",
    STRIPE_TAX_BUYER_FEE_TREATMENT: "excluded",
    UPLOADTHING_TOKEN: "uploadthing-token-16+",
    RESEND_API_KEY: "re_test_ci_only_not_a_real_key",
    RESEND_WEBHOOK_SECRET: "whsec_test_ci_only_resend_secret",
    UPSTASH_REDIS_REST_URL: "https://redis.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "upstash-token-16chars",
    INNGEST_EVENT_KEY: "inngest-event-key-16",
    INNGEST_SIGNING_KEY: "inngest-signing-key-16",
    VERIFICATION_WEBHOOK_SECRET: "verification-webhook-secret-32chars!!",
    VERIFICATION_DOC_ALLOWED_HOSTS: "storage.plankmarket.com",
    PRIORITY1_API_KEY: "priority1-api-key-16",
    PRIORITY1_DOCUMENT_ALLOWED_HOSTS: "docs.priority1.com",
    PRIORITY1_DRY_RUN: "false",
    CRON_SECRET: "cron-secret-with-at-least-32-characters",
    NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-with-enough-characters-1234567890",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_test_ci_only_not_a_real_key",
    NEXT_PUBLIC_APP_URL: "https://www.plankmarket.com",
    ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS: "false",
    ...overrides,
  };

  return Object.entries(base)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

it("fails missing production services, handles tax policy and never prints supplied secrets", () => {
  const secret = "sensitive-secret-must-never-appear";
  const path = makeEnvFile(
    `STRIPE_SECRET_KEY=${secret}\nSTRIPE_TAX_MODE=platform_liable\n`,
  );
  const result = runPreflight(path, { PLANKMARKET_PRELAUNCH: "false" });
  const output = result.stdout + result.stderr;
  expect(result.status).toBe(1);
  expect(output).not.toContain(secret);
  expect(output).not.toContain("is not defined");
  for (const key of [
    "RESEND_API_KEY",
    "INNGEST_EVENT_KEY",
    "INNGEST_SIGNING_KEY",
    "CRON_SECRET",
    "VERIFICATION_DOC_ALLOWED_HOSTS",
    "PRIORITY1_DOCUMENT_ALLOWED_HOSTS",
  ]) {
    expect(output).toContain(key);
  }
  expect(output).toContain("requires legal acknowledgement");
});

it.each(["", "STRIPE_TAX_MODE=disabled\n"])(
  "rejects production tax disabled or omitted when prelaunch is false",
  (content) => {
    const path = makeEnvFile(content);
    const result = runPreflight(path, { PLANKMARKET_PRELAUNCH: "false" });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      "disabled tax blocks checkout",
    );
  },
);

it("warns (does not fail) on missing Resend + disabled tax under prelaunch default", () => {
  const path = makeEnvFile(
    validProductionEnv({
      STRIPE_TAX_MODE: "disabled",
      RESEND_API_KEY: undefined,
    }),
  );
  // Unset flag → default relaxed prelaunch behavior
  const result = runPreflight(path, { PLANKMARKET_PRELAUNCH: "" });
  const output = result.stdout + result.stderr;
  expect(result.status).toBe(0);
  expect(output).toContain("RESEND_API_KEY");
  expect(output).toContain("disabled tax blocks checkout");
  expect(output).toContain("pre-launch warnings");
  expect(output).toContain("set false before launch");
});

it("still fails closed on missing Resend + disabled tax when prelaunch is false", () => {
  const path = makeEnvFile(
    validProductionEnv({
      STRIPE_TAX_MODE: "disabled",
      RESEND_API_KEY: undefined,
    }),
  );
  const result = runPreflight(path, { PLANKMARKET_PRELAUNCH: "false" });
  const output = result.stdout + result.stderr;
  expect(result.status).toBe(1);
  expect(output).toContain("RESEND_API_KEY");
  expect(output).toContain("disabled tax blocks checkout");
  expect(output).toContain("preflight failed");
});

it("keeps other production checks strict under prelaunch", () => {
  const path = makeEnvFile(
    validProductionEnv({
      STRIPE_TAX_MODE: "disabled",
      INNGEST_EVENT_KEY: undefined,
    }),
  );
  const result = runPreflight(path, { PLANKMARKET_PRELAUNCH: "true" });
  const output = result.stdout + result.stderr;
  expect(result.status).toBe(1);
  expect(output).toContain("INNGEST_EVENT_KEY");
  expect(output).toContain("disabled tax blocks checkout");
});
