import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { parse as parseDotEnv } from "dotenv";
import { z } from "zod";

const args = process.argv.slice(2);
const fileFlagIndex = args.findIndex((arg) => arg === "--file");
const requestedFile =
  fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : undefined;
const modeFlagIndex = args.findIndex((arg) => arg === "--mode");
const requestedMode =
  modeFlagIndex >= 0 ? args[modeFlagIndex + 1] : "production";

if (fileFlagIndex >= 0 && !requestedFile) {
  console.error("Missing value for --file");
  process.exit(1);
}

if (modeFlagIndex >= 0 && !args[modeFlagIndex + 1]) {
  console.error("Missing value for --mode");
  process.exit(1);
}

if (!["preview", "production"].includes(requestedMode)) {
  console.error("--mode must be either preview or production");
  process.exit(1);
}

function loadEnvSource() {
  if (requestedFile) {
    const filePath = resolve(process.cwd(), requestedFile);
    if (!existsSync(filePath)) {
      throw new Error(`Env file not found: ${filePath}`);
    }

    return {
      sourceLabel: filePath,
      env: parseDotEnv(readFileSync(filePath)),
    };
  }

  const defaultFile = resolve(process.cwd(), ".env.local");
  if (existsSync(defaultFile)) {
    return {
      sourceLabel: defaultFile,
      env: {
        ...parseDotEnv(readFileSync(defaultFile)),
        ...process.env,
      },
    };
  }

  return {
    sourceLabel: "process environment",
    env: process.env,
  };
}

const placeholderPatterns = [
  /your-/i,
  /replace-with/i,
  /example\.com/i,
  /localhost/i,
  /127\.0\.0\.1/i,
  /^local[-_]/i,
  /dummy/i,
];

function isPlaceholder(value) {
  return placeholderPatterns.some((pattern) => pattern.test(value));
}

function looksLikeHostedDatabaseUrl(value) {
  try {
    const url = new URL(value);
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

const schema = z.object({
  DATABASE_URL: z.string().refine(looksLikeHostedDatabaseUrl, {
    message: "must be a non-local postgres connection string",
  }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(32),
  STRIPE_SECRET_KEY:
    requestedMode === "production"
      ? z.string().startsWith("sk_live_").min(20)
      : z.string().startsWith("sk_test_").min(20),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").min(16),
  STRIPE_TAX_MODE: z.enum([
    "platform_liable",
    "connected_account_liable",
  ]),
  STRIPE_TAX_POLICY_VERSION: z.coerce.number().int().positive(),
  STRIPE_TAX_LEGAL_DECISION_ACKNOWLEDGED: z.literal("true"),
  STRIPE_TAX_LEGAL_DECISION_REFERENCE: z.string().min(1),
  STRIPE_TAX_SHIPPING_TAX_CODE: z.string().regex(/^txcd_\d+$/),
  STRIPE_TAX_BUYER_FEE_TREATMENT: z.enum(["excluded", "taxable"]),
  STRIPE_TAX_BUYER_FEE_TAX_CODE: z.string().regex(/^txcd_\d+$/).optional(),
  UPLOADTHING_TOKEN: z.string().min(16),
  RESEND_API_KEY: z.string().startsWith("re_").min(10),
  RESEND_WEBHOOK_SECRET: z.string().startsWith("whsec_").min(16),
  EMAIL_FROM: z.string().email().or(
    z.string().regex(/.+<[^>]+@[^>]+>/, "must contain a valid sender email"),
  ),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(16),
  INNGEST_EVENT_KEY: z.string().min(16),
  INNGEST_SIGNING_KEY: z.string().min(16),
  ANTHROPIC_API_KEY: z.string().min(16),
  VERIFICATION_WEBHOOK_SECRET: z.string().min(32),
  VERIFICATION_DOC_ALLOWED_HOSTS: z.string().min(1),
  PRIORITY1_API_KEY: z.string().min(16),
  PRIORITY1_DRY_RUN:
    requestedMode === "production"
      ? z.literal("false")
      : z.literal("true"),
  CRON_SECRET: z.string().min(32),
  NODE_ENV: z.enum(["production", "preview", "staging"]).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(32),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    requestedMode === "production"
      ? z.string().startsWith("pk_live_").min(20)
      : z.string().startsWith("pk_test_").min(20),
  NEXT_PUBLIC_APP_URL: z.string().url().refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "must use https in a deployable environment"),
});

try {
  const { sourceLabel, env } = loadEnvSource();
  const parsed = schema.safeParse(env);

  const issues = [];
  if (!parsed.success) {
    issues.push(
      ...parsed.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    );
  }

  for (const key of Object.keys(schema.shape)) {
    const value = env[key];
    if (typeof value === "string" && isPlaceholder(value)) {
      issues.push(`${key}: contains a placeholder or local-only value`);
    }
  }

  const hostList = env.VERIFICATION_DOC_ALLOWED_HOSTS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    !hostList?.length ||
    hostList.some((host) => /example\.com/i.test(host))
  ) {
    issues.push(
      "VERIFICATION_DOC_ALLOWED_HOSTS: must list real production-safe hosts",
    );
  }

  if (
    env.STRIPE_TAX_BUYER_FEE_TREATMENT === "taxable" &&
    !env.STRIPE_TAX_BUYER_FEE_TAX_CODE
  ) {
    issues.push(
      "STRIPE_TAX_BUYER_FEE_TAX_CODE: required when the buyer fee is taxable",
    );
  }

  if (env.STRIPE_TAX_MODE === "connected_account_liable") {
    issues.push(
      "STRIPE_TAX_MODE: connected_account_liable is calculation-ready only; production checkout remains blocked until connected-account transaction and reversal certification is implemented",
    );
  }

  if (issues.length > 0) {
    console.error(
      `${requestedMode} env preflight failed (${sourceLabel}):`,
    );
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(
    `${requestedMode} env preflight passed (${Object.keys(schema.shape).length} required keys checked from ${sourceLabel}).`,
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Unknown env preflight error",
  );
  process.exit(1);
}
