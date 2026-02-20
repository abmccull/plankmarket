"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SESSION_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOGOUT_CHANNEL = "plankmarket-logout";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading, logout } = useAuthStore();
  const utils = trpc.useUtils();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionStart = useRef<number>(Date.now());

  const performLogout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    logout();
  }, [logout]);

  // Idle timeout: reset on user activity
  useEffect(() => {
    const resetIdle = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);

      // Check forced session expiry
      if (Date.now() - sessionStart.current > MAX_SESSION_MS) {
        performLogout();
        return;
      }

      idleTimer.current = setTimeout(() => {
        performLogout();
      }, IDLE_TIMEOUT_MS);
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }));
    resetIdle();

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      events.forEach((e) => window.removeEventListener(e, resetIdle));
    };
  }, [performLogout]);

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

  useEffect(() => {
    const supabase = createClient();

    // Check initial session
    const initAuth = async () => {
      setLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          sessionStart.current = Date.now();
          const result = await utils.auth.getSession.fetch();
          if (result.isAuthenticated && result.user) {
            setUser(result.user);
          } else {
            setUser(null);
          }
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

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        sessionStart.current = Date.now();
        setLoading(true);
        try {
          const result = await utils.auth.getSession.fetch();
          if (result.isAuthenticated && result.user) {
            setUser(result.user);
          } else {
            setUser(null);
          }
        } catch {
          setUser(null);
        } finally {
          setLoading(false);
        }
      } else if (event === "SIGNED_OUT") {
        broadcastLogout();
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setLoading, utils, broadcastLogout]);

  return <>{children}</>;
}
