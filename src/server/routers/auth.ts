import { createTRPCRouter, publicProcedure, protectedProcedure, rateLimitedPublicProcedure } from "../trpc";
import { registerSchema, updateProfileSchema } from "@/lib/validators/auth";
import { users, notifications } from "../db/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { env } from "@/env";
import zipcodes from "zipcodes";

export const authRouter = createTRPCRouter({
  // Register a new user (creates DB record after Supabase auth signup)
  register: rateLimitedPublicProcedure
    .input(registerSchema)
    .mutation(async ({ ctx, input }) => {
      // Sign up with Supabase Auth
      const { data: authData, error: authError } =
        await ctx.supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
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

      // Geo-lookup from ZIP code
      let lat: number | undefined;
      let lng: number | undefined;
      if (input.zipCode) {
        const zipInfo = zipcodes.lookup(input.zipCode);
        if (zipInfo) {
          lat = zipInfo.latitude;
          lng = zipInfo.longitude;
        }
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
          zipCode: input.zipCode,
          lat,
          lng,
          // Business verification fields
          einTaxId: input.einTaxId,
          businessWebsite: input.businessWebsite,
          verificationDocUrl: input.verificationDocUrl,
          businessAddress: input.businessAddress,
          businessCity: input.businessCity,
          businessState: input.businessState,
          businessZip: input.businessZip,
          // Set verification to pending
          verificationStatus: "pending",
          verificationRequestedAt: new Date(),
          verified: false,
        })
        .returning();

      // Trigger async AI verification via internal webhook (fire-and-forget)
      try {
        const webhookSecret = process.env.VERIFICATION_WEBHOOK_SECRET;
        if (webhookSecret) {
          fetch(`${env.NEXT_PUBLIC_APP_URL}/api/webhooks/verify-business`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": webhookSecret,
            },
            body: JSON.stringify({ userId: newUser!.id }),
          }).catch((err) => {
            console.error("Failed to trigger AI verification webhook:", err);
          });
        }
      } catch {
        // Don't block registration if webhook fails
      }

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
        verificationStatus: ctx.user.verificationStatus,
        stripeOnboardingComplete: ctx.user.stripeOnboardingComplete,
        zipCode: ctx.user.zipCode,
      },
      isAuthenticated: true,
    };
  }),
});
