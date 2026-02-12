"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore();
  const utils = trpc.useUtils();

  useEffect(() => {
    const supabase = createClient();

    // Check initial session
    const initAuth = async () => {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        try {
          const result = await utils.auth.getSession.fetch();
          if (result.isAuthenticated && result.user) {
            setUser(result.user);
          } else {
            setUser(null);
          }
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    };

    initAuth();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        try {
          const result = await utils.auth.getSession.fetch();
          if (result.isAuthenticated && result.user) {
            setUser(result.user);
          } else {
            setUser(null);
          }
        } catch {
          setUser(null);
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setLoading, utils]);

  return <>{children}</>;
}
