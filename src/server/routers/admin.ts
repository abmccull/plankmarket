import { createTRPCRouter, adminProcedure } from "../trpc";
import { users, listings, orders, notifications, platformSettings, shipments, shipmentStatusEnum } from "../db/schema";
import { desc, sql, eq, like, or, and, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { priority1 } from "@/server/services/priority1";
import type { TrackingEvent } from "@/server/db/schema";

/** Default platform settings */
const DEFAULT_SETTINGS: Record<string, unknown> = {
  buyerFeePercent: 3,
  sellerFeePercent: 2,
  listingExpiryDays: 90,
  maxPhotosPerListing: 20,
  platformName: "PlankMarket",
  supportEmail: "support@plankmarket.com",
  escrowReleaseDays: 3,
};

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
      orderBy: [asc(users.verificationRequestedAt)], // FIFO - oldest first
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

      // Insert notification
      if (input.status === "verified") {
        await ctx.db.insert(notifications).values({
          userId: input.userId,
          type: "system",
          title: "Account Verified",
          message:
            "Your business has been verified. You now have full access to PlankMarket.",
          read: false,
        });
      } else {
        await ctx.db.insert(notifications).values({
          userId: input.userId,
          type: "system",
          title: "Verification Not Approved",
          message: input.notes
            ? `Your verification request was not approved. Reason: ${input.notes}`
            : "Your verification request was not approved. Please contact support for more information.",
          read: false,
        });
      }

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

  // Get finance dashboard statistics
  getFinanceStats: adminProcedure.query(async ({ ctx }) => {
    // Summary KPIs
    const [summary] = await ctx.db
      .select({
        totalGmv: sql<number>`coalesce(sum(subtotal), 0)`,
        totalBuyerFees: sql<number>`coalesce(sum(buyer_fee), 0)`,
        totalSellerFees: sql<number>`coalesce(sum(seller_fee), 0)`,
        platformRevenue: sql<number>`coalesce(sum(buyer_fee) + sum(seller_fee), 0)`,
        totalPayouts: sql<number>`coalesce(sum(seller_payout), 0)`,
        avgOrderValue: sql<number>`coalesce(avg(total_price), 0)`,
        orderCount: sql<number>`cast(count(*) as integer)`,
      })
      .from(orders);

    // By order status
    const byStatus = await ctx.db
      .select({
        status: orders.status,
        count: sql<number>`cast(count(*) as integer)`,
        gmv: sql<number>`coalesce(sum(subtotal), 0)`,
      })
      .from(orders)
      .groupBy(orders.status);

    // Monthly trend (last 12 months)
    const monthlyTrend = await ctx.db
      .select({
        month: sql<string>`to_char(date_trunc('month', created_at), 'YYYY-MM')`,
        orderCount: sql<number>`cast(count(*) as integer)`,
        gmv: sql<number>`coalesce(sum(subtotal), 0)`,
        buyerFees: sql<number>`coalesce(sum(buyer_fee), 0)`,
        sellerFees: sql<number>`coalesce(sum(seller_fee), 0)`,
      })
      .from(orders)
      .where(
        sql`created_at >= date_trunc('month', now()) - interval '11 months'`
      )
      .groupBy(sql`date_trunc('month', created_at)`)
      .orderBy(asc(sql`date_trunc('month', created_at)`));

    // Escrow breakdown
    const escrowBreakdown = await ctx.db
      .select({
        escrowStatus: orders.escrowStatus,
        count: sql<number>`cast(count(*) as integer)`,
        total: sql<number>`coalesce(sum(total_price), 0)`,
      })
      .from(orders)
      .groupBy(orders.escrowStatus);

    // Top 5 sellers by GMV
    const topSellers = await ctx.db
      .select({
        sellerId: orders.sellerId,
        sellerName: users.name,
        businessName: users.businessName,
        gmv: sql<number>`coalesce(sum(${orders.subtotal}), 0)`,
        orderCount: sql<number>`cast(count(*) as integer)`,
      })
      .from(orders)
      .innerJoin(users, eq(orders.sellerId, users.id))
      .groupBy(orders.sellerId, users.name, users.businessName)
      .orderBy(desc(sql`sum(${orders.subtotal})`))
      .limit(5);

    // Recent 10 orders
    const recentOrders = await ctx.db.query.orders.findMany({
      orderBy: [desc(orders.createdAt)],
      limit: 10,
      columns: {
        id: true,
        orderNumber: true,
        totalPrice: true,
        buyerFee: true,
        sellerFee: true,
        status: true,
        createdAt: true,
      },
      with: {
        buyer: {
          columns: { name: true, businessName: true },
        },
        seller: {
          columns: { name: true, businessName: true },
        },
      },
    });

    return {
      summary,
      byStatus,
      monthlyTrend,
      escrowBreakdown,
      topSellers,
      recentOrders,
    };
  }),

  // Get paginated finance transactions with filters
  getFinanceTransactions: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
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
        escrowStatus: z.string().optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const conditions = [];

      if (input.search) {
        conditions.push(like(orders.orderNumber, `%${input.search}%`));
      }

      if (input.status) {
        conditions.push(eq(orders.status, input.status));
      }

      if (input.escrowStatus) {
        conditions.push(eq(orders.escrowStatus, input.escrowStatus));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const transactionsList = await ctx.db.query.orders.findMany({
        where: whereClause,
        orderBy: [desc(orders.createdAt)],
        limit: input.limit,
        offset,
        columns: {
          id: true,
          orderNumber: true,
          quantitySqFt: true,
          pricePerSqFt: true,
          subtotal: true,
          buyerFee: true,
          sellerFee: true,
          totalPrice: true,
          sellerPayout: true,
          status: true,
          escrowStatus: true,
          paymentStatus: true,
          createdAt: true,
        },
        with: {
          buyer: {
            columns: { name: true, businessName: true },
          },
          seller: {
            columns: { name: true, businessName: true },
          },
          listing: {
            columns: { id: true, title: true },
          },
        },
      });

      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(orders)
        .where(whereClause);

      return {
        transactions: transactionsList,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  // ==========================================
  // Moderation Actions
  // ==========================================

  // Flag a listing (set to archived with moderation note)
  flagListing: adminProcedure
    .input(
      z.object({
        listingId: z.string().uuid(),
        reason: z.string().min(1, "Reason is required").max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const listing = await ctx.db.query.listings.findFirst({
        where: eq(listings.id, input.listingId),
      });

      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      if (listing.status === "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Listing is already archived/flagged",
        });
      }

      await ctx.db
        .update(listings)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(listings.id, input.listingId));

      // Notify the seller
      await ctx.db.insert(notifications).values({
        userId: listing.sellerId,
        type: "system",
        title: "Listing Flagged by Admin",
        message: `Your listing "${listing.title}" has been flagged and removed from the marketplace. Reason: ${input.reason}`,
        data: { listingId: listing.id },
        read: false,
      });

      return { success: true };
    }),

  // Unflag a listing (restore to active)
  unflagListing: adminProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const listing = await ctx.db.query.listings.findFirst({
        where: eq(listings.id, input.listingId),
      });

      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      if (listing.status !== "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Listing is not currently archived/flagged",
        });
      }

      await ctx.db
        .update(listings)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(listings.id, input.listingId));

      // Notify the seller
      await ctx.db.insert(notifications).values({
        userId: listing.sellerId,
        type: "system",
        title: "Listing Restored",
        message: `Your listing "${listing.title}" has been reviewed and restored to the marketplace.`,
        data: { listingId: listing.id },
        read: false,
      });

      return { success: true };
    }),

  // Suspend a user
  suspendUser: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        reason: z.string().min(1, "Reason is required").max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      if (user.role === "admin") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot suspend an admin user",
        });
      }

      if (!user.active) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is already suspended",
        });
      }

      await ctx.db
        .update(users)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      // Notify the user
      await ctx.db.insert(notifications).values({
        userId: input.userId,
        type: "system",
        title: "Account Suspended",
        message: `Your account has been suspended. Reason: ${input.reason}. Please contact support for more information.`,
        read: false,
      });

      return { success: true };
    }),

  // Unsuspend a user
  unsuspendUser: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      if (user.active) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is not currently suspended",
        });
      }

      await ctx.db
        .update(users)
        .set({ active: true, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      // Notify the user
      await ctx.db.insert(notifications).values({
        userId: input.userId,
        type: "system",
        title: "Account Reinstated",
        message: "Your account has been reinstated. You can now access PlankMarket again.",
        read: false,
      });

      return { success: true };
    }),

  // Force cancel an order
  forceCancelOrder: adminProcedure
    .input(
      z.object({
        orderId: z.string().uuid(),
        reason: z.string().min(1, "Reason is required").max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      const terminalStatuses = ["cancelled", "refunded", "delivered"];
      if (terminalStatuses.includes(order.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel an order with status "${order.status}"`,
        });
      }

      const updateData: Record<string, unknown> = {
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
        notes: `Admin force-cancelled: ${input.reason}`,
      };

      // Refund escrow if held
      if (order.escrowStatus === "held") {
        updateData.escrowStatus = "refunded";
      }

      await ctx.db
        .update(orders)
        .set(updateData)
        .where(eq(orders.id, input.orderId));

      // Notify both buyer and seller
      await ctx.db.insert(notifications).values([
        {
          userId: order.buyerId,
          type: "system" as const,
          title: "Order Cancelled by Admin",
          message: `Order ${order.orderNumber} has been cancelled by an administrator. Reason: ${input.reason}`,
          data: { orderId: order.id },
          read: false,
        },
        {
          userId: order.sellerId,
          type: "system" as const,
          title: "Order Cancelled by Admin",
          message: `Order ${order.orderNumber} has been cancelled by an administrator. Reason: ${input.reason}`,
          data: { orderId: order.id },
          read: false,
        },
      ]);

      return { success: true };
    }),

  // ==========================================
  // Platform Settings
  // ==========================================

  // Get all settings as a key-value map
  getSettings: adminProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db
      .select()
      .from(platformSettings);

    // Merge defaults with stored values
    const settingsMap: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const setting of settings) {
      settingsMap[setting.key] = setting.value;
    }

    return settingsMap;
  }),

  // Update a single setting (upsert)
  updateSetting: adminProcedure
    .input(
      z.object({
        key: z.string().min(1).max(100),
        value: z.unknown(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if setting exists
      const existing = await ctx.db
        .select()
        .from(platformSettings)
        .where(eq(platformSettings.key, input.key))
        .limit(1);

      if (existing.length > 0) {
        await ctx.db
          .update(platformSettings)
          .set({
            value: input.value,
            updatedAt: new Date(),
            updatedBy: ctx.user.id,
          })
          .where(eq(platformSettings.key, input.key));
      } else {
        await ctx.db.insert(platformSettings).values({
          key: input.key,
          value: input.value,
          updatedBy: ctx.user.id,
        });
      }

      return { success: true };
    }),

  // Batch update settings
  updateSettings: adminProcedure
    .input(
      z.array(
        z.object({
          key: z.string().min(1).max(100),
          value: z.unknown(),
        })
      )
    )
    .mutation(async ({ ctx, input }) => {
      for (const { key, value } of input) {
        const existing = await ctx.db
          .select()
          .from(platformSettings)
          .where(eq(platformSettings.key, key))
          .limit(1);

        if (existing.length > 0) {
          await ctx.db
            .update(platformSettings)
            .set({
              value,
              updatedAt: new Date(),
              updatedBy: ctx.user.id,
            })
            .where(eq(platformSettings.key, key));
        } else {
          await ctx.db.insert(platformSettings).values({
            key,
            value,
            updatedBy: ctx.user.id,
          });
        }
      }

      return { success: true, count: input.length };
    }),

  // ==========================================
  // Priority1 Shipment Management
  // ==========================================

  // Get paginated shipments with filters
  getShipments: adminProcedure
    .input(
      z.object({
        status: z.enum(shipmentStatusEnum.enumValues).optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const conditions = [];

      if (input.status) {
        conditions.push(eq(shipments.status, input.status));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const shipmentsList = await ctx.db.query.shipments.findMany({
        where: whereClause,
        orderBy: [desc(shipments.createdAt)],
        limit: input.limit,
        offset,
        with: {
          order: {
            columns: {
              id: true,
              orderNumber: true,
              buyerId: true,
              sellerId: true,
              carrierRate: true,
              shippingPrice: true,
              shippingMargin: true,
            },
          },
        },
      });

      // Get total count
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(shipments)
        .where(whereClause);

      return {
        items: shipmentsList,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  // Re-poll shipment status from Priority1
  repollShipment: adminProcedure
    .input(
      z.object({
        shipmentId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const shipment = await ctx.db.query.shipments.findFirst({
        where: eq(shipments.id, input.shipmentId),
      });

      if (!shipment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Shipment not found",
        });
      }

      if (!shipment.proNumber && !shipment.priority1ShipmentId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Shipment has no tracking identifier (PRO number or Priority1 ID)",
        });
      }

      // Get status from Priority1
      const statusResponse = await priority1.getStatus({
        identifierType: "BILL_OF_LADING",
        identifierValue: shipment.proNumber || shipment.priority1ShipmentId!,
      });

      if (!statusResponse.shipments || statusResponse.shipments.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No tracking information found from Priority1",
        });
      }

      const p1Shipment = statusResponse.shipments[0];

      // Map Priority1 status to our status enum (same logic as shipment-tracking.ts)
      let mappedStatus = shipment.status;
      const p1Status = p1Shipment.status?.toLowerCase() || "";
      if (p1Status.includes("deliver") || p1Status === "completed") {
        mappedStatus = "delivered";
      } else if (p1Status.includes("out for delivery")) {
        mappedStatus = "out_for_delivery";
      } else if (
        p1Status.includes("transit") ||
        p1Status.includes("en-route") ||
        p1Status.includes("picked up")
      ) {
        mappedStatus = "in_transit";
      } else if (
        p1Status.includes("exception") ||
        p1Status.includes("error")
      ) {
        mappedStatus = "exception";
      }

      // Map tracking events
      const trackingEvents: TrackingEvent[] = (
        p1Shipment.trackingStatuses || []
      ).map((ts) => ({
        timestamp: ts.timeStamp,
        status: ts.status,
        location: [ts.city, ts.state].filter(Boolean).join(", "),
        description: ts.statusReason || ts.status,
      }));

      // Update shipment
      const [updatedShipment] = await ctx.db
        .update(shipments)
        .set({
          status: mappedStatus,
          trackingEvents,
          carrierScac: p1Shipment.carrierCode || shipment.carrierScac,
          carrierName: p1Shipment.carrierName || shipment.carrierName,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, input.shipmentId))
        .returning();

      return updatedShipment;
    }),

  // Get shipping aggregate statistics
  getShippingStats: adminProcedure.query(async ({ ctx }) => {
    // Get shipment counts
    const [shipmentCounts] = await ctx.db
      .select({
        totalShipments: sql<number>`cast(count(*) as integer)`,
        activeShipments: sql<number>`cast(count(*) filter (where status IN ('dispatched', 'in_transit', 'out_for_delivery')) as integer)`,
      })
      .from(shipments);

    // Get revenue totals from orders with shipments (join to ensure they have shipping)
    const [revenueTotals] = await ctx.db
      .select({
        totalRevenue: sql<number>`coalesce(sum(${orders.shippingPrice}), 0)`,
        totalMargin: sql<number>`coalesce(sum(${orders.shippingMargin}), 0)`,
      })
      .from(orders)
      .innerJoin(shipments, eq(shipments.orderId, orders.id));

    return {
      totalShipments: shipmentCounts.totalShipments,
      activeShipments: shipmentCounts.activeShipments,
      totalRevenue: revenueTotals.totalRevenue,
      totalMargin: revenueTotals.totalMargin,
    };
  }),
});
