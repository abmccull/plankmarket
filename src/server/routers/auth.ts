import { createTRPCRouter, publicProcedure, protectedProcedure, rateLimitedPublicProcedure } from "../trpc";
import {
  registerSchema,
  submitVerificationSchema,
  updateProfileSchema,
} from "@/lib/validators/auth";
import { users, listings, savedSearches, orders, userPreferences } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "@/env";
import zipcodes from "zipcodes";
import { sendWelcomeEmail } from "@/lib/email/send";
import { inngest } from "@/lib/inngest/client";
import { validateVerificationDocUrl } from "@/server/services/verification-doc-url";

function triggerVerificationWebhook(userId: string): void {
  try {
    const webhookSecret = process.env.VERIFICATION_WEBHOOK_SECRET;
    if (!webhookSecret) return;

    fetch(`${env.NEXT_PUBLIC_APP_URL}/api/webhooks/verify-business`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify({ userId }),
    }).catch((err) => {
      console.error("Failed to trigger AI verification webhook:", err);
    });
  } catch {
    // Don't block user flow if webhook dispatch fails
  }
}

type VerificationSubmission = z.infer<typeof submitVerificationSchema>;

async function submitVerificationForUser(params: {
  db: typeof import("@/server/db").db;
  user: {
    id: string;
    role: string;
    verificationStatus: string;
  };
  input: VerificationSubmission;
}) {
  const { db, user, input } = params;

  if (user.role !== "buyer" && user.role !== "seller") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only buyer and seller accounts can submit verification",
    });
  }

  if (user.verificationStatus === "pending") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Your verification request is already under review",
    });
  }

  const normalizedWebsite = input.businessWebsite?.trim() || null;
  if (user.role === "seller" && !normalizedWebsite) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Business website is required for seller verification",
    });
  }

  const urlValidation = validateVerificationDocUrl(input.verificationDocUrl);
  if (!urlValidation.ok) {
    console.warn("Rejected verification document URL at submission", {
      userId: user.id,
      role: user.role,
      verificationDocUrl: input.verificationDocUrl,
      reason: urlValidation.reason,
    });
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: urlValidation.reason ?? "Invalid verification document URL",
    });
  }

  const [updated] = await db
    .update(users)
    .set({
      einTaxId: input.einTaxId,
      businessWebsite: normalizedWebsite,
      verificationDocUrl: input.verificationDocUrl,
      businessAddress: input.businessAddress,
      businessCity: input.businessCity,
      businessState: input.businessState,
      businessZip: input.businessZip,
      verificationStatus: "pending",
      verificationRequestedAt: new Date(),
      verificationNotes: null,
      verified: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();

  triggerVerificationWebhook(user.id);
  return updated;
}

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

      // Set app_metadata.role using service role client (server-writable only, not client-mutable)
      const { createServiceClient } = await import("@/lib/supabase/server");
      const serviceClient = await createServiceClient();
      await serviceClient.auth.admin.updateUserById(authData.user.id, {
        app_metadata: { role: input.role },
      });

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
          verificationStatus: "unverified",
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

      return {
        user: newUser,
        requiresVerification: !authData.user.email_confirmed_at,
      };
    }),

  // Get current user profile
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return ctx.user;
  }),

  // Get verification-specific fields for form pre-fill (excluded from ctx.user for security)
  getVerificationData: protectedProcedure.query(async ({ ctx }) => {
    const data = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.user.id),
      columns: {
        einTaxId: true,
        verificationDocUrl: true,
      },
    });
    return data ?? { einTaxId: null, verificationDocUrl: null };
  }),

  // Update user profile
  updateProfile: protectedProcedure
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(users)
        .set({
          name: input.name,
          phone: input.phone,
          businessName: input.businessName,
          businessAddress: input.businessAddress,
          businessCity: input.businessCity,
          businessState: input.businessState,
          businessZip: input.businessZip,
          avatarUrl: input.avatarUrl,
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
  getOnboardingProgress: protectedProcedure
    .input(z.object({ role: z.enum(["buyer", "seller"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
    const user = ctx.user;
    // Allow explicit role override (e.g. admin viewing seller dashboard)
    const role = input?.role ?? user.role;

    // Common checks
    const emailVerified = !!ctx.authUser?.email_confirmed_at;
    const businessVerified = user.verificationStatus === "verified";
    const profileComplete = !!(user.name && user.businessName && user.phone);

    // Check if preferences are set
    const prefs = await ctx.db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, user.id),
    });
    const preferencesSet = !!prefs;

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

  // Get public profile info for any user (for display name + location)
  getPublicProfile: publicProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.userId),
        columns: {
          id: true,
          name: true,
          businessCity: true,
          businessState: true,
          role: true,
          verified: true,
          createdAt: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return user;
    }),

  // Submit verification documents (account-first flow)
  submitVerification: protectedProcedure
    .input(submitVerificationSchema)
    .mutation(async ({ ctx, input }) => {
      return submitVerificationForUser({
        db: ctx.db,
        user: ctx.user,
        input,
      });
    }),

  // Resubmit verification (for rejected users)
  resubmitVerification: protectedProcedure
    .input(submitVerificationSchema.partial())
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.verificationStatus !== "rejected") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only rejected verifications can be resubmitted",
        });
      }

      // Fetch sensitive fields directly from DB (excluded from ctx.user for security)
      const fullUser = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.user.id),
        columns: {
          einTaxId: true,
          verificationDocUrl: true,
        },
      });

      const mergedSubmission: VerificationSubmission = {
        einTaxId: input.einTaxId ?? fullUser?.einTaxId ?? "",
        businessWebsite: input.businessWebsite ?? ctx.user.businessWebsite ?? "",
        verificationDocUrl:
          input.verificationDocUrl ?? fullUser?.verificationDocUrl ?? "",
        businessAddress: input.businessAddress ?? ctx.user.businessAddress ?? "",
        businessCity: input.businessCity ?? ctx.user.businessCity ?? "",
        businessState: input.businessState ?? ctx.user.businessState ?? "",
        businessZip: input.businessZip ?? ctx.user.businessZip ?? "",
      };

      const parsed = submitVerificationSchema.safeParse(mergedSubmission);
      if (!parsed.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: parsed.error.issues[0]?.message ?? "Invalid verification submission",
        });
      }

      return submitVerificationForUser({
        db: ctx.db,
        user: ctx.user,
        input: parsed.data,
      });
    }),
});
