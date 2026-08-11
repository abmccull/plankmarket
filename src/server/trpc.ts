import { initTRPC, TRPCError } from "@trpc/server";
import { type FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "./db";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { Ratelimit } from "@upstash/ratelimit";
import { getRedisClient } from "@/lib/redis/client";
import { checkViolationStatus } from "@/server/services/content-moderation";
import { type AppRole, resolveRole } from "@/lib/supabase/roles";
import {
  getProcedureAssuranceRequirement,
  MFA_REQUIRED_MESSAGE,
  RECENT_AUTH_REQUIRED_MESSAGE,
  summarizeAuthAssurance,
  type AuthAssuranceState,
} from "@/lib/auth/auth-assurance";

const userProfileColumns = {
  id: true,
  authId: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  businessName: true,
  businessAddress: true,
  businessCity: true,
  businessState: true,
  businessZip: true,
  avatarUrl: true,
  stripeAccountId: true,
  stripeOnboardingComplete: true,
  verified: true,
  active: true,
  verificationStatus: true,
  verificationRequestedAt: true,
  verificationNotes: true,
  businessWebsite: true,
  proStatus: true,
  stripeCustomerId: true,
  proExpiresAt: true,
  zipCode: true,
  createdAt: true,
  updatedAt: true,
  // Excluded for security:
  // einTaxId, aiVerificationScore, aiVerificationNotes,
  // verificationDocUrl, lat, lng
} as const;

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
type AuthUser = Awaited<
  ReturnType<ServerSupabaseClient["auth"]["getUser"]>
>["data"]["user"];

function parseZip(value: unknown): string {
  if (typeof value !== "string") return "00000";
  return /^\d{5}$/.test(value.trim()) ? value.trim() : "00000";
}

function parseText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function parseNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getClientIpFromHeaders(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}

function hasPotentialSupabaseSession(headers: Headers): boolean {
  const cookieHeader = headers.get("cookie") ?? "";
  return (
    cookieHeader.includes("sb-") ||
    cookieHeader.includes("supabase-auth-token") ||
    cookieHeader.includes("supabase.auth.token")
  );
}

async function findDbUserByAuthId(authId: string) {
  return db.query.users.findFirst({
    where: eq(users.authId, authId),
    columns: userProfileColumns,
  });
}

async function getOrProvisionDbUser(authUser: AuthUser) {
  if (!authUser) {
    return null;
  }

  let result = await findDbUserByAuthId(authUser.id);

  if (!result) {
    const role = resolveRole(authUser);
    if (!role) {
      // Never turn a partially provisioned or externally-created auth
      // identity into a buyer by default. Registration writes app_metadata
      // with the service-role client before the profile is created.
      console.error("Refusing to auto-provision profile without a trusted role", {
        authUserId: authUser.id,
      });
    } else {
      const name = parseText(
        authUser.user_metadata?.name,
        parseText(authUser.email?.split("@")[0], "PlankMarket User")
      ).slice(0, 255);
      const businessName = parseText(
        authUser.user_metadata?.business_name,
        "",
      ).slice(0, 255);
      const phone = parseText(authUser.user_metadata?.phone, "").slice(0, 20);
      const zipCode = parseZip(
        authUser.user_metadata?.zip_code ?? authUser.user_metadata?.zipCode
      );

      try {
        await db
          .insert(users)
          .values({
            authId: authUser.id,
            email:
              authUser.email ??
              `${authUser.id}@placeholder.plankmarket.local`,
            name,
            role,
            businessName: businessName || null,
            phone,
            businessAddress: "Pending verification",
            businessCity: "NA",
            businessState: "NA",
            businessZip: zipCode,
            verificationDocUrl: "",
            verificationRequestedAt: new Date(0),
            verificationNotes: "",
            businessWebsite: "",
            einTaxId: "",
            verificationStatus: "unverified",
            verified: false,
            active: true,
            zipCode,
            lat: parseNumber(authUser.user_metadata?.lat, 0),
            lng: parseNumber(authUser.user_metadata?.lng, 0),
          })
          .onConflictDoNothing({ target: users.authId });
      } catch (error) {
        console.error("Failed to auto-provision missing user profile", {
          authUserId: authUser.id,
          error: error instanceof Error ? error.name : "UnknownError",
        });
      }

      result = await findDbUserByAuthId(authUser.id);
    }
  }

  return result ?? null;
}

async function resolveRequestViewer(
  headers: Headers,
  options?: {
    allowAnonymousShortcut?: boolean;
    supabase?: ServerSupabaseClient;
  },
) {
  const clientIp = getClientIpFromHeaders(headers);

  if (options?.allowAnonymousShortcut && !hasPotentialSupabaseSession(headers)) {
    return {
      authUser: null,
      user: null,
      clientIp,
    };
  }

  const supabase = options?.supabase ?? (await createClient());
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  return {
    authUser,
    user: await getOrProvisionDbUser(authUser),
    clientIp,
  };
}

async function loadAuthAssurance(
  supabase: ServerSupabaseClient,
): Promise<AuthAssuranceState> {
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (error) {
    throw error;
  }

  return summarizeAuthAssurance({
    currentLevel: data.currentLevel,
    nextLevel: data.nextLevel,
    currentAuthenticationMethods: data.currentAuthenticationMethods,
  });
}

export async function resolveRequestViewerFromHeaders(
  headers: Headers,
  options?: { allowAnonymousShortcut?: boolean },
) {
  return resolveRequestViewer(headers, options);
}

export async function createTRPCContext(opts: FetchCreateContextFnOptions) {
  const supabase = await createClient();
  const { authUser, user, clientIp } = await resolveRequestViewer(
    opts.req.headers,
    { supabase },
  );
  let authAssurancePromise: Promise<AuthAssuranceState> | null = null;

  return {
    db,
    authUser,
    user,
    supabase,
    clientIp,
    getAuthAssurance: () => {
      if (!authUser) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in",
        });
      }

      authAssurancePromise ??= loadAuthAssurance(supabase);
      return authAssurancePromise;
    },
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

