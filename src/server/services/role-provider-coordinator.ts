// Candidate target: src/server/services/role-provider-coordinator.ts
import postgres from "postgres";
import { TRPCError } from "@trpc/server";
import { env } from "@/env";

export type RoleProviderCoordinator = <T>(userId: string, work: () => Promise<T>) => Promise<T>;

// This connection is independent of the main DB pool (deployed default max=1).
// Exactly one additional connection and one local admitted request per process.
// No queued requests retain an idle transaction while waiting for another user.
let admitted = false;
let client: ReturnType<typeof postgres> | undefined;
export const withRoleProviderCoordinator: RoleProviderCoordinator = async (userId, work) => {
  if (admitted) throw new TRPCError({ code: "CONFLICT", message: "An account update is in progress. Please retry shortly." });
  admitted = true;
  try {
    client ??= postgres(env.DATABASE_URL, {
      max: 1, prepare: false, connect_timeout: 5, idle_timeout: 5,
      connection: {
        application_name: "plankmarket-role-coordinator",
        statement_timeout: 5000,
        idle_in_transaction_session_timeout: 90000,
      },
    });
    const result = await client.begin(async lock => {
      const rows = await lock.unsafe<{ owned: boolean }[]>(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS owned", ["plankmarket-role:" + userId],
      );
      if (!rows[0]?.owned) throw new TRPCError({ code: "CONFLICT", message: "This account is being updated. Please retry shortly." });
      // No users/application row locks occur on this connection. State commits
      // use the main DB pool. Durable write receipts remain authoritative if
      // this connection dies or a transport timeout precedes remote completion.
      return { value: await work() };
    });
    return result.value;
  } finally {
    admitted = false;
  }
};
