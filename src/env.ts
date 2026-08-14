import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";
const isLiveProduction =
  isProduction && process.env.VERCEL_ENV !== "preview";
const productionRequired = (schema: z.ZodString) =>
  isProduction ? schema : schema.optional();

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    DATABASE_MIGRATION_URL: z.string().url().optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(10).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
    STRIPE_TAX_MODE: z
      .enum([
        "disabled",
        "platform_liable",
        "connected_account_liable",
      ])
      .default("disabled"),
    STRIPE_TAX_POLICY_VERSION: z.coerce.number().int().positive().default(1),
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
    UPLOADTHING_TOKEN: z.string().min(1),
    RESEND_API_KEY: z.string().startsWith("re_").optional(),
    RESEND_WEBHOOK_SECRET: productionRequired(
      z.string().startsWith("whsec_"),
    ),
    EMAIL_FROM: z.string().min(1).default("PlankMarket <noreply@plankmarket.com>"),
    UPSTASH_REDIS_REST_URL: z.string().url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
    INNGEST_EVENT_KEY: productionRequired(z.string().min(16)),
    INNGEST_SIGNING_KEY: isProduction
      ? z.string().min(1)
      : z.string().min(1).optional(),
    ANTHROPIC_API_KEY: productionRequired(z.string().min(16)),
    ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS: z
      .enum(["true", "false"])
      .default("false"),
    VERIFICATION_WEBHOOK_SECRET: productionRequired(z.string().min(32)),
    VERIFICATION_DOC_ALLOWED_HOSTS: productionRequired(z.string().min(1)),
    PRIORITY1_API_KEY: productionRequired(z.string().min(1)),
    PRIORITY1_DOCUMENT_ALLOWED_HOSTS: productionRequired(
      z
        .string()
        .min(1)
        .refine(
          (value) =>
            !/example\.com/i.test(value) &&
            value.split(",").some((host) => host.trim().length > 0),
          "PRIORITY1_DOCUMENT_ALLOWED_HOSTS must list real document hosts, not example.com",
        ),
    ),
    PRIORITY1_DRY_RUN: isLiveProduction
      ? z.literal("false").default("false")
      : z.enum(["true", "false"]).default("false"),
    CRON_SECRET: productionRequired(z.string().min(32)),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL,
    DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_TAX_MODE: process.env.STRIPE_TAX_MODE,
    STRIPE_TAX_POLICY_VERSION: process.env.STRIPE_TAX_POLICY_VERSION,
    STRIPE_TAX_LEGAL_DECISION_ACKNOWLEDGED:
      process.env.STRIPE_TAX_LEGAL_DECISION_ACKNOWLEDGED,
    STRIPE_TAX_LEGAL_DECISION_REFERENCE:
      process.env.STRIPE_TAX_LEGAL_DECISION_REFERENCE,
    STRIPE_TAX_SHIPPING_TAX_CODE:
      process.env.STRIPE_TAX_SHIPPING_TAX_CODE,
    STRIPE_TAX_BUYER_FEE_TREATMENT:
      process.env.STRIPE_TAX_BUYER_FEE_TREATMENT,
    STRIPE_TAX_BUYER_FEE_TAX_CODE:
      process.env.STRIPE_TAX_BUYER_FEE_TAX_CODE,
    UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    EMAIL_FROM: process.env.EMAIL_FROM,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS:
      process.env.ANTHROPIC_VERIFICATION_ALLOW_DOCUMENT_EGRESS,
    VERIFICATION_WEBHOOK_SECRET: process.env.VERIFICATION_WEBHOOK_SECRET,
    VERIFICATION_DOC_ALLOWED_HOSTS: process.env.VERIFICATION_DOC_ALLOWED_HOSTS,
    PRIORITY1_API_KEY: process.env.PRIORITY1_API_KEY,
    PRIORITY1_DOCUMENT_ALLOWED_HOSTS:
      process.env.PRIORITY1_DOCUMENT_ALLOWED_HOSTS,
    PRIORITY1_DRY_RUN: process.env.PRIORITY1_DRY_RUN,
    CRON_SECRET: process.env.CRON_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
