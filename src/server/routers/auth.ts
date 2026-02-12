import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { registerSchema, updateProfileSchema } from "@/lib/validators/auth";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const authRouter = createTRPCRouter({
  // Register a new user (creates DB record after Supabase auth signup)
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ ctx, input }) => {
      // Sign up with Supabase Auth
      const { data: authData, error: authError } =
        await ctx.supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            data: {
              name: input.name,
              role: input.role,
              business_name: input.businessName,
            },
          },
        });

      if (authError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: authError.message,
        });
      }

      if (!authData.user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user account",
        });
      }

      // Create user record in our database
      const [newUser] = await ctx.db
        .insert(users)
        .values({
          authId: authData.user.id,
          email: input.email,
          name: input.name,
          role: input.role,
          businessName: input.businessName,
          phone: input.phone,
        })
        .returning();

      return {
        user: newUser,
        requiresVerification: !authData.user.email_confirmed_at,
      };
    }),

  // Get current user profile
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return ctx.user;
  }),

  // Update user profile
  updateProfile: protectedProcedure
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(users)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.user.id))
        .returning();

      return updated;
    }),

  // Get user session state
  getSession: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) {
      return { user: null, isAuthenticated: false };
    }
    return {
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
        role: ctx.user.role,
        businessName: ctx.user.businessName,
        avatarUrl: ctx.user.avatarUrl,
        verified: ctx.user.verified,
        stripeOnboardingComplete: ctx.user.stripeOnboardingComplete,
      },
      isAuthenticated: true,
    };
  }),
});
