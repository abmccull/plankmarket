"use client";

import { useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";

const LOGOUT_CHANNEL = "plankmarket-logout";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading, logout } = useAuthStore();
  const utils = trpc.useUtils();

  // Cross-tab logout sync
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(LOGOUT_CHANNEL);
    channel.onmessage = (event) => {
      if (event.data === "logout") {
        logout();
      }
    };

    return () => channel.close();
  }, [logout]);

  // Broadcast logout to other tabs when signing out
  const broadcastLogout = useCallback(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(LOGOUT_CHANNEL);
    channel.postMessage("logout");
    channel.close();
  }, []);

  const syncServerSession = useCallback(
    async (forceInvalidate = false) => {
      if (forceInvalidate) {
        await utils.invalidate();
      }

      const result = await utils.auth.getSession.fetch();
      if (result.isAuthenticated && result.user) {
        setUser(result.user);
        return true;
      }

      setUser(null);
      return false;
    },
    [setUser, utils],
  );

  useEffect(() => {
    const supabase = createClient();

    const initAuth = async () => {
      setLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          await syncServerSession();
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (
        session &&
        (event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED")
      ) {
        setLoading(true);
        try {
          await syncServerSession(event !== "TOKEN_REFRESHED");
        } catch {
          setUser(null);
        } finally {
          setLoading(false);
        }
      } else if (event === "SIGNED_OUT") {
        broadcastLogout();
        await utils.invalidate();
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setLoading, utils, broadcastLogout, syncServerSession]);

  return <>{children}</>;
}
