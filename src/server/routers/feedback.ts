import {
  createTRPCRouter,
  protectedProcedure,
  adminProcedure,
} from "../trpc";
import { feedback } from "../db/schema";
import { desc, sql, eq } from "drizzle-orm";
import { z } from "zod";

export const feedbackRouter = createTRPCRouter({
  // Submit feedback
  submit: protectedProcedure
    .input(
      z.object({
        page: z.string().max(255).optional(),
        type: z.enum(["bug", "feature", "general"]),
        message: z.string().min(1).max(5000),
        rating: z.number().int().min(1).max(5).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Create feedback
      const [newFeedback] = await ctx.db
        .insert(feedback)
        .values({
          userId: ctx.user.id,
          page: input.page,
          type: input.type,
          message: input.message,
          rating: input.rating,
        })
        .returning();

      return newFeedback;
    }),

  // Get all feedback (admin only)
  getAll: adminProcedure
    .input(
      z.object({
        type: z.enum(["bug", "feature", "general"]).optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const whereClause = input.type ? eq(feedback.type, input.type) : undefined;

      const feedbackList = await ctx.db.query.feedback.findMany({
        where: whereClause,
        orderBy: [desc(feedback.createdAt)],
        limit: input.limit,
        offset,
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      });

      // Get total count
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(feedback)
        .where(whereClause);

      return {
        feedback: feedbackList,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),
});
