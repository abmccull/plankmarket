// Candidate target: src/server/services/role-provider-write-session.ts
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "@/server/db";
import { users, roleProviderWrites, type RoleProviderWrite, type RoleWritePurpose } from "@/server/db/schema";
import type { SellerActivationRoleProvider } from "./seller-activation-provider";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Pick<Database, "select">;
type External = Awaited<ReturnType<SellerActivationRoleProvider["readUser"]>>;
type Patch = Omit<Parameters<SellerActivationRoleProvider["patchRole"]>[1], "plankmarket_role_write">;
const pending = () => new TRPCError({ code: "PRECONDITION_FAILED", message: "The previous account update has not been confirmed. Retry confirmation shortly; contact support if it remains pending." });
const changed = () => new TRPCError({ code: "CONFLICT", message: "The account changed during this update. Reload before continuing." });

async function latestWrite(reader: Reader, userId: string) {
  const [row] = await reader.select().from(roleProviderWrites).where(eq(roleProviderWrites.userId, userId))
    .orderBy(desc(roleProviderWrites.version)).limit(1);
  return row;
}
function matches(external: External, row: RoleProviderWrite) {
  return external.id === row.authId && external.appMetadata.role === row.expectedRole &&
    (external.appMetadata.plankmarket_seller_activation ?? null) === row.activationMarker &&
    external.appMetadata.plankmarket_role_write === row.id;
}

/** Call only inside withRoleProviderCoordinator. Each receipt commits separately
 * from provider I/O. No activation claim or timeout may clear an issued write. */
export async function openRoleProviderWriteSession(db: Database, userId: string, provider: SellerActivationRoleProvider) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
  const authId = user.authId;
  let latest = await latestWrite(db, userId);
  let external: External | undefined;

  async function read() {
    const value = await provider.readUser(authId);
    if (value.id !== authId) throw changed();
    external = value;
    return value;
  }
  async function lockAndCheck(tx: Transaction, allowUnconfirmed: boolean) {
    const [current] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!current || current.authId !== authId) throw changed();
    const recorded = await latestWrite(tx, userId);
    if ((recorded?.id ?? null) !== (latest?.id ?? null)) throw changed();
    if (recorded && !recorded.confirmedAt && !allowUnconfirmed) throw pending();
    return current;
  }
  async function confirm() {
    if (!latest || !external || !matches(external, latest)) throw pending();
    if (latest.confirmedAt) return;
    const id = latest.id;
    const confirmed = await db.transaction(async tx => {
      await lockAndCheck(tx, true);
      const [row] = await tx.update(roleProviderWrites).set({ confirmedAt: sql`clock_timestamp()` })
        .where(and(eq(roleProviderWrites.id, id), isNull(roleProviderWrites.confirmedAt))).returning();
      if (!row) throw changed();
      return row;
    });
    latest = confirmed;
  }

  if (latest && !latest.confirmedAt) {
    if (latest.authId !== authId) throw pending();
    // A negative read, local abort, old activation claim or elapsed time is
    // never settlement. Only this exact issued marker and payload can confirm.
    await read();
    await confirm();
  }

  return {
    read,
    async ensure(patch: Patch, purpose: RoleWritePurpose, sourceId: string | null, forceNewReceipt = false) {
      external ??= await read();
      if (!forceNewReceipt && latest?.confirmedAt && matches(external, latest) && latest.expectedRole === patch.role &&
          latest.activationMarker === patch.plankmarket_seller_activation) return external;
      const id = randomUUID();
      const issued = await db.transaction(async tx => {
        await lockAndCheck(tx, false);
        const [row] = await tx.insert(roleProviderWrites).values({
          id, version: (latest?.version ?? 0) + 1, userId, authId,
          expectedRole: patch.role, activationMarker: patch.plankmarket_seller_activation,
          purpose, sourceId,
        }).returning();
        return row;
      });
      latest = issued;
      // Persist BEFORE the call. A crash before actual send is conservatively
      // uncertain; never retry a second PUT while this receipt is unconfirmed.
      try {
        await provider.patchRole(authId, { ...patch, plankmarket_role_write: id });
      } catch {
        // A timeout/rejection without exact read-back remains unresolved.
      }
      await read();
      await confirm();
      return external!;
    },
    /** Use inside final state transaction. The user lock orders newer receipt
     * inserts against finalization even if the advisory connection was lost. */
    async assertCurrent(tx: Transaction) {
      return lockAndCheck(tx, false);
    },
    receiptId() { return latest?.id ?? null; },
    currentIsConfirmed(purpose?: RoleWritePurpose) {
      return Boolean(latest?.confirmedAt && (!purpose || latest.purpose === purpose) && external && matches(external, latest));
    },
  };
}
