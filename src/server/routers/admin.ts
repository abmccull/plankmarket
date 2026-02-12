import { createTRPCRouter, adminProcedure } from "../trpc";
import { users, listings, orders } from "../db/schema";
import { desc, sql, eq, like, or, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const adminRouter = createTRPCRouter({
  // Get dashboard statistics
  getStats: adminProcedure.query(async ({ ctx }) => {
    // Get user counts
    const [{ totalUsers, buyerCount, sellerCount }] = await ctx.db
      .select({
        totalUsers: sql<number>`cast(count(*) as integer)`,
        buyerCount:
          sql<number>`cast(count(*) filter (where role = 'buyer') as integer)`,
        sellerCount:
          sql<number>`cast(count(*) filter (where role = 'seller') as integer)`,
      })
      .from(users);

    // Get listing counts
    const [{ totalListings, activeListings }] = await ctx.db
      .select({
        totalListings: sql<number>`cast(count(*) as integer)`,
        activeListings:
          sql<number>`cast(count(*) filter (where status = 'active') as integer)`,
      })
      .from(listings);

    // Get order counts and revenue
    const [{ totalOrders, completedOrders, totalRevenue, pendingRevenue }] =
      await ctx.db
        .select({
          totalOrders: sql<number>`cast(count(*) as integer)`,
          completedOrders:
            sql<number>`cast(count(*) filter (where status = 'delivered') as integer)`,
          totalRevenue: sql<number>`coalesce(sum(total_price), 0)`,
          pendingRevenue:
            sql<number>`coalesce(sum(total_price) filter (where status IN ('pending', 'confirmed', 'processing', 'shipped')), 0)`,
        })
        .from(orders);

    return {
      users: {
        total: totalUsers,
        buyers: buyerCount,
        sellers: sellerCount,
      },
      listings: {
        total: totalListings,
        active: activeListings,
      },
      orders: {
        total: totalOrders,
        completed: completedOrders,
      },
      revenue: {
        total: totalRevenue,
        pending: pendingRevenue,
      },
    };
  }),

  // Get paginated user list with filters
  getUsers: adminProcedure
    .input(
      z.object({
        query: z.string().optional(),
        role: z.enum(["buyer", "seller", "admin"]).optional(),
        verificationStatus: z
          .enum(["unverified", "pending", "verified", "rejected"])
          .optional(),
        active: z.boolean().optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      // Build where conditions
      const conditions = [];

      if (input.query) {
        conditions.push(
          or(
            like(users.name, `%${input.query}%`),
            like(users.email, `%${input.query}%`),
            like(users.businessName, `%${input.query}%`)
          )
        );
      }

      if (input.role) {
        conditions.push(eq(users.role, input.role));
      }

      if (input.verificationStatus) {
        conditions.push(eq(users.verificationStatus, input.verificationStatus));
      }

      if (input.active !== undefined) {
        conditions.push(eq(users.active, input.active));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const usersList = await ctx.db.query.users.findMany({
        where: whereClause,
        orderBy: [desc(users.createdAt)],
        limit: input.limit,
        offset,
      });

      // Get total count
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(users)
        .where(whereClause);

      return {
        users: usersList,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  // Get paginated listing list
  getListings: adminProcedure
    .input(
      z.object({
        query: z.string().optional(),
        status: z
          .enum(["draft", "active", "sold", "expired", "archived"])
          .optional(),
        sellerId: z.string().uuid().optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      // Build where conditions
      const conditions = [];

      if (input.query) {
        conditions.push(like(listings.title, `%${input.query}%`));
      }

      if (input.status) {
        conditions.push(eq(listings.status, input.status));
      }

      if (input.sellerId) {
        conditions.push(eq(listings.sellerId, input.sellerId));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const listingsList = await ctx.db.query.listings.findMany({
        where: whereClause,
        orderBy: [desc(listings.createdAt)],
        limit: input.limit,
        offset,
        with: {
          seller: {
            columns: {
              id: true,
              name: true,
              businessName: true,
              email: true,
            },
          },
        },
      });

      // Get total count
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(listings)
        .where(whereClause);

      return {
        listings: listingsList,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  // Get paginated order list
  getOrders: adminProcedure
    .input(
      z.object({
        orderNumber: z.string().optional(),
        status: z
          .enum([
            "pending",
            "confirmed",
            "processing",
            "shipped",
            "delivered",
            "cancelled",
            "refunded",
          ])
          .optional(),
        buyerId: z.string().uuid().optional(),
        sellerId: z.string().uuid().optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      // Build where conditions
      const conditions = [];

      if (input.orderNumber) {
        conditions.push(like(orders.orderNumber, `%${input.orderNumber}%`));
      }

      if (input.status) {
        conditions.push(eq(orders.status, input.status));
      }

      if (input.buyerId) {
        conditions.push(eq(orders.buyerId, input.buyerId));
      }

      if (input.sellerId) {
        conditions.push(eq(orders.sellerId, input.sellerId));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const ordersList = await ctx.db.query.orders.findMany({
        where: whereClause,
        orderBy: [desc(orders.createdAt)],
        limit: input.limit,
        offset,
        with: {
          buyer: {
            columns: {
              id: true,
              name: true,
              businessName: true,
              email: true,
            },
          },
          seller: {
            columns: {
              id: true,
              name: true,
              businessName: true,
              email: true,
            },
          },
          listing: {
            columns: {
              id: true,
              title: true,
            },
          },
        },
      });

      // Get total count
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(orders)
        .where(whereClause);

      return {
        orders: ordersList,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  // Get pending verification requests
  getPendingVerifications: adminProcedure.query(async ({ ctx }) => {
    const pendingUsers = await ctx.db.query.users.findMany({
      where: eq(users.verificationStatus, "pending"),
      orderBy: [desc(users.verificationRequestedAt)],
    });

    return pendingUsers;
  }),

  // Update verification status
  updateVerification: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        status: z.enum(["verified", "rejected"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the user
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      if (user.verificationStatus !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User verification is not pending",
        });
      }

      // Update verification status
      const [updatedUser] = await ctx.db
        .update(users)
        .set({
          verificationStatus: input.status,
          verificationNotes: input.notes,
          verified: input.status === "verified",
          updatedAt: new Date(),
        })
        .where(eq(users.id, input.userId))
        .returning();

      return updatedUser;
    }),

  // Update user details
  updateUser: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        role: z.enum(["buyer", "seller", "admin"]).optional(),
        active: z.boolean().optional(),
        verified: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the user
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Build update object
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (input.role !== undefined) {
        updateData.role = input.role;
      }

      if (input.active !== undefined) {
        updateData.active = input.active;
      }

      if (input.verified !== undefined) {
        updateData.verified = input.verified;
      }

      // Update user
      const [updatedUser] = await ctx.db
        .update(users)
        .set(updateData)
        .where(eq(users.id, input.userId))
        .returning();

      return updatedUser;
    }),
});
