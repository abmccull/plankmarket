/** @vitest-environment node */
import { afterEach, expect, it, vi } from "vitest";

// Failure inventory: a missing preview flag selects live carrier calls;
// production inherits preview defaults; explicit settings are lost; environment
// validation is accidentally bypassed; test configuration leaks between cases.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function shippingMode(vercelEnvironment: string, flag?: string) {
  vi.resetModules();
  for (const [key, value] of Object.entries({
    NODE_ENV: "production",
    VERCEL_ENV: vercelEnvironment,
    SKIP_ENV_VALIDATION: "",
    DATABASE_URL: "postgresql://fixture@127.0.0.1:55440/disconnected",
    SUPABASE_SERVICE_ROLE_KEY: "local-fixture",
    STRIPE_SECRET_KEY: "sk_test_disconnected",
    STRIPE_WEBHOOK_SECRET: "whsec_local",
    UPLOADTHING_TOKEN: "local-fixture",
    UPSTASH_REDIS_REST_URL: "http://127.0.0.1:3102",
    UPSTASH_REDIS_REST_TOKEN: "local-fixture",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3102",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-fixture",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_local",
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3103",
    RESEND_API_KEY: "re_local",
    RESEND_WEBHOOK_SECRET: "whsec_local",
    INNGEST_EVENT_KEY: "local-fixture-key-123456",
    INNGEST_SIGNING_KEY: "local-fixture",
    VERIFICATION_WEBHOOK_SECRET: "local-fixture-key-12345678901234567890",
    VERIFICATION_DOC_ALLOWED_HOSTS: "documents.test",
    PRIORITY1_API_KEY: "local-fixture",
    PRIORITY1_DOCUMENT_ALLOWED_HOSTS: "carrier.test",
    CRON_SECRET: "local-fixture-key-12345678901234567890",
  })) vi.stubEnv(key, value);
  vi.stubEnv("PRIORITY1_DRY_RUN", flag);
  return (await import("@/env")).env.PRIORITY1_DRY_RUN;
}

it("defaults Vercel preview shipping to dry-run without bypassing validation", async () => {
  expect(await shippingMode("preview")).toBe("true");
});

it("keeps production shipping live by default", async () => {
  expect(await shippingMode("production")).toBe("false");
});

it("rejects dry-run mode in live production", async () => {
  await expect(shippingMode("production", "true")).rejects.toThrow();
});

it("preserves an explicit preview dry-run setting", async () => {
  expect(await shippingMode("preview", "true")).toBe("true");
});
