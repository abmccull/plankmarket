import { withRoleProviderCoordinator } from "../services/role-provider-coordinator";
import { openRoleProviderWriteSession } from "../services/role-provider-write-session";
import { sellerActivationRoleProvider } from "../services/seller-activation-provider";
import { resumeAccountSetup } from "../services/resume-account-setup";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  rateLimitedPublicProcedure,
  strictProtectedProcedure,
  verificationDraftSaveProcedure,
} from "../trpc";
import {
  registerSchema,
  saveVerificationDraftSchema,
  submitVerificationDraftSchema,
  submitVerificationSchema,
  getVerificationSubmissionSchema,
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
import { requireOwnedVerificationDocument } from "@/server/services/verification-documents";
import {
  getChangedVerifiedBusinessFields,
  isVerificationStatus,
  verificationStateUpdate,
} from "@/server/services/verification-state";
import { getMaskedDisplayName } from "@/server/security/public-data";
import { canCreateListings } from "@/lib/auth/roles";
import { getPreferenceCompletion } from "@/lib/preferences-completion";
import {
  mergeVerificationDraftFields,
  parseVerificationDraftSubmission,
} from "@/server/services/verification-draft";

type VerificationSubmission = z.infer<typeof submitVerificationSchema>;

async function submitVerificationForUser(params: {
  db: typeof import("@/server/db").db;
  user: { id: string; role: string; verificationStatus: string };
  input?: VerificationSubmission;
  expectedDraftUpdatedAt?: Date;
}) {
  const { db, user } = params;
  if (user.role !== "buyer" && user.role !== "seller") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only buyer and seller accounts can submit verification" });
  }
  if (user.verificationStatus === "pending") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Your verification request is already under review" });
  }
  if (user.verificationStatus === "verified") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This account is already verified" });
  }

  // The owner row is also the draft-save lock. Freeze the checked draft and
  // install its canonical values in one transaction; provider I/O follows it.
  const transition = await db.transaction(async tx => {
    const [previous] = await tx.select({
      role: users.role,
      active: users.active,
      verificationStatus: users.verificationStatus,
      verificationSubmissionId: users.verificationSubmissionId,
      verificationRequestedAt: users.verificationRequestedAt,
    }).from(users).where(eq(users.id, user.id)).for("update");
    if (!previous || !previous.active || !["buyer", "seller"].includes(previous.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Business verification is unavailable for this account" });
    }
    if (!isVerificationStatus(previous.verificationStatus) || !["unverified", "rejected"].includes(previous.verificationStatus)) {
      throw new TRPCError({ code: "CONFLICT", message: "Your verification state changed. Refresh the page before submitting again." });
    }
    const previousStatus = previous.verificationStatus;

    let input = params.input;
    if (params.expectedDraftUpdatedAt) {
      const [draft] = await tx.select().from(verificationDrafts)
        .where(eq(verificationDrafts.userId, user.id)).for("update");
      if (!draft || draft.updatedAt.getTime() !== params.expectedDraftUpdatedAt.getTime()) {
        throw new TRPCError({ code: "CONFLICT", message: "A newer draft is saved. Check the saved draft before submitting." });
      }
      const parsed = parseVerificationDraftSubmission(draft);
      if (!parsed.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Complete every verification step before submitting" });
      }
      input = parsed.data;
    }
    const roleValidation = getVerificationSubmissionSchema(previous.role).safeParse(input);
    if (!roleValidation.success) {
      throw new TRPCError({ code: "BAD_REQUEST", message: roleValidation.error.issues[0]?.message ?? "Review your business details before submitting" });
    }
    const validated = roleValidation.data;
    await requireOwnedVerificationDocument(validated.verificationDocUrl, user.id, tx);
    const submissionId = crypto.randomUUID();
    const requestedAt = new Date();
    const [updated] = await tx.update(users).set({
      einTaxId: validated.einTaxId,
      businessWebsite: validated.businessWebsite || null,
      verificationDocUrl: validated.verificationDocUrl,
      businessAddress: validated.businessAddress,
      businessCity: validated.businessCity,
      businessState: validated.businessState,
      businessZip: validated.businessZip,
      ...verificationStateUpdate("pending"),
      verificationSubmissionId: submissionId,
      verificationRequestedAt: requestedAt,
      verificationNotes: null,
      aiVerificationScore: null,
      aiVerificationNotes: null,
      updatedAt: requestedAt,
    }).where(and(
      eq(users.id, user.id),
      eq(users.verificationStatus, previous.verificationStatus),
      previous.verificationSubmissionId
        ? eq(users.verificationSubmissionId, previous.verificationSubmissionId)
        : isNull(users.verificationSubmissionId),
    )).returning({ id: users.id });
    if (!updated) {
      throw new TRPCError({ code: "CONFLICT", message: "Your verification state changed. Refresh the page before submitting again." });
    }
    return { previous, previousStatus, submissionId, requestedAt };
  });
  const { previous, previousStatus, submissionId, requestedAt } = transition;
  try {
    // Acceptance is awaited after commit. An uncertain delivery is compensated
    // only while this exact submission remains pending.
    await inngest.send({ id: `verification-submitted:${submissionId}`, name: "verification/submitted", data: { userId: user.id, submissionId } });
  } catch {
    await db.update(users).set({
      ...verificationStateUpdate(previousStatus),
      verificationSubmissionId: previous.verificationSubmissionId,
      verificationRequestedAt: previous.verificationRequestedAt,
      verificationNotes: "Verification queue unavailable; please retry.",
      updatedAt: new Date(),
    }).where(and(eq(users.id, user.id), eq(users.verificationStatus, "pending"), eq(users.verificationSubmissionId, submissionId)));
    console.error("Failed to enqueue business verification", { userId: user.id, submissionId });
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Verification could not be queued. Please try again." });
  }

  if (params.expectedDraftUpdatedAt) {
    // A successful queue receipt must survive cleanup failure; never remove a
    // replacement draft that appeared after the submitted snapshot was read.
    await db.delete(verificationDrafts).where(and(
      eq(verificationDrafts.userId, user.id),
      eq(verificationDrafts.updatedAt, params.expectedDraftUpdatedAt),
    )).catch(() => { console.error("Failed to remove submitted verification draft", { userId: user.id, submissionId }); });
  }
  return { verificationStatus: "pending" as const, submissionId, requestedAt };
}


