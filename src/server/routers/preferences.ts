import { createTRPCRouter, protectedProcedure } from "../trpc";
import { upsertPreferencesSchema } from "@/lib/validators/preferences";
import { userPreferences } from "../db/schema/user-preferences";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * Buyer preference fields used for profile completion scoring.
 */
const BUYER_CORE_FIELDS: Array<keyof typeof userPreferences.$inferSelect> = [
  "preferredZip",
  "preferredRadiusMiles",
  "preferredMaterialTypes",
  "preferredUseCase",
  "priceMaxPerSqFt",
  "preferredShippingMode",
  "urgency",
];

/**
 * Seller preference fields used for profile completion scoring.
 */
const SELLER_CORE_FIELDS: Array<keyof typeof userPreferences.$inferSelect> = [
  "originZip",
  "shipCapable",
  "typicalMaterialTypes",
  "minLotSqFt",
  "preferredBuyerRadiusMiles",
  "pricingStyle",
  "leadTimeDaysMin",
];

/**
 * Returns a list of fields that are filled (non-null, non-empty) from a preferences record.
 */
function getFilledFields(
  prefs: typeof userPreferences.$inferSelect,
  fields: Array<keyof typeof userPreferences.$inferSelect>
): Array<keyof typeof userPreferences.$inferSelect> {
  return fields.filter((field) => {
    const value = prefs[field];
    if (value === null || value === undefined) return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  });
}

export const preferencesRouter = createTRPCRouter({
  /**
   * Upsert the current user's preferences. Role is validated against the user's
   * actual profile role — input role must match. Uses onConflictDoUpdate on userId.
   */
  upsert: protectedProcedure
    .input(upsertPreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.user.role;

      // Validate that the role in input matches the user's actual role.
      // Admins may set either role.
      if (userRole !== "admin" && input.role !== userRole) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You can only set ${userRole} preferences (your account role is ${userRole})`,
        });
      }

      const now = new Date();

      // Build the upsert payload from input, spreading role-specific fields
      const { role, ...roleFields } = input;

      // Determine whether the profile should be considered complete
      // by checking if enough core fields are filled after this upsert.
      const coreFields =
        role === "buyer" ? BUYER_CORE_FIELDS : SELLER_CORE_FIELDS;
      const COMPLETION_THRESHOLD = Math.ceil(coreFields.length * 0.7); // 70% filled

      // Count how many of the core fields will be filled post-upsert
      const filledCount = coreFields.filter((field) => {
        const key = field as keyof typeof roleFields;
        const value = (roleFields as Record<string, unknown>)[key as string];
        if (value === undefined || value === null) return false;
        if (Array.isArray(value) && value.length === 0) return false;
        return true;
      }).length;

      const profileComplete = filledCount >= COMPLETION_THRESHOLD;

      const [result] = await ctx.db
        .insert(userPreferences)
        .values({
          userId: ctx.user.id,
          role,
          ...(roleFields as Record<string, unknown>),
          profileComplete,
          completedAt: profileComplete ? now : null,
          updatedAt: now,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: {
            ...(roleFields as Record<string, unknown>),
            profileComplete,
            completedAt: profileComplete ? now : null,
            updatedAt: now,
          },
        })
        .returning();

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save preferences",
        });
      }

      return result;
    }),

  /**
   * Get the current user's preferences record, or null if not yet set.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const prefs = await ctx.db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, ctx.user.id),
    });

    return prefs ?? null;
  }),

  /**
   * Returns a completion status breakdown for the user's preferences.
   * Shows how many core fields are filled, total fields, percentage, and which are missing.
   */
  getCompletionStatus: protectedProcedure.query(async ({ ctx }) => {
    const prefs = await ctx.db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, ctx.user.id),
    });

    if (!prefs) {
      const role = ctx.user.role === "seller" ? "seller" : "buyer";
      const coreFields = role === "buyer" ? BUYER_CORE_FIELDS : SELLER_CORE_FIELDS;
      return {
        filledCount: 0,
        totalFields: coreFields.length,
        completionPercent: 0,
        missingFields: coreFields as string[],
        profileComplete: false,
      };
    }

    const coreFields =
      prefs.role === "buyer" ? BUYER_CORE_FIELDS : SELLER_CORE_FIELDS;

    const filledFields = getFilledFields(prefs, coreFields);
    const missingFields = coreFields.filter(
      (f) => !filledFields.includes(f)
    );

    return {
      filledCount: filledFields.length,
      totalFields: coreFields.length,
      completionPercent: Math.round(
        (filledFields.length / coreFields.length) * 100
      ),
      missingFields: missingFields as string[],
      profileComplete: prefs.profileComplete,
    };
  }),
});
