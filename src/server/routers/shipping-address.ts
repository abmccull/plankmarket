import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  createShippingAddressSchema,
  updateShippingAddressSchema,
} from "@/lib/validators/shipping-address";
import { shippingAddresses } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const shippingAddressRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.shippingAddresses.findMany({
      where: eq(shippingAddresses.userId, ctx.user.id),
      orderBy: (sa, { desc }) => [desc(sa.isDefault), desc(sa.createdAt)],
    });
  }),

  create: protectedProcedure
    .input(createShippingAddressSchema)
    .mutation(async ({ ctx, input }) => {
      // If setting as default, clear other defaults first
      if (input.isDefault) {
        await ctx.db
          .update(shippingAddresses)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(shippingAddresses.userId, ctx.user.id),
              eq(shippingAddresses.isDefault, true)
            )
          );
      }

      const [address] = await ctx.db
        .insert(shippingAddresses)
        .values({
          userId: ctx.user.id,
          ...input,
          isDefault: input.isDefault ?? false,
        })
        .returning();

      return address;
    }),

  update: protectedProcedure
    .input(updateShippingAddressSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.shippingAddresses.findFirst({
        where: and(
          eq(shippingAddresses.id, input.id),
          eq(shippingAddresses.userId, ctx.user.id)
        ),
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Address not found" });
      }

      // If setting as default, clear other defaults first
      if (input.isDefault) {
        await ctx.db
          .update(shippingAddresses)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(shippingAddresses.userId, ctx.user.id),
              eq(shippingAddresses.isDefault, true)
            )
          );
      }

      const { id, ...updateFields } = input;
      const [updated] = await ctx.db
        .update(shippingAddresses)
        .set({ ...updateFields, updatedAt: new Date() })
        .where(eq(shippingAddresses.id, id))
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.shippingAddresses.findFirst({
        where: and(
          eq(shippingAddresses.id, input.id),
          eq(shippingAddresses.userId, ctx.user.id)
        ),
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Address not found" });
      }

      await ctx.db
        .delete(shippingAddresses)
        .where(eq(shippingAddresses.id, input.id));

      return { success: true };
    }),

  setDefault: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.shippingAddresses.findFirst({
        where: and(
          eq(shippingAddresses.id, input.id),
          eq(shippingAddresses.userId, ctx.user.id)
        ),
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Address not found" });
      }

      // Clear all defaults, then set this one
      await ctx.db
        .update(shippingAddresses)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(shippingAddresses.userId, ctx.user.id),
            eq(shippingAddresses.isDefault, true)
          )
        );

      const [updated] = await ctx.db
        .update(shippingAddresses)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(shippingAddresses.id, input.id))
        .returning();

      return updated;
    }),
});