// Standard rate limit: 60 requests per minute per user
let standardRateLimit: Ratelimit | undefined;
function getStandardRateLimit(): Ratelimit {
  standardRateLimit ??= new Ratelimit({
    redis: getRedisClient(),
    limiter: Ratelimit.slidingWindow(60, "60 s"),
    prefix: "rl:standard",
  });
  return standardRateLimit;
}

// Strict rate limit: 10 requests per minute (for sensitive operations)
let strictRateLimit: Ratelimit | undefined;
function getStrictRateLimit(): Ratelimit {
  strictRateLimit ??= new Ratelimit({
    redis: getRedisClient(),
    limiter: Ratelimit.slidingWindow(10, "60 s"),
    prefix: "rl:strict",
  });
  return strictRateLimit;
}

// Public catalog reads permit normal browsing and crawlers while bounding
// scraper amplification against uncached or personalized query paths.
let publicReadRateLimit: Ratelimit | undefined;
function getPublicReadRateLimit(): Ratelimit {
  publicReadRateLimit ??= new Ratelimit({
    redis: getRedisClient(),
    limiter: Ratelimit.slidingWindow(180, "60 s"),
    prefix: "rl:public-read",
  });
  return publicReadRateLimit;
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

// Public procedure - no auth required
export const publicProcedure = t.procedure;

export const publicReadProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    try {
      const { success } = await getPublicReadRateLimit().limit(
        `ip:${ctx.clientIp}`,
      );
      if (!success) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many catalog requests. Please try again shortly.",
        });
      }
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      // Public reads remain available during a limiter outage. Provider-backed
      // and transactional procedures use strict fail-closed limiters instead.
      console.error("[rate-limit] public read limiter unavailable", {
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }
    return next();
  }),
);

// Public procedure with strict rate limiting (for registration and other sensitive unauthenticated endpoints)
export const rateLimitedPublicProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    const identifier = `ip:${ctx.clientIp}`;
    let success = true;
    try {
      ({ success } = await getStrictRateLimit().limit(identifier));
    } catch (error) {
      console.error("[rate-limit] public strict limiter unavailable", {
        error: error instanceof Error ? error.name : "UnknownError",
      });
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "This operation is temporarily unavailable. Please try again.",
      });
    }

    if (!success) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please try again later.",
      });
    }
    return next();
  })
);

