import { initTRPC, TRPCError } from "@trpc/server";
import { type FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "./db";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

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

// Auth middleware - requires authenticated user
const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.authUser || !ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
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

// Seller-only middleware
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
  return next({
    ctx: {
      authUser: ctx.authUser,
      user: ctx.user,
    },
  });
});

export const sellerProcedure = t.procedure.use(enforceSeller);

// Buyer-only middleware
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

export const buyerProcedure = t.procedure.use(enforceBuyer);

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

export const adminProcedure = t.procedure.use(enforceAdmin);
