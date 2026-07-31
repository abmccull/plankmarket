import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  rateLimitedPublicProcedure,
  strictProtectedProcedure,
} from "../trpc";
import {
  registerSchema,
  saveVerificationDraftSchema,
  submitVerificationSchema,
  updateProfileSchema,
} from "@/lib/validators/auth";
import {
  users,
  listings,
  savedSearches,
  orders,
  userPreferences,
  notifications,
  verificationDrafts,
} from "../db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "@/env";
import zipcodes from "zipcodes";
import { sendWelcomeEmail } from "@/lib/email/send";
import { inngest } from "@/lib/inngest/client";
import { validateVerificationDocUrl } from "@/server/services/verification-doc-url";
import {
  getChangedVerifiedBusinessFields,
  isVerificationStatus,
  verificationStateUpdate,
} from "@/server/services/verification-state";
import { getMaskedDisplayName } from "@/server/security/public-data";
import {
  mergeVerificationDraftFields,
  parseVerificationDraftSubmission,
} from "@/server/services/verification-draft";

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
  if (user.verificationStatus === "verified") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This account is already verified",
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
      reason: urlValidation.reason,
    });
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: urlValidation.reason ?? "Invalid verification document URL",
    });
  }

  const previous = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: {
      verificationStatus: true,
      verificationSubmissionId: true,
      verificationRequestedAt: true,
    },
  });
  const previousStatus =
    previous && isVerificationStatus(previous.verificationStatus)
      ? previous.verificationStatus
      : "unverified";
  const submissionId = crypto.randomUUID();
  const requestedAt = new Date();

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
      ...verificationStateUpdate("pending"),
      verificationSubmissionId: submissionId,
      verificationRequestedAt: requestedAt,
      verificationNotes: null,
      aiVerificationScore: null,
      aiVerificationNotes: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(users.id, user.id),
        eq(users.verificationStatus, previousStatus),
        previous?.verificationSubmissionId
          ? eq(
              users.verificationSubmissionId,
              previous.verificationSubmissionId,
            )
          : isNull(users.verificationSubmissionId),
      ),
    )
    .returning();

  if (!updated) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Your verification state changed. Refresh the page before submitting again.",
    });
  }

  try {
    // Await provider acceptance so the serverless request cannot terminate
    // before the durable verification job is queued.
    await inngest.send({
      id: `verification-submitted:${submissionId}`,
      name: "verification/submitted",
      data: { userId: user.id, submissionId },
    });
  } catch {
    // If event delivery is uncertain, roll back only this exact submission.
    // An event that was actually accepted becomes harmlessly stale.
    await db
      .update(users)
      .set({
        ...verificationStateUpdate(previousStatus),
        verificationSubmissionId:
          previous?.verificationSubmissionId ?? null,
        verificationRequestedAt:
          previous?.verificationRequestedAt ?? null,
        verificationNotes: "Verification queue unavailable; please retry.",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(users.id, user.id),
          eq(users.verificationStatus, "pending"),
          eq(users.verificationSubmissionId, submissionId),
        ),
      );
    console.error("Failed to enqueue business verification", {
      userId: user.id,
      submissionId,
    });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Verification could not be queued. Please try again.",
    });
  }

  return {
    verificationStatus: "pending" as const,
    submissionId,
    requestedAt,
  };
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
      const authUser = authData.user;

      // Set app_metadata.role using service role client (server-writable only, not client-mutable)
      const { createServiceClient } = await import("@/lib/supabase/server");
      const serviceClient = await createServiceClient();
      const { error: roleMetadataError } =
        await serviceClient.auth.admin.updateUserById(authUser.id, {
        app_metadata: { ...authUser.app_metadata, role: input.role },
      });
      if (roleMetadataError) {
        await serviceClient.auth.admin.deleteUser(authUser.id).catch(() => {});
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "We could not finish configuring your account.",
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
      let newUser: typeof users.$inferSelect | undefined;
      try {
        const [inserted] = await ctx.db
          .insert(users)
          .values({
            authId: authUser.id,
            email: input.email,
            name: input.name,
            role: input.role,
            businessName: input.businessName,
            phone: input.phone ?? "",
            // Store safe placeholders for legacy databases that still enforce
            // non-null business verification columns at registration time.
            businessAddress: "Pending verification",
            businessCity: "NA",
            businessState: "NA",
            businessZip: input.zipCode,
            verificationDocUrl: "",
            verificationRequestedAt: new Date(0),
            verificationNotes: "",
            businessWebsite: "",
            einTaxId: "",
            zipCode: input.zipCode,
            lat: lat ?? 0,
            lng: lng ?? 0,
            ...verificationStateUpdate("unverified"),
            active: true,
          })
          .returning();

        newUser = inserted;
      } catch {
        console.error("Failed to create app user profile after auth signup", {
          authUserId: authUser.id,
          role: input.role,
        });

        // Avoid orphaned auth users that appear "logged in" but have no app profile.
        await serviceClient.auth.admin
          .deleteUser(authUser.id)
          .catch(() => {
            console.error("Failed to rollback orphaned auth user", {
              authUserId: authUser.id,
            });
          });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "We could not finish creating your account profile. Please try again.",
        });
      }

      // Await provider acceptance so serverless teardown cannot discard it.
      await sendWelcomeEmail({
        to: input.email,
        name: input.name,
        role: input.role,
        idempotencyKey: `welcome-${newUser!.id}`,
      }).catch(() => {
        console.error("Failed to send welcome email", {
          userId: newUser!.id,
        });
      });

      try {
        await inngest.send({
          id: `user-registered:${newUser!.id}`,
          name: "user/registered",
          data: {
            userId: newUser!.id,
            email: input.email,
            name: input.name,
            role: input.role,
          },
        });
      } catch {
        console.error("Failed to enqueue onboarding drip", {
          userId: newUser!.id,
        });
      }

      return {
        user: {
          id: newUser!.id,
          email: newUser!.email,
          name: newUser!.name,
          role: newUser!.role,
          businessName: newUser!.businessName,
          verificationStatus: newUser!.verificationStatus,
        },
        requiresVerification: !authUser.email_confirmed_at,
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

  // Resume a server-persisted verification draft. Sensitive fields are scoped
  // to the current authenticated user and never written to browser storage.
  getVerificationDraft: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "buyer" && ctx.user.role !== "seller") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Business verification is available to buyer and seller accounts",
      });
    }

    const [draft, sensitiveProfile] = await Promise.all([
      ctx.db.query.verificationDrafts.findFirst({
        where: eq(verificationDrafts.userId, ctx.user.id),
      }),
      ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.user.id),
        columns: {
          einTaxId: true,
          verificationDocUrl: true,
        },
      }),
    ]);

    return {
      currentStep: draft?.currentStep ?? 1,
      businessWebsite:
        draft?.businessWebsite ?? ctx.user.businessWebsite ?? "",
      einTaxId: draft?.einTaxId ?? sensitiveProfile?.einTaxId ?? "",
      verificationDocUrl:
        draft?.verificationDocUrl ??
        sensitiveProfile?.verificationDocUrl ??
        "",
      businessAddress:
        draft?.businessAddress ??
        (ctx.user.businessAddress === "Pending verification"
          ? ""
          : ctx.user.businessAddress ?? ""),
      businessCity:
        draft?.businessCity ??
        (ctx.user.businessCity === "NA" ? "" : ctx.user.businessCity ?? ""),
      businessState:
        draft?.businessState ??
        (ctx.user.businessState === "NA" ? "" : ctx.user.businessState ?? ""),
      businessZip: draft?.businessZip ?? ctx.user.businessZip ?? "",
      updatedAt: draft?.updatedAt ?? null,
    };
  }),

  saveVerificationDraft: strictProtectedProcedure
    .input(saveVerificationDraftSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "buyer" && ctx.user.role !== "seller") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Business verification is available to buyer and seller accounts",
        });
      }
      if (
        ctx.user.verificationStatus === "pending" ||
        ctx.user.verificationStatus === "verified"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This verification can no longer be edited",
        });
      }

      const existing = await ctx.db.query.verificationDrafts.findFirst({
        where: eq(verificationDrafts.userId, ctx.user.id),
      });
      const now = new Date();
      const mergedFields = mergeVerificationDraftFields(existing, input);
      const values = {
        userId: ctx.user.id,
        currentStep: input.currentStep,
        ...mergedFields,
        updatedAt: now,
      };

      await ctx.db
        .insert(verificationDrafts)
        .values(values)
        .onConflictDoUpdate({
          target: verificationDrafts.userId,
          set: {
            currentStep: values.currentStep,
            businessWebsite: values.businessWebsite,
            einTaxId: values.einTaxId,
            verificationDocUrl: values.verificationDocUrl,
            businessAddress: values.businessAddress,
            businessCity: values.businessCity,
            businessState: values.businessState,
            businessZip: values.businessZip,
            updatedAt: now,
          },
        });

      return { currentStep: values.currentStep, updatedAt: now };
    }),

  submitVerificationDraft: strictProtectedProcedure.mutation(
    async ({ ctx }) => {
      if (
        ctx.user.verificationStatus === "pending" ||
        ctx.user.verificationStatus === "verified"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This verification can no longer be submitted",
        });
      }

      const draft = await ctx.db.query.verificationDrafts.findFirst({
        where: eq(verificationDrafts.userId, ctx.user.id),
      });
      if (!draft) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Save your verification details before submitting",
        });
      }

      const parsed = parseVerificationDraftSubmission(draft);
      if (!parsed.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            parsed.error.issues[0]?.message ??
            "Complete every verification step before submitting",
        });
      }

      const result = await submitVerificationForUser({
        db: ctx.db,
        user: ctx.user,
        input: parsed.data,
      });

      // The queued submission now owns the canonical values. Draft cleanup is
      // best-effort so a cleanup failure cannot make a successful submission
      // appear to have failed and tempt the user to submit it twice.
      await ctx.db
        .delete(verificationDrafts)
        .where(eq(verificationDrafts.userId, ctx.user.id))
        .catch(() => {
          console.error("Failed to remove submitted verification draft", {
            userId: ctx.user.id,
            submissionId: result.submissionId,
          });
        });

      return result;
    },
  ),

  // Update user profile
  updateProfile: strictProtectedProcedure
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [current] = await tx
          .select({
            businessName: users.businessName,
            businessAddress: users.businessAddress,
            businessCity: users.businessCity,
            businessState: users.businessState,
            businessZip: users.businessZip,
            verificationStatus: users.verificationStatus,
            verificationNotes: users.verificationNotes,
          })
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .for("update");

        if (!current) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }

        const changedVerifiedFields = getChangedVerifiedBusinessFields(
          current,
          input,
        );
        const resetVerification =
          changedVerifiedFields.length > 0 &&
          current.verificationStatus !== "unverified";
        const now = new Date();
        const updateData = {
          name: input.name,
          phone: input.phone,
          businessName: input.businessName,
          businessAddress: input.businessAddress,
          businessCity: input.businessCity,
          businessState: input.businessState,
          businessZip: input.businessZip,
          avatarUrl: input.avatarUrl,
          updatedAt: now,
          ...(resetVerification
            ? {
                ...verificationStateUpdate("unverified"),
                verificationSubmissionId: null,
                verificationRequestedAt: null,
                aiVerificationScore: null,
                aiVerificationNotes: null,
                verificationNotes: [
                  current.verificationNotes,
                  `[${now.toISOString()}] Verification reset after profile changes: ${changedVerifiedFields.join(", ")}`,
                ]
                  .filter(Boolean)
                  .join("\n"),
              }
            : {}),
        };

        const [updated] = await tx
          .update(users)
          .set(updateData)
          .where(eq(users.id, ctx.user.id))
          .returning();

        if (resetVerification) {
          await tx.insert(notifications).values({
            userId: ctx.user.id,
            type: "system",
            title: "Business verification required",
            message:
              "Your verified business details changed. Submit the updated information for review before using verified marketplace actions.",
            data: {
              type: "verification_reset",
              changedFields: changedVerifiedFields,
            },
          });
        }

        return updated;
      });
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
        verified: ctx.user.verificationStatus === "verified",
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
          businessCity: true,
          businessState: true,
          role: true,
          verificationStatus: true,
          createdAt: true,
          proStatus: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return {
        id: user.id,
        role: user.role,
        businessCity: user.businessCity,
        businessState: user.businessState,
        verified: user.verificationStatus === "verified",
        createdAt: user.createdAt,
        proStatus: user.proStatus,
        displayName: getMaskedDisplayName(user),
      };
    }),

  // Submit verification documents (account-first flow)
  submitVerification: strictProtectedProcedure
    .input(submitVerificationSchema)
    .mutation(async ({ ctx, input }) => {
      return submitVerificationForUser({
        db: ctx.db,
        user: ctx.user,
        input,
      });
    }),

  // Resubmit verification (for rejected users)
  resubmitVerification: strictProtectedProcedure
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
