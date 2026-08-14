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

function normalizeDatabaseUrl(value) {
  try {
    const url = new URL(value);
    url.password = "";
    return url.toString();
  } catch {
    return value;
  }
}

const schema = z.object({
  DATABASE_URL: z.string().refine(looksLikeHostedDatabaseUrl, {
    message: "must be a non-local postgres connection string",
  }),
  DATABASE_MIGRATION_URL: z
    .string()
    .refine(looksLikeHostedDatabaseUrl, {
      message: "must be a non-local postgres connection string",
    })
    .optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(10).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(32),
  STRIPE_SECRET_KEY:
    requestedMode === "production"
      ? z.string().startsWith("sk_live_").min(20)
      : z.string().startsWith("sk_test_").min(20),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").min(16),
  STRIPE_TAX_MODE: z
    .enum([
      "disabled",
      "platform_liable",
      "connected_account_liable",
    ])
    .default("disabled"),
  STRIPE_TAX_POLICY_VERSION: z.coerce
    .number()
    .int()
    .positive()
    .default(1),
  STRIPE_TAX_LEGAL_DECISION_ACKNOWLEDGED: z
    .enum(["true", "false"])
    .default("false"),
  STRIPE_TAX_LEGAL_DECISION_REFERENCE: z.string().min(1).optional(),
  STRIPE_TAX_SHIPPING_TAX_CODE: z
    .string()
    .regex(/^txcd_\d+$/)
    .optional(),
  STRIPE_TAX_BUYER_FEE_TREATMENT: z
    .enum(["undecided", "excluded", "taxable"])
    .default("undecided"),
  STRIPE_TAX_BUYER_FEE_TAX_CODE: z
    .string()
    .regex(/^txcd_\d+$/)
    .optional(),
  UPLOADTHING_TOKEN: z.string().min(16),
  RESEND_API_KEY: z.string().startsWith("re_").min(10).optional(),
  RESEND_WEBHOOK_SECRET: z
    .string()
    .startsWith("whsec_")
    .min(16)
    .optional(),
  EMAIL_FROM: z
    .string()
    .email()
    .or(
      z
        .string()
        .regex(/.+<[^>]+@[^>]+>/, "must contain a valid sender email"),
    )
    .default("PlankMarket <noreply@plankmarket.com>"),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(16),
  INNGEST_EVENT_KEY: z.string().min(16).optional(),
  INNGEST_SIGNING_KEY: z.string().min(16).optional(),
  ANTHROPIC_API_KEY: z.string().min(16).optional(),
  ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS: z
    .enum(["true", "false"])
    .default("false"),
  VERIFICATION_WEBHOOK_SECRET: z.string().min(32).optional(),
  VERIFICATION_DOC_ALLOWED_HOSTS: z.string().min(1).optional(),
  PRIORITY1_API_KEY: z.string().min(16).optional(),
  PRIORITY1_DOCUMENT_ALLOWED_HOSTS: z.string().min(1).optional(),
  PRIORITY1_DRY_RUN: z
    .enum(["true", "false"])
    .default(requestedMode === "production" ? "false" : "true"),
  CRON_SECRET: z.string().min(32).optional(),
  NODE_ENV: z.enum(["production", "preview", "staging"]).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(32),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    requestedMode === "production"
      ? z.string().startsWith("pk_live_").min(20)
      : z.string().startsWith("pk_test_").min(20),
  NEXT_PUBLIC_APP_URL: z.string().url().refine(
    (value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    },
    "must use https in a deployable environment",
  ),
});

