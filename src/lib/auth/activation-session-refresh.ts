import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/stores/auth-store";

type Session = inferRouterOutputs<AppRouter>["auth"]["getSession"];

/** Install only an owned server profile, never a role inferred from an application. */
export async function refreshActivationAccount(input: {
  ownerId: string;
  current: () => boolean;
  readSession: () => Promise<Session>;
}) {
  if (!input.current()) throw new Error("Account changed");
  const auth = createClient().auth;
  const before = await auth.getSession();
  if (before.error || !before.data.session || !input.current()) throw new Error("Sign in again to refresh your account.");
  const authId = before.data.session.user.id;
  const refreshed = await auth.refreshSession();
  if (refreshed.error || refreshed.data.session?.user.id !== authId || !input.current()) {
    throw new Error("Your application is saved. We could not refresh this account yet.");
  }
  const session = await input.readSession();
  if (!input.current() || !session.isAuthenticated || session.user?.id !== input.ownerId ||
      !session.user.verified || session.user.verificationStatus !== "verified" || session.user.role !== "seller") {
    throw new Error("Selling is not confirmed in your current session. Refresh your account again.");
  }
  useAuthStore.getState().setUser(session.user);
  return session.user;
}
