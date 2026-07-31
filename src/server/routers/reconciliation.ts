import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import {
  reconciliationCaseEvents,
  reconciliationCases,
} from "@/server/db/schema";
import { adminProcedure, createTRPCRouter } from "../trpc";

const caseStatusSchema = z.enum([
  "open",
  "in_progress",
  "waiting_external",
  "resolved",
  "dismissed",
]);
const caseSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
const caseTypeSchema = z.enum([
  "payment_mismatch",
  "payout_failure",
  "refund_failure",
  "shipment_ambiguity",
  "provider_failure",
  "webhook_failure",
  "email_delivery",
  "promotion_refund",
  "dispute_resolution",
  "data_integrity",
  "other",
]);

export const reconciliationRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z.object({
        status: z.union([caseStatusSchema, z.literal("active")]).optional(),
        severity: caseSeveritySchema.optional(),
        type: caseTypeSchema.optional(),
        assignment: z.enum(["all", "unassigned", "mine"]).default("all"),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [];
      if (input.status === "active") {
        conditions.push(
          inArray(reconciliationCases.status, [
            "open",
            "in_progress",
            "waiting_external",
          ]),
        );
      } else if (input.status) {
        conditions.push(eq(reconciliationCases.status, input.status));
      }
      if (input.severity) {
        conditions.push(eq(reconciliationCases.severity, input.severity));
      }
      if (input.type) {
        conditions.push(eq(reconciliationCases.type, input.type));
      }
      if (input.assignment === "unassigned") {
        conditions.push(isNull(reconciliationCases.assignedTo));
      } else if (input.assignment === "mine") {
        conditions.push(eq(reconciliationCases.assignedTo, ctx.user.id));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;
      const offset = (input.page - 1) * input.limit;

      const [items, countRows, openCountRows] = await Promise.all([
        ctx.db.query.reconciliationCases.findMany({
          where: whereClause,
          orderBy: [
            asc(reconciliationCases.status),
            desc(reconciliationCases.severity),
            asc(reconciliationCases.firstDetectedAt),
          ],
          limit: input.limit,
          offset,
          with: {
            order: {
              columns: {
                id: true,
                orderNumber: true,
                status: true,
                paymentStatus: true,
                escrowStatus: true,
              },
            },
            dispute: {
              columns: { id: true, status: true, reason: true },
            },
            assignee: {
              columns: { id: true, name: true, email: true },
            },
          },
        }),
        ctx.db
          .select({ count: sql<number>`cast(count(*) as integer)` })
          .from(reconciliationCases)
          .where(whereClause),
        ctx.db
          .select({
            count: sql<number>`cast(count(*) as integer)`,
            critical: sql<number>`cast(count(*) filter (where ${reconciliationCases.severity} = 'critical') as integer)`,
          })
          .from(reconciliationCases)
          .where(
            inArray(reconciliationCases.status, [
              "open",
              "in_progress",
              "waiting_external",
            ]),
          ),
      ]);

      const count = countRows[0]?.count ?? 0;
      return {
        items,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
        openCount: openCountRows[0]?.count ?? 0,
        criticalOpenCount: openCountRows[0]?.critical ?? 0,
      };
    }),

  getById: adminProcedure
    .input(z.object({ caseId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const caseRecord = await ctx.db.query.reconciliationCases.findFirst({
        where: eq(reconciliationCases.id, input.caseId),
        with: {
          order: true,
          dispute: true,
          assignee: {
            columns: { id: true, name: true, email: true },
          },
          creator: {
            columns: { id: true, name: true },
          },
          resolver: {
            columns: { id: true, name: true },
          },
          events: {
            orderBy: [desc(reconciliationCaseEvents.createdAt)],
            with: {
              actor: {
                columns: { id: true, name: true, email: true },
              },
            },
          },
        },
      });
      if (!caseRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Reconciliation case not found",
        });
      }
      return caseRecord;
    }),

  updateStatus: adminProcedure
    .input(
      z.object({
        caseId: z.string().uuid(),
        status: caseStatusSchema,
        resolution: z.string().trim().min(10).max(5000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const terminal =
        input.status === "resolved" || input.status === "dismissed";
      if (terminal && !input.resolution) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A resolution is required to close a case",
        });
      }

      return ctx.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(reconciliationCases)
          .where(eq(reconciliationCases.id, input.caseId))
          .for("update");
        if (!current) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Reconciliation case not found",
          });
        }

        const eventType =
          terminal
            ? "resolved"
            : ["resolved", "dismissed"].includes(current.status)
              ? "reopened"
              : "status_changed";
        const now = new Date();
        const [updated] = await tx
          .update(reconciliationCases)
          .set({
            status: input.status,
            resolution: terminal ? input.resolution : null,
            resolvedAt: terminal ? now : null,
            resolvedBy: terminal ? ctx.user.id : null,
            updatedAt: now,
          })
          .where(eq(reconciliationCases.id, input.caseId))
          .returning();

        await tx.insert(reconciliationCaseEvents).values({
          caseId: input.caseId,
          actorId: ctx.user.id,
          eventType,
          message: terminal
            ? `Case ${input.status}: ${input.resolution}`
            : `Status changed from ${current.status} to ${input.status}`,
          metadata: {
            previousStatus: current.status,
            nextStatus: input.status,
          },
        });
        return updated;
      });
    }),

  assign: adminProcedure
    .input(
      z.object({
        caseId: z.string().uuid(),
        assigneeId: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [current] = await tx
          .select({
            id: reconciliationCases.id,
            assignedTo: reconciliationCases.assignedTo,
            status: reconciliationCases.status,
          })
          .from(reconciliationCases)
          .where(eq(reconciliationCases.id, input.caseId))
          .for("update");
        if (!current) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Reconciliation case not found",
          });
        }

        if (input.assigneeId) {
          const assignee = await tx.query.users.findFirst({
            where: (users, { and: andWhere, eq: equals }) =>
              andWhere(
                equals(users.id, input.assigneeId!),
                equals(users.role, "admin"),
                equals(users.active, true),
              ),
            columns: { id: true },
          });
          if (!assignee) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cases can only be assigned to an active administrator",
            });
          }
        }

        const [updated] = await tx
          .update(reconciliationCases)
          .set({
            assignedTo: input.assigneeId,
            status:
              input.assigneeId &&
              current.assignedTo === null &&
              current.status !== "resolved" &&
              current.status !== "dismissed"
                ? "in_progress"
                : undefined,
            updatedAt: new Date(),
          })
          .where(eq(reconciliationCases.id, input.caseId))
          .returning();
        await tx.insert(reconciliationCaseEvents).values({
          caseId: input.caseId,
          actorId: ctx.user.id,
          eventType: "assigned",
          message: input.assigneeId
            ? "Case assigned to an administrator"
            : "Case returned to the unassigned queue",
          metadata: {
            previousAssigneeId: current.assignedTo,
            nextAssigneeId: input.assigneeId,
          },
        });
        return updated;
      });
    }),

  addNote: adminProcedure
    .input(
      z.object({
        caseId: z.string().uuid(),
        message: z.string().trim().min(2).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [caseRecord] = await tx
          .select({ id: reconciliationCases.id })
          .from(reconciliationCases)
          .where(eq(reconciliationCases.id, input.caseId))
          .for("update");
        if (!caseRecord) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Reconciliation case not found",
          });
        }
        const [event] = await tx
          .insert(reconciliationCaseEvents)
          .values({
            caseId: input.caseId,
            actorId: ctx.user.id,
            eventType: "note",
            message: input.message,
            metadata: {},
          })
          .returning();
        await tx
          .update(reconciliationCases)
          .set({ updatedAt: new Date() })
          .where(eq(reconciliationCases.id, input.caseId));
        return event;
      });
    }),
});
