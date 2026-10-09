// Candidate target: src/server/services/resume-account-setup.ts
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "@/server/db";
import { users } from "@/server/db/schema";
import { withRoleProviderCoordinator } from "./role-provider-coordinator";
import { openRoleProviderWriteSession } from "./role-provider-write-session";
import { sellerActivationRoleProvider } from "./seller-activation-provider";

/** Authenticated recovery of the caller's existing unverified initial role.
 * There is no user-id or role input in the router that exposes this operation. */
export async function resumeAccountSetup(db: Database, userId: string, authenticatedAuthId: string) {
  return withRoleProviderCoordinator(userId, async () => {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user || user.authId !== authenticatedAuthId || !user.active || user.role === "admin" ||
        user.verified || user.verificationStatus !== "unverified") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This account needs support review. Contact support from your account email." });
    }
    const session = await openRoleProviderWriteSession(db, userId, await sellerActivationRoleProvider());
    const external = await session.read();
    if (external.appMetadata.plankmarket_seller_activation != null ||
        (external.appMetadata.plankmarket_role_write != null && !session.currentIsConfirmed("registration")) ||
        (session.receiptId() !== null && !session.currentIsConfirmed("registration"))) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Your account update needs support confirmation. No new update was sent." });
    }
    if (external.appMetadata.role !== user.role) {
      if (external.appMetadata.role != null || external.appMetadata.plankmarket_seller_activation != null ||
          external.appMetadata.plankmarket_role_write != null || session.receiptId() !== null) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Your account update needs support confirmation. No new update was sent." });
      }
      // Receipt absent + no provider authority: initialize only the already
      // selected DB role. A new issued receipt precedes the first possible PUT.
      await session.ensure({ role: user.role, plankmarket_seller_activation: null }, "registration", null);
    }
    await db.transaction(async tx => {
      const current = await session.assertCurrent(tx);
      if (!current.active || current.authId !== authenticatedAuthId || current.role !== user.role ||
          current.verified || current.verificationStatus !== "unverified") {
        throw new TRPCError({ code: "CONFLICT", message: "Your account changed. Reload before continuing." });
      }
    });
    return { complete: true as const, role: user.role };
  });
}
