import { eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db";
import { agentConfigs, users } from "@/server/db/schema";
import { isPro } from "@/lib/pro";

export type AgentTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

/** Settings UPSERT takes this same row lock. OFF cannot acknowledge while a
 * new automated decision is still inside its database transaction. */
export async function lockAgentConfig(tx: AgentTransaction, userId: string) {
  const locked = await tx.execute(
    sql`select id from ${agentConfigs} where ${agentConfigs.userId} = ${userId} for update`,
  );
  if (!locked.length) return undefined;
  return tx.query.agentConfigs.findFirst({
    where: eq(agentConfigs.userId, userId),
  });
}

/** Preserve in-flight Inngest discovery checkpoints from earlier releases. */
export function agentOwnerId(value: unknown): string {
  const row = value as { userId?: string; users?: { id?: string } };
  const id = row.userId ?? row.users?.id;
  if (!id)
    throw new Error("Automation owner checkpoint is missing its user ID");
  return id;
}

export async function getEligibleAgentUser(
  tx: AgentTransaction,
  userId: string,
  sellerOnly = false,
) {
  const user = await tx.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user?.active || !isPro(user)) return null;
  if (
    sellerOnly &&
    user.role !== "admin" &&
    (user.role !== "seller" || user.verificationStatus !== "verified")
  )
    return null;
  return user;
}
