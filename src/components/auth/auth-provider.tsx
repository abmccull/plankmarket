"use client";

import { useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";
import { observeConnectAuthIdentity, observeConnectProfileOwner } from "@/lib/stripe/connect-session-lifetime";

const LOGOUT_CHANNEL = "plankmarket-logout";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading, logout } = useAuthStore();
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const generation = useRef(0);
  const active = useRef(false);
  const authIdentity = useRef<string | null>(null);

  const clearQueries = useCallback(async (attempt: number) => {
    await queryClient.cancelQueries();
    if (!active.current || generation.current !== attempt) return false;
    queryClient.removeQueries();
    return true;
  }, [queryClient]);

  const endSession = useCallback((broadcast: boolean) => {
    const attempt = ++generation.current;
    authIdentity.current = null;
    observeConnectAuthIdentity(null);
    setUser(null);
    setLoading(true);
    void clearQueries(attempt)
      .catch(() => { /* Local identity remains cleared if cache cleanup fails. */ })
      .finally(() => {
        // Settle after removal so mounted public reads can observe the new cache.
        if (active.current && generation.current === attempt) logout();
      });
    if (broadcast && typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(LOGOUT_CHANNEL);
      channel.postMessage("logout");
      channel.close();
    }
  }, [clearQueries, logout, setLoading, setUser]);

  const syncServerSession = useCallback(async (session: Session, attempt: number, refreshRelated: boolean) => {
    const current = () => active.current && generation.current === attempt;
    if (!current()) return;
    observeConnectAuthIdentity(session.user.id);
    const changedAccount = authIdentity.current !== session.user.id;
    if (changedAccount) setUser(null);
    if (changedAccount || !useAuthStore.getState().user) setLoading(true);
    try {
      if (changedAccount && !await clearQueries(attempt)) return;
      if (!current()) return;
      // Commit identity only after its cache boundary has completed. A newer
      // event for this identity must not inherit an unfinished cache clear.
      authIdentity.current = session.user.id;
      await utils.auth.getSession.cancel();
      if (!current()) return;
      const result = await utils.auth.getSession.fetch(undefined, { staleTime: 0 });
      if (!current()) return;
      const expectedEmail = session.user.email?.trim().toLowerCase();
      if (!result.isAuthenticated || !result.user || !expectedEmail || result.user.email.trim().toLowerCase() !== expectedEmail) {
        if (!result.isAuthenticated || !result.user) observeConnectAuthIdentity(null);
        setUser(null);
        return;
      }
      observeConnectProfileOwner(result.user.id);
      setUser(result.user);
      if (refreshRelated) void queryClient.invalidateQueries().catch(() => { /* Individual screens retain their read recovery. */ });
    } catch (error) {
      const code = error && typeof error === "object" && "data" in error && error.data && typeof error.data === "object" && "code" in error.data ? error.data.code : undefined;
      // An interrupted same-account refresh must leave its last trusted profile
      // available for explicit recovery. Account changes and denied sessions clear.
      if (current() && (changedAccount || code === "UNAUTHORIZED" || code === "FORBIDDEN")) setUser(null);
    } finally {
      if (current()) setLoading(false);
    }
  }, [clearQueries, queryClient, setLoading, setUser, utils]);

  useEffect(() => {
    active.current = true;
    const supabase = createClient();
    const attempt = ++generation.current;
    setLoading(true);
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active.current || generation.current !== attempt) return;
      if (session) return syncServerSession(session, attempt, false);
      endSession(false);
    }).catch(() => {
      if (active.current && generation.current === attempt) endSession(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active.current) return;
      if (event === "SIGNED_OUT") {
        endSession(true);
      } else if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED")) {
        const nextAttempt = ++generation.current;
        void syncServerSession(session, nextAttempt, event !== "TOKEN_REFRESHED");
      }
    });
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(LOGOUT_CHANNEL);
    if (channel) channel.onmessage = (event) => { if (event.data === "logout") endSession(false); };
    return () => {
      active.current = false;
      generation.current += 1;
      subscription.unsubscribe();
      channel?.close();
    };
  }, [endSession, setLoading, syncServerSession]);

  return <>{children}</>;
}
