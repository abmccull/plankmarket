import { initTRPC, TRPCError } from "@trpc/server";
import { type FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "./db";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/env";
import { checkViolationStatus } from "@/server/services/content-moderation";

export async function createTRPCContext(opts: FetchCreateContextFnOptions) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  let dbUser = null;
  if (authUser) {
    const result = await db.query.users.findFirst({
      where: eq(users.authId, authUser.id),
    });
    dbUser = result ?? null;
  }

  // Extract client IP for anonymous rate limiting and view dedup
  const clientIp =
    opts.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    opts.req.headers.get("x-real-ip") ??
    "unknown";

  return {
    db,
    authUser,
    user: dbUser,
    supabase,
    clientIp,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

// Create Redis client for rate limiting
const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

// Standard rate limit: 60 requests per minute per user
const standardRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "60 s"),
  prefix: "rl:standard",
});

// Strict rate limit: 10 requests per minute (for sensitive operations)
const strictRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  prefix: "rl:strict",
});

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

// Public procedure with strict rate limiting (for registration and other sensitive unauthenticated endpoints)
export const rateLimitedPublicProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    const identifier = `ip:${ctx.clientIp}`;
    const { success } = await strictRateLimit.limit(identifier);
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
  const { success } = await standardRateLimit.limit(identifier);
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
  const { success } = await strictRateLimit.limit(identifier);
  if (!success) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please try again later.",
    });
  }
  return next();
});

export const protectedProcedure = t.procedure.use(enforceAuth).use(enforceRateLimit);

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

export const adminProcedure = t.procedure.use(enforceAuth).use(enforceRateLimit).use(enforceAdmin);

// Strict rate limited procedure for sensitive operations (e.g., payment creation)
export const strictRateLimitedProcedure = t.procedure.use(enforceAuth).use(enforceStrictRateLimit);

// Messaging rate limit: 5 messages per hour for users with 3+ content violations
const messagingRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "60 m"),
  prefix: "rl:messaging-restricted",
});

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
    const { success } = await messagingRateLimit.limit(ctx.user.id);
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