// Auth middleware - requires authenticated user
const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.authUser || !ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }
  if (!ctx.user.active) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your account has been suspended. Please contact support.",
    });
  }
  return next({
    ctx: {
      authUser: ctx.authUser,
      user: ctx.user,
    },
  });
});

// Standard rate limit middleware
const enforceRateLimit = t.middleware(async ({ ctx, next }) => {
  const identifier = ctx.user?.id ?? ctx.authUser?.id ?? `ip:${ctx.clientIp}`;
  let success = true;
  try {
    ({ success } = await getStandardRateLimit().limit(identifier));
  } catch (error) {
    // Fail open for rate-limit provider outages to keep authenticated APIs available.
    console.error("[rate-limit] standard limiter unavailable", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return next();
  }

  if (!success) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please try again later.",
    });
  }
  return next();
});

// Strict rate limit middleware for sensitive operations
const enforceStrictRateLimit = t.middleware(async ({ ctx, next }) => {
  const identifier = ctx.user?.id ?? ctx.authUser?.id ?? `ip:${ctx.clientIp}`;
  let success = true;
  try {
    ({ success } = await getStrictRateLimit().limit(identifier));
  } catch (error) {
    console.error("[rate-limit] strict limiter unavailable", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "This operation is temporarily unavailable. Please try again.",
    });
  }

  if (!success) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please try again later.",
    });
  }
  return next();
});

const enforceAuthAssurance = t.middleware(async ({ ctx, next, path }) => {
  if (!ctx.authUser || !ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in",
    });
  }

  const requirements = getProcedureAssuranceRequirement({
    path,
    role: ctx.user.role as AppRole | null,
  });

  if (!requirements.requiresAal2) {
    return next();
  }

  let assurance: AuthAssuranceState;
  try {
    assurance = await ctx.getAuthAssurance();
  } catch (error) {
    console.error("[auth] failed to validate session assurance", {
      path,
      authUserId: ctx.authUser.id,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message:
        "We could not validate your security session. Please try again.",
    });
  }

  if (assurance.currentLevel !== "aal2") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: MFA_REQUIRED_MESSAGE,
    });
  }

  if (requirements.requiresRecentAuth && !assurance.recentVerificationSatisfied) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: RECENT_AUTH_REQUIRED_MESSAGE,
    });
  }

  return next();
});

export const protectedProcedure = t.procedure.use(enforceAuth).use(enforceRateLimit);
export const strictProtectedProcedure = t.procedure
  .use(enforceAuth)
  .use(enforceStrictRateLimit);

// Verified user middleware - requires authenticated + verified (or admin)
const enforceVerified = t.middleware(({ ctx, next }) => {
  if (!ctx.authUser || !ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }
  if (ctx.user.role !== "admin" && ctx.user.verificationStatus !== "verified") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your account is pending verification. Please wait for approval before performing this action.",
    });
  }
  return next({
    ctx: {
      authUser: ctx.authUser,
      user: ctx.user,
    },
  });
});

export const verifiedProcedure = t.procedure.use(enforceAuth).use(enforceRateLimit).use(enforceVerified);

// Seller-only middleware (also requires verified)
const enforceSeller = t.middleware(({ ctx, next }) => {
  if (!ctx.authUser || !ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in",
    });
  }
  if (ctx.user.role !== "seller" && ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only sellers can perform this action",
    });
  }
  if (ctx.user.role !== "admin" && ctx.user.verificationStatus !== "verified") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Seller verification required. Complete verification at /seller/verification before creating listings.",
    });
  }
  return next({
    ctx: {
      authUser: ctx.authUser,
      user: ctx.user,
    },
  });
});

export const sellerProcedure = t.procedure.use(enforceAuth).use(enforceRateLimit).use(enforceSeller);
export const strictSellerProcedure = t.procedure
  .use(enforceAuth)
  .use(enforceStrictRateLimit)
  .use(enforceAuthAssurance)
  .use(enforceSeller);