try {
  const { sourceLabel, env } = loadEnvSource();
  const parsed = schema.safeParse(env);

  const missingKeys = [];
  const invalidValues = [];
  const conditionalIssues = [];

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      const value = env[key];

      if (value === undefined || value === "") {
        missingKeys.push(`${key}: ${issue.message}`);
      } else {
        invalidValues.push(`${key}: ${issue.message} (received: "${value}")`);
      }
    }
  }

  for (const key of Object.keys(schema.shape)) {
    const value = env[key];
    if (typeof value === "string" && isPlaceholder(value)) {
      invalidValues.push(`${key}: contains a placeholder or local-only value`);
    }
  }

  // Use parsed data with defaults applied for conditional checks
  const validatedEnv = parsed.success ? parsed.data : env;

  if (validatedEnv.VERIFICATION_DOC_ALLOWED_HOSTS) {
    const hostList = validatedEnv.VERIFICATION_DOC_ALLOWED_HOSTS.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      !hostList.length ||
      hostList.some((host) => /example\.com/i.test(host))
    ) {
      conditionalIssues.push(
        "VERIFICATION_DOC_ALLOWED_HOSTS: must list real production-safe hosts",
      );
    }
  }

  if (validatedEnv.PRIORITY1_DOCUMENT_ALLOWED_HOSTS) {
    const priority1HostList =
      validatedEnv.PRIORITY1_DOCUMENT_ALLOWED_HOSTS.split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    if (
      !priority1HostList.length ||
      priority1HostList.some((host) => /example\.com/i.test(host))
    ) {
      conditionalIssues.push(
        "PRIORITY1_DOCUMENT_ALLOWED_HOSTS: must list real production-safe hosts",
      );
    }
  }

  if (
    validatedEnv.STRIPE_TAX_BUYER_FEE_TREATMENT === "taxable" &&
    !validatedEnv.STRIPE_TAX_BUYER_FEE_TAX_CODE
  ) {
    conditionalIssues.push(
      "STRIPE_TAX_BUYER_FEE_TAX_CODE: required when the buyer fee is taxable",
    );
  }

  if (validatedEnv.STRIPE_TAX_MODE === "connected_account_liable") {
    conditionalIssues.push(
      "STRIPE_TAX_MODE: connected_account_liable is calculation-ready only; production checkout remains blocked until connected-account transaction and reversal certification is implemented",
    );
  }

  if (
    env.STRIPE_TAX_MODE === "platform_liable" &&
    (env.STRIPE_TAX_LEGAL_DECISION_ACKNOWLEDGED !== "true" ||
      !env.STRIPE_TAX_LEGAL_DECISION_REFERENCE ||
      !env.STRIPE_TAX_SHIPPING_TAX_CODE ||
      !env.STRIPE_TAX_BUYER_FEE_TREATMENT ||
      env.STRIPE_TAX_BUYER_FEE_TREATMENT === "undecided")
  ) {
    issues.push(
      "STRIPE_TAX_MODE=platform_liable requires legal acknowledgement, a decision reference, a shipping tax code, and a decided buyer-fee treatment",
    );
  }

  if (
    requestedMode === "production" &&
    validatedEnv.ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS !== "false"
  ) {
    conditionalIssues.push(
      "ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS: must remain false in production until privacy/legal approval explicitly changes the policy",
    );
  }

  if (
    validatedEnv.DATABASE_URL &&
    validatedEnv.DATABASE_MIGRATION_URL &&
    normalizeDatabaseUrl(validatedEnv.DATABASE_URL) ===
      normalizeDatabaseUrl(validatedEnv.DATABASE_MIGRATION_URL)
  ) {
    conditionalIssues.push(
      "DATABASE_MIGRATION_URL: must be a direct database connection distinct from the pooled runtime DATABASE_URL",
    );
  }

  const hasIssues =
    missingKeys.length > 0 ||
    invalidValues.length > 0 ||
    conditionalIssues.length > 0;

  if (hasIssues) {
    console.error(
      `${requestedMode} env preflight failed (${sourceLabel}):`,
    );

    if (missingKeys.length > 0) {
      console.error("\nMissing required variables:");
      for (const issue of missingKeys) {
        console.error(`  - ${issue}`);
      }
    }

    if (invalidValues.length > 0) {
      console.error("\nInvalid variable values:");
      for (const issue of invalidValues) {
        console.error(`  - ${issue}`);
      }
    }

    if (conditionalIssues.length > 0) {
      console.error("\nConditional validation failures:");
      for (const issue of conditionalIssues) {
        console.error(`  - ${issue}`);
      }
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