export const authRouter = createTRPCRouter({
  // Register a new user (creates DB record after Supabase auth signup)
  register: rateLimitedPublicProcedure
    .input(registerSchema)
    .mutation(async ({ ctx, input }) => {
      // Admit before external/account creation: busy registration is safe to retry.
      const profileId = crypto.randomUUID();
      const { newUser, authUser } = await withRoleProviderCoordinator(profileId, async () => {
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

      // Create the unique application profile before initializing provider role.
      // Existing identities must never be reset by a repeated public signup.

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
            id: profileId,
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

        // Never delete the auth identity on an uncertain or duplicate profile
        // insert. It can belong to an existing account or another registration.

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "We could not finish creating your account profile. Please try again.",
        });
      }

      if (!newUser) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Your account profile needs support review." });
        const roleSession = await openRoleProviderWriteSession(ctx.db, newUser!.id, await sellerActivationRoleProvider());
        const external = await roleSession.read();
        if ((external.appMetadata.role != null && external.appMetadata.role !== newUser!.role) ||
            external.appMetadata.plankmarket_seller_activation != null || external.appMetadata.plankmarket_role_write != null) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Your account needs support confirmation. Sign in to account recovery." });
        }
        await roleSession.ensure({ role: newUser!.role, plankmarket_seller_activation: null }, "registration", null);
        return { newUser, authUser };
      });

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

  // No caller-supplied identity or role. Strict limiter and current Auth ownership.
  resumeAccountSetup: strictProtectedProcedure.mutation(({ ctx }) =>
    resumeAccountSetup(ctx.db, ctx.user.id, ctx.authUser.id)),

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

  // Owner-only draft reads contain the user's sensitive verification fields.
  getVerificationDraft: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "buyer" && ctx.user.role !== "seller") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Business verification is available to buyer and seller accounts" });
    }
    const draft = await ctx.db.query.verificationDrafts.findFirst({ where: eq(verificationDrafts.userId, ctx.user.id) });
    if (draft) {
      // Null in an existing row is an intentional clear, not a profile fallback.
      return {
        ownerId: ctx.user.id,
        currentStep: draft.currentStep,
        businessWebsite: draft.businessWebsite ?? "",
        einTaxId: draft.einTaxId ?? "",
        verificationDocUrl: draft.verificationDocUrl ?? "",
        businessAddress: draft.businessAddress ?? "",
        businessCity: draft.businessCity ?? "",
        businessState: draft.businessState ?? "",
        businessZip: draft.businessZip ?? "",
        updatedAt: draft.updatedAt,
      };
    }
    const sensitiveProfile = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.user.id), columns: { einTaxId: true, verificationDocUrl: true },
    });
    return {
      ownerId: ctx.user.id,
      currentStep: 1,
      businessWebsite: ctx.user.businessWebsite ?? "",
      einTaxId: sensitiveProfile?.einTaxId ?? "",
      verificationDocUrl: sensitiveProfile?.verificationDocUrl ?? "",
      businessAddress: ctx.user.businessAddress === "Pending verification" ? "" : ctx.user.businessAddress ?? "",
      businessCity: ctx.user.businessCity === "NA" ? "" : ctx.user.businessCity ?? "",
      businessState: ctx.user.businessState === "NA" ? "" : ctx.user.businessState ?? "",
      businessZip: ctx.user.businessZip ?? "",
      updatedAt: null,
    };
  }),

  saveVerificationDraft: verificationDraftSaveProcedure
    .input(saveVerificationDraftSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.expectedOwnerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your signed-in account changed. Reload before editing verification." });
      }
      if (ctx.user.role !== "buyer" && ctx.user.role !== "seller") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Business verification is available to buyer and seller accounts" });
      }
      if (ctx.user.verificationStatus === "pending" || ctx.user.verificationStatus === "verified") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This verification can no longer be edited" });
      }
      return ctx.db.transaction(async tx => {
        const [freshUser] = await tx.select({ status: users.verificationStatus, role: users.role, active: users.active })
          .from(users).where(eq(users.id, ctx.user.id)).for("update");
        if (!freshUser || !freshUser.active || !["buyer", "seller"].includes(freshUser.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Business verification is unavailable for this account" });
        }
        if (!["unverified", "rejected"].includes(freshUser.status)) {
          throw new TRPCError({ code: "CONFLICT", message: "Verification is no longer editable. Reload the page." });
        }
        const existing = await tx.query.verificationDrafts.findFirst({ where: eq(verificationDrafts.userId, ctx.user.id) });
        if ((existing?.updatedAt.getTime() ?? null) !== (input.expectedUpdatedAt?.getTime() ?? null)) {
          throw new TRPCError({ code: "CONFLICT", message: "A newer draft is saved. Check it before replacing your details." });
        }
        if (input.verificationDocUrl?.trim()) await requireOwnedVerificationDocument(input.verificationDocUrl, ctx.user.id, tx);
        // Millisecond Dates are the public CAS token. Even a frozen/backward
        // clock must not issue the same token for two successful writes.
        const updatedAt = new Date(Math.max(Date.now(), (existing?.updatedAt.getTime() ?? 0) + 1));
        const values = { userId: ctx.user.id, currentStep: input.currentStep, ...mergeVerificationDraftFields(existing, input), updatedAt };
        await tx.insert(verificationDrafts).values(values).onConflictDoUpdate({ target: verificationDrafts.userId, set: values });
        return { ownerId: ctx.user.id, currentStep: values.currentStep, updatedAt };
      });
    }),

  submitVerificationDraft: strictProtectedProcedure
    .input(submitVerificationDraftSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.expectedOwnerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your signed-in account changed. Reload before submitting verification." });
      }
      return submitVerificationForUser({ db: ctx.db, user: ctx.user, expectedDraftUpdatedAt: input.expectedUpdatedAt });
    }),


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

    let assurance: {
      currentLevel: "aal1" | "aal2";
      nextLevel: "aal1" | "aal2";
      hasVerifiedTotp: boolean;
      lastFactorVerificationAt: string | null;
      recentVerificationSatisfied: boolean;
    } = {
      currentLevel: "aal1",
      nextLevel: "aal1",
      hasVerifiedTotp: false,
      lastFactorVerificationAt: null,
      recentVerificationSatisfied: false,
    };

    try {
      const [assuranceState, factorState] = await Promise.all([
        ctx.getAuthAssurance(),
        ctx.supabase.auth.mfa.listFactors(),
      ]);

      if (factorState.error) {
        throw factorState.error;
      }

      assurance = {
        currentLevel:
          assuranceState.currentLevel === "aal2" ? "aal2" : "aal1",
        nextLevel:
          assuranceState.nextLevel === "aal2" ? "aal2" : "aal1",
        hasVerifiedTotp: factorState.data.totp.length > 0,
        lastFactorVerificationAt: assuranceState.lastFactorVerificationAt,
        recentVerificationSatisfied:
          assuranceState.recentVerificationSatisfied,
      };
    } catch (error) {
      console.error("[auth] failed to load MFA session state", {
        authUserId: ctx.authUser?.id,
        error: error instanceof Error ? error.name : "UnknownError",
      });
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
        assurance,
      },
      isAuthenticated: true,
    };
  }),

  // Get onboarding progress for current user
  getOnboardingProgress: protectedProcedure
    .input(z.object({ role: z.enum(["buyer", "seller"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
    const user = ctx.user;
    const role = input?.role ?? (user.role === "seller" ? "seller" : "buyer");
    if (role === "seller" && !canCreateListings(user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Selling setup requires a seller account." });
    }

    // Common checks
    const emailVerified = !!ctx.authUser?.email_confirmed_at;
    const businessVerified = user.verificationStatus === "verified";
    const profileComplete = !!(user.name && user.businessName && user.phone);

    // Check if preferences are set
    const prefs = await ctx.db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, user.id),
    });
    const preferencesSet = getPreferenceCompletion(prefs, role).profileComplete;

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
