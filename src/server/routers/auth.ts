import { createTRPCRouter, publicProcedure, protectedProcedure, rateLimitedPublicProcedure } from "../trpc";
import { registerSchema, updateProfileSchema } from "@/lib/validators/auth";
import { users, notifications, listings, savedSearches, orders, userPreferences } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "@/env";
import zipcodes from "zipcodes";
import { sendWelcomeEmail } from "@/lib/email/send";
import { inngest } from "@/lib/inngest/client";

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

      // Send welcome email (fire-and-forget)
      sendWelcomeEmail({
        to: input.email,
        name: input.name,
        role: input.role,
      }).catch((err) => {
        console.error("Failed to send welcome email:", err);
      });

      // Trigger onboarding drip sequence (fire-and-forget)
      inngest.send({
        name: "user/registered",
        data: {
          userId: newUser!.id,
          email: input.email,
          name: input.name,
          role: input.role,
        },
      }).catch((err) => {
        console.error("Failed to trigger onboarding drip:", err);
      });

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

  // Get onboarding progress for current user
  getOnboardingProgress: protectedProcedure.query(async ({ ctx }) => {
    const user = ctx.user;
    const role = user.role;

    // Common checks
    const emailVerified = user.verified || user.verificationStatus === "verified";
    const businessVerified = user.verificationStatus === "verified";
    const profileComplete = !!(user.name && user.businessName && user.phone);

    // Check if preferences are set
    const prefs = await ctx.db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, user.id),
    });
    const preferencesSet = !!prefs?.profileComplete;

    if (role === "seller") {
      // Seller-specific checks
      const stripeConnected = user.stripeOnboardingComplete;

      const [listingCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(listings)
        .where(eq(listings.sellerId, user.id));

      const firstListing = (listingCount?.count ?? 0) > 0;

      const steps: Record<string, boolean> = {
        email_verified: emailVerified,
        business_verified: businessVerified,
        profile_complete: profileComplete,
        preferences_set: preferencesSet,
        stripe_connected: stripeConnected,
        first_listing: firstListing,
      };

      const completedCount = Object.values(steps).filter(Boolean).length;
      const totalCount = Object.keys(steps).length;

      return {
        steps,
        completedCount,
        totalCount,
        percentComplete: Math.round((completedCount / totalCount) * 100),
      };
    } else {
      // Buyer-specific checks
      const [searchCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(savedSearches)
        .where(eq(savedSearches.userId, user.id));

      const [orderCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(eq(orders.buyerId, user.id));

      const firstSavedSearch = (searchCount?.count ?? 0) > 0;
      const firstPurchase = (orderCount?.count ?? 0) > 0;

      const steps: Record<string, boolean> = {
        email_verified: emailVerified,
        business_verified: businessVerified,
        profile_complete: profileComplete,
        preferences_set: preferencesSet,
        first_saved_search: firstSavedSearch,
        first_purchase: firstPurchase,
      };

      const completedCount = Object.values(steps).filter(Boolean).length;
      const totalCount = Object.keys(steps).length;

      return {
        steps,
        completedCount,
        totalCount,
        percentComplete: Math.round((completedCount / totalCount) * 100),
      };
    }
  }),

  // Resubmit verification (for rejected users)
  resubmitVerification: protectedProcedure
    .input(z.object({
      verificationDocUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.verificationStatus !== "rejected") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only rejected verifications can be resubmitted",
        });
      }

      const [updated] = await ctx.db
        .update(users)
        .set({
          verificationStatus: "pending",
          verificationRequestedAt: new Date(),
          ...(input.verificationDocUrl && { verificationDocUrl: input.verificationDocUrl }),
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.user.id))
        .returning();

      // Re-trigger AI verification webhook (fire-and-forget)
      try {
        const webhookSecret = process.env.VERIFICATION_WEBHOOK_SECRET;
        if (webhookSecret) {
          fetch(`${env.NEXT_PUBLIC_APP_URL}/api/webhooks/verify-business`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": webhookSecret,
            },
            body: JSON.stringify({ userId: ctx.user.id }),
          }).catch((err) => {
            console.error("Failed to trigger AI verification webhook:", err);
          });
        }
      } catch {
        // Don't block resubmission if webhook fails
      }

      return updated;
    }),
});