// Seller procedure that allows pending verification (for draft listings)
const enforceSellerOrPending = t.middleware(({ ctx, next }) => {
  if (!ctx.authUser || !ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in",
    });
  }
  if (ctx.user.role !== "seller" && ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only sellers can perform this action",
    });
  }
  // Allow pending, verified, and admin - only block rejected/unverified
  if (ctx.user.role !== "admin" && ctx.user.verificationStatus === "rejected") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your verification was rejected. Please resubmit.",
    });
  }
  return next({
    ctx: {
      authUser: ctx.authUser,
      user: ctx.user,
    },
  });
});

export const sellerOrPendingProcedure = t.procedure.use(enforceAuth).use(enforceRateLimit).use(enforceSellerOrPending);

// Buyer-only middleware (also requires verified)
const enforceBuyer = t.middleware(({ ctx, next }) => {
  if (!ctx.authUser || !ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in",
    });
  }
  if (ctx.user.role !== "buyer" && ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only buyers can perform this action",
    });
  }
  return next({
    ctx: {
      authUser: ctx.authUser,
      user: ctx.user,
    },
  });
});

export const buyerProcedure = t.procedure.use(enforceAuth).use(enforceRateLimit).use(enforceBuyer);
export const strictBuyerProcedure = t.procedure
  .use(enforceAuth)
  .use(enforceStrictRateLimit)
  .use(enforceBuyer);

// Buyer-only + verified (for transactional checkout/payment operations)
const enforceVerifiedBuyer = t.middleware(({ ctx, next }) => {
  if (!ctx.authUser || !ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in",
    });
  }
  if (ctx.user.role !== "buyer" && ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only buyers can perform this action",
    });
  }
  if (ctx.user.role !== "admin" && ctx.user.verificationStatus !== "verified") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Buyer verification required before checkout. Complete verification at /buyer/settings.",
    });
  }
  return next({
    ctx: {
      authUser: ctx.authUser,
      user: ctx.user,
    },
  });
});

export const verifiedBuyerProcedure = t.procedure
  .use(enforceAuth)
  .use(enforceRateLimit)
  .use(enforceVerifiedBuyer);
export const strictVerifiedBuyerProcedure = t.procedure
  .use(enforceAuth)
  .use(enforceStrictRateLimit)
  .use(enforceVerifiedBuyer);

// Admin-only middleware
const enforceAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.authUser || !ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in",
    });
  }
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next({
    ctx: {
      authUser: ctx.authUser,
      user: ctx.user,
    },
  });
});

export const adminProcedure = t.procedure
  .use(enforceAuth)
  .use(enforceRateLimit)
  .use(enforceAuthAssurance)
  .use(enforceAdmin);

// Strict rate limited procedure for sensitive operations (e.g., payment creation)
export const strictRateLimitedProcedure = t.procedure.use(enforceAuth).use(enforceStrictRateLimit);

// Messaging rate limit: 5 messages per hour for users with 3+ content violations
let messagingRateLimit: Ratelimit | undefined;
function getMessagingRateLimit(): Ratelimit {
  messagingRateLimit ??= new Ratelimit({
    redis: getRedisClient(),
    limiter: Ratelimit.slidingWindow(5, "60 m"),
    prefix: "rl:messaging-restricted",
  });
  return messagingRateLimit;
}

// Content policy enforcement middleware
// Checks user's violation history and applies escalating consequences:
// - 1-2 violations: allowed (warning is shown in Zod rejection message)
// - 3-4 violations: messaging rate-limited to 5/hour
// - 5+ violations: auto-suspend account
const enforceContentPolicy = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    return next();
  }

  const status = await checkViolationStatus(ctx.user.id);

  if (status.action === "suspend") {
    // Auto-suspend the account
    await db
      .update(users)
      .set({ active: false })
      .where(eq(users.id, ctx.user.id));

    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Your account has been suspended due to repeated policy violations. Please contact support.",
    });
  }

  if (status.action === "rate_limit") {
    const { success } = await getMessagingRateLimit().limit(ctx.user.id);
    if (!success) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message:
          "Your messaging has been rate-limited due to policy violations. Please try again later.",
      });
    }
  }

  return next();
});

// Messaging procedure — authenticated + content policy enforcement
export const messagingProcedure = t.procedure
  .use(enforceAuth)
  .use(enforceRateLimit)
  .use(enforceContentPolicy);
