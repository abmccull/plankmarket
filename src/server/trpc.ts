import { initTRPC, TRPCError } from "@trpc/server";
import { type FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "./db";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import {
  authRateLimit,
  paymentRateLimit,
  messageRateLimit,
  offerRateLimit,
} from "@/lib/rate-limit";

export async function createTRPCContext(_opts: FetchCreateContextFnOptions) {
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

  return {
    db,
    authUser,
    user: dbUser,
    supabase,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

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

// Auth middleware - requires authenticated + active user (H8 fix)
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
      message: "Your account has been deactivated",
    });
  }
  return next({
    ctx: {
      authUser: ctx.authUser,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceAuth);

// Seller-only middleware — chains through enforceAuth for active check
const enforceSeller = t.middleware(({ ctx, next }) => {
  // ctx.user is guaranteed non-null by enforceAuth in the chain
  if (ctx.user!.role !== "seller" && ctx.user!.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only sellers can perform this action",
    });
  }
  return next();
});

export const sellerProcedure = t.procedure.use(enforceAuth).use(enforceSeller);

// Verified seller middleware — for endpoints that require seller verification (H5)
const enforceVerifiedSeller = t.middleware(({ ctx, next }) => {
  if (!ctx.user!.verified && ctx.user!.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Your seller account must be verified before performing this action",
    });
  }
  return next();
});

export const verifiedSellerProcedure = t.procedure
  .use(enforceAuth)
  .use(enforceSeller)
  .use(enforceVerifiedSeller);

// Buyer-only middleware — chains through enforceAuth for active check
const enforceBuyer = t.middleware(({ ctx, next }) => {
  if (ctx.user!.role !== "buyer" && ctx.user!.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only buyers can perform this action",
    });
  }
  return next();
});

export const buyerProcedure = t.procedure.use(enforceAuth).use(enforceBuyer);

// Admin-only middleware — chains through enforceAuth for active check
const enforceAdmin = t.middleware(({ ctx, next }) => {
  if (ctx.user!.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next();
});

export const adminProcedure = t.procedure.use(enforceAuth).use(enforceAdmin);

// Rate limiting middleware factories (H3)
function createRateLimitMiddleware(
  limiter: typeof authRateLimit,
  keyFn: (ctx: Context) => string
) {
  return t.middleware(async ({ ctx, next }) => {
    const key = keyFn(ctx);
    const { success } = await limiter.limit(key);
    if (!success) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Rate limit exceeded. Please try again later.",
      });
    }
    return next();
  });
}

// Rate-limited procedure variants for critical endpoints
export const rateLimitedAuthProcedure = t.procedure.use(
  createRateLimitMiddleware(authRateLimit, (ctx) => ctx.authUser?.id ?? "anon")
);

export const rateLimitedPaymentProcedure = t.procedure
  .use(enforceAuth)
  .use(
    createRateLimitMiddleware(
      paymentRateLimit,
      (ctx) => ctx.user?.id ?? "unknown"
    )
  );

export const rateLimitedMessageProcedure = t.procedure
  .use(enforceAuth)
  .use(
    createRateLimitMiddleware(
      messageRateLimit,
      (ctx) => ctx.user?.id ?? "unknown"
    )
  );

export const rateLimitedOfferProcedure = t.procedure
  .use(enforceAuth)
  .use(enforceSeller)
  .use(
    createRateLimitMiddleware(
      offerRateLimit,
      (ctx) => ctx.user?.id ?? "unknown"
    )
  );
