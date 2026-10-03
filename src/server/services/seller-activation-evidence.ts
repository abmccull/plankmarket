import { and, eq, gt, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "@/server/db";
import { sellerActivationRequests, users } from "@/server/db/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Persisted paths bind an upload to its original application, including retry after freezing. */
export function sellerActivationUploadOrigin(row: { id: string; userId: string; objectPath: string }): string {
  const [ownerId, phase, applicationId, documentId, ...extra] = row.objectPath.split("/");
  if (extra.length || ownerId !== row.userId || documentId !== row.id ||
      !["incoming", "ready"].includes(phase) ||
      !UUID.test(ownerId) || !UUID.test(applicationId) || !UUID.test(documentId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This upload is no longer available. Choose your document again." });
  }
  return applicationId;
}

/** Caller must retain this transaction through the metadata mutation. Lock order: user → application → document. */
export async function lockEditableSellerActivationUpload(tx: Transaction, userId: string, applicationId?: string, now = new Date()) {
  const [user] = await tx.select({ id: users.id, role: users.role, active: users.active })
    .from(users).where(eq(users.id, userId)).for("update");
  if (!user?.active || user.role !== "buyer") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Selling setup is unavailable for this account." });
  }
  const [application] = await tx.select({ id: sellerActivationRequests.id })
    .from(sellerActivationRequests)
    .where(and(
      eq(sellerActivationRequests.userId, userId),
      ...(applicationId ? [eq(sellerActivationRequests.id, applicationId)] : []),
      eq(sellerActivationRequests.status, "draft"),
      eq(sellerActivationRequests.syncState, "none"),
      gt(sellerActivationRequests.purgeAfter, now),
      isNull(sellerActivationRequests.evidencePurgedAt),
    )).limit(1).for("update");
  if (!application) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Open an editable selling application before uploading your document." });
  }
  return application.id;
}
