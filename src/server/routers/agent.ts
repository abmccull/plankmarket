import { createTRPCRouter, protectedProcedure } from "../trpc";
import { agentConfigs, agentActions } from "@/server/db/schema";
import { eq, and, gt, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { isPro } from "@/lib/pro";
import type { Database } from "@/server/db";

async function pauseRule(
  db: Database,
  userId: string,
  field: "offerAutoEnabled" | "repricingEnabled" | "monitorEnabled",
) {
  const [result] = await db
    .insert(agentConfigs)
    .values({ userId, [field]: false })
    .onConflictDoUpdate({
      target: agentConfigs.userId,
      set: { [field]: false, updatedAt: new Date() },
    })
    .returning();
  return result;
}

function requireVerifiedSeller(user: {
  role: string;
  verificationStatus: string;
}) {
  if (
    user.role !== "admin" &&
    (user.role !== "seller" || user.verificationStatus !== "verified")
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "A verified seller account is required to enable these rules.",
    });
  }
}

export const agentRouter = createTRPCRouter({
  /**
   * Get the current user's agent configuration.
   * Keep owned stop controls available even after Pro access ends.
   */
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const config = await ctx.db.query.agentConfigs.findFirst({
      where: eq(agentConfigs.userId, ctx.user.id),
    });

    return { config: config ?? null, proRequired: !isPro(ctx.user) };
  }),

  /**
   * Update offer auto-handling rules (sellers only).
   */
  updateOfferRules: protectedProcedure
    .input(
      z
        .object({
          offerAutoEnabled: z.boolean(),
          offerAcceptAbove: z.number().min(50).max(100).optional(),
          offerCounterAt: z.number().min(30).max(100).optional(),
          offerRejectBelow: z.number().min(0).max(100).optional(),
          offerCounterMessage: z.string().max(500).optional(),
          offerRejectMessage: z.string().max(500).optional(),
        })
        .refine(
          (data) => {
            if (!data.offerAutoEnabled) return true;
            // Validate ordering: acceptAbove > counterAt > rejectBelow
            if (
              data.offerAcceptAbove !== undefined &&
              data.offerCounterAt !== undefined &&
              data.offerAcceptAbove <= data.offerCounterAt
            ) {
              return false;
            }
            if (
              data.offerCounterAt !== undefined &&
              data.offerRejectBelow !== undefined &&
              data.offerCounterAt <= data.offerRejectBelow
            ) {
              return false;
            }
            if (
              data.offerAcceptAbove !== undefined &&
              data.offerRejectBelow !== undefined &&
              data.offerAcceptAbove <= data.offerRejectBelow
            ) {
              return false;
            }
            return true;
          },
          {
            message:
              "Threshold ordering must be: acceptAbove > counterAt > rejectBelow",
          },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.offerAutoEnabled)
        return pauseRule(ctx.db, ctx.user.id, "offerAutoEnabled");
      requireVerifiedSeller(ctx.user);
      if (!isPro(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Pro subscription required to use the AI agent.",
        });
      }

      const [result] = await ctx.db
        .insert(agentConfigs)
        .values({
          userId: ctx.user.id,
          offerAutoEnabled: input.offerAutoEnabled,
          offerAcceptAbove: input.offerAcceptAbove ?? null,
          offerCounterAt: input.offerCounterAt ?? null,
          offerRejectBelow: input.offerRejectBelow ?? null,
          offerCounterMessage: input.offerCounterMessage ?? null,
          offerRejectMessage: input.offerRejectMessage ?? null,
        })
        .onConflictDoUpdate({
          target: agentConfigs.userId,
          set: {
            offerAutoEnabled: input.offerAutoEnabled,
            offerAcceptAbove: input.offerAcceptAbove ?? null,
            offerCounterAt: input.offerCounterAt ?? null,
            offerRejectBelow: input.offerRejectBelow ?? null,
            offerCounterMessage: input.offerCounterMessage ?? null,
            offerRejectMessage: input.offerRejectMessage ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();

      return result;
    }),

  /**
   * Update listing monitoring rules (any authenticated Pro user).
   */
  updateMonitorRules: protectedProcedure
    .input(
      z.object({
        monitorEnabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.monitorEnabled)
        return pauseRule(ctx.db, ctx.user.id, "monitorEnabled");
      if (!isPro(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Pro subscription required to use the AI agent.",
        });
      }

      const [result] = await ctx.db
        .insert(agentConfigs)
        .values({
          userId: ctx.user.id,
          monitorEnabled: input.monitorEnabled,
          monitorAutoOffer: false,
          monitorMaxPrice: null,
          monitorBudgetMonthly: null,
        })
        .onConflictDoUpdate({
          target: agentConfigs.userId,
          set: {
            monitorEnabled: input.monitorEnabled,
            monitorAutoOffer: false,
            monitorMaxPrice: null,
            monitorBudgetMonthly: null,
            updatedAt: new Date(),
          },
        })
        .returning();

      return result;
    }),

  /**
   * Update smart repricing rules (sellers only).
   */
  updateRepricingRules: protectedProcedure
    .input(
      z.object({
        repricingEnabled: z.boolean(),
        repricingDropPercent: z.number().min(1).max(50).optional(),
        repricingStaleAfterDays: z.number().int().min(1).max(90).optional(),
        repricingFloorPercent: z.number().min(10).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.repricingEnabled)
        return pauseRule(ctx.db, ctx.user.id, "repricingEnabled");
      requireVerifiedSeller(ctx.user);
      if (!isPro(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Pro subscription required to use the AI agent.",
        });
      }

      const [result] = await ctx.db
        .insert(agentConfigs)
        .values({
          userId: ctx.user.id,
          repricingEnabled: input.repricingEnabled,
          repricingDropPercent: input.repricingDropPercent ?? null,
          repricingStaleAfterDays: input.repricingStaleAfterDays ?? null,
          repricingFloorPercent: input.repricingFloorPercent ?? null,
        })
        .onConflictDoUpdate({
          target: agentConfigs.userId,
          set: {
            repricingEnabled: input.repricingEnabled,
            repricingDropPercent: input.repricingDropPercent ?? null,
            repricingStaleAfterDays: input.repricingStaleAfterDays ?? null,
            repricingFloorPercent: input.repricingFloorPercent ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();

      return result;
    }),

  /**
   * Get agent activity log for the current user.
   * Returns grouped counts by action type + the 50 most recent actions.
   */
  getActivity: protectedProcedure
    .input(
      z
        .object({
          days: z.number().int().min(1).max(365).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      if (!isPro(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Pro subscription required to use the AI agent.",
        });
      }

      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [counts, recent] = await Promise.all([
        // Grouped counts by action type
        ctx.db
          .select({
            actionType: agentActions.actionType,
            count: sql<number>`cast(count(*) as integer)`,
          })
          .from(agentActions)
          .where(
            and(
              eq(agentActions.userId, ctx.user.id),
              gt(agentActions.createdAt, since),
            ),
          )
          .groupBy(agentActions.actionType),

        // 50 most recent actions
        ctx.db.query.agentActions.findMany({
          where: and(
            eq(agentActions.userId, ctx.user.id),
            gt(agentActions.createdAt, since),
          ),
          orderBy: [desc(agentActions.createdAt)],
          limit: 50,
        }),
      ]);

      return {
        counts: counts.reduce(
          (acc, row) => {
            acc[row.actionType] = row.count;
            return acc;
          },
          {} as Record<string, number>,
        ),
        recent,
      };
    }),
});
